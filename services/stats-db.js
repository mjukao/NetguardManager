const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('../config');
const logger = require('./logger');

const POLL_INTERVAL_SEC = 5 * 60;
const MAX_GAP_FILL_ROWS = 288; // 1 วัน (288 * 5 นาที = 24 ชม.) กันกรณี manager ดับนานมาก
const RETENTION_DAYS = 60;

let db = null;

function initDb() {
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS samples (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      bot_name    TEXT NOT NULL,
      ts          INTEGER NOT NULL,
      state       TEXT NOT NULL,
      partial     INTEGER DEFAULT 0,
      problems_total    INTEGER,
      problems_disaster INTEGER,
      problems_high     INTEGER,
      problems_average  INTEGER,
      problems_warning  INTEGER,
      hosts_total    INTEGER, hosts_up    INTEGER,
      aps_total      INTEGER, aps_up      INTEGER,
      switches_total INTEGER, switches_up INTEGER,
      cameras_total  INTEGER, cameras_up  INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_samples_bot_ts ON samples(bot_name, ts);

    CREATE TABLE IF NOT EXISTS daily (
      bot_name     TEXT NOT NULL,
      day          TEXT NOT NULL,
      samples      INTEGER,
      up_count     INTEGER,
      down_count   INTEGER,
      unknown_count INTEGER,
      uptime_pct   REAL,
      avg_problems REAL,
      max_problems INTEGER,
      PRIMARY KEY (bot_name, day)
    );
  `);

  logger.info(`stats-db: initialized at ${config.dbPath}`);
  return db;
}

function getDb() {
  if (!db) throw new Error('stats-db: not initialized — call initDb() first');
  return db;
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

let insertStatement = null;
function insertStmt() {
  if (!insertStatement) {
    insertStatement = getDb().prepare(`
      INSERT INTO samples (
        bot_name, ts, state, partial,
        problems_total, problems_disaster, problems_high, problems_average, problems_warning,
        hosts_total, hosts_up, aps_total, aps_up, switches_total, switches_up, cameras_total, cameras_up
      ) VALUES (
        @bot_name, @ts, @state, @partial,
        @problems_total, @problems_disaster, @problems_high, @problems_average, @problems_warning,
        @hosts_total, @hosts_up, @aps_total, @aps_up, @switches_total, @switches_up, @cameras_total, @cameras_up
      )
    `);
  }
  return insertStatement;
}

// data = { state, partial, problems, devices, ts } — ts เป็น optional (default = ตอนนี้)
// ใช้ตอนเติมช่องว่างย้อนหลังใน fillUnknownGaps()
function insertSample(botName, data = {}) {
  const { state, partial = false, problems = {}, devices = {}, ts = Math.floor(Date.now() / 1000) } = data;
  insertStmt().run({
    bot_name: botName,
    ts,
    state,
    partial: partial ? 1 : 0,
    problems_total:    problems.total    ?? null,
    problems_disaster: problems.disaster ?? null,
    problems_high:     problems.high     ?? null,
    problems_average:  problems.average  ?? null,
    problems_warning:  problems.warning  ?? null,
    hosts_total:    devices.hosts?.total    ?? null,
    hosts_up:       devices.hosts?.up       ?? null,
    aps_total:      devices.aps?.total      ?? null,
    aps_up:         devices.aps?.up         ?? null,
    switches_total: devices.switches?.total ?? null,
    switches_up:    devices.switches?.up    ?? null,
    cameras_total:  devices.cameras?.total  ?? null,
    cameras_up:     devices.cameras?.up     ?? null,
  });
}

function getSamples(botName, fromTs, toTs) {
  return getDb().prepare(`
    SELECT * FROM samples WHERE bot_name = ? AND ts >= ? AND ts <= ? ORDER BY ts ASC
  `).all(botName, fromTs, toTs);
}

function getLastSampleTs(botName) {
  const row = getDb().prepare(`SELECT MAX(ts) AS ts FROM samples WHERE bot_name = ?`).get(botName);
  return row && row.ts != null ? row.ts : null;
}

function getDailyStats(botName, days = 30) {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  return getDb().prepare(`
    SELECT * FROM daily WHERE bot_name = ? AND day >= ? ORDER BY day ASC
  `).all(botName, cutoff);
}

function computeUptimePct(up, down) {
  const denom = up + down;
  return denom > 0 ? Math.round((up / denom) * 1000) / 10 : null;
}

// สำคัญ: uptime คำนวณจาก up / (up + down) เท่านั้น — ไม่นับ unknown เป็น downtime
// เพราะ unknown แปลว่า manager เองไม่ได้ poll (restart/downtime ของ manager) ไม่ใช่ความผิดของ bot
function getUptimeSummary(botName) {
  const now = Math.floor(Date.now() / 1000);
  const samples24h = getSamples(botName, now - 24 * 3600, now);
  const up24h   = samples24h.filter((s) => s.state === 'up').length;
  const down24h = samples24h.filter((s) => s.state === 'down').length;

  const sumDaily = (rows) => rows.reduce(
    (acc, r) => ({ up: acc.up + (r.up_count || 0), down: acc.down + (r.down_count || 0) }),
    { up: 0, down: 0 }
  );
  const d7  = sumDaily(getDailyStats(botName, 7));
  const d30 = sumDaily(getDailyStats(botName, 30));

  return {
    last24h: computeUptimePct(up24h, down24h),
    last7d:  computeUptimePct(d7.up, d7.down),
    last30d: computeUptimePct(d30.up, d30.down),
  };
}

// Fleet-level read model for the dashboard. Docker remains the source of truth
// for current container state; this only aggregates persisted monitoring data.
function getFleetDashboard(botNames, days = 14) {
  if (!Array.isArray(botNames) || botNames.length === 0) {
    return { latest: { problems: 0, devices: { total: 0, up: 0, hosts: 0, aps: 0, switches: 0, cameras: 0 } }, daily: [] };
  }

  const names = botNames.map(String);
  const placeholders = names.map(() => '?').join(',');
  const latestRows = getDb().prepare(`
    SELECT s.* FROM samples s
    INNER JOIN (SELECT bot_name, MAX(ts) AS max_ts FROM samples WHERE bot_name IN (${placeholders}) GROUP BY bot_name) latest
      ON latest.bot_name = s.bot_name AND latest.max_ts = s.ts
  `).all(...names);

  const latest = latestRows.reduce((acc, row) => {
    const add = (key) => Number(row[key]) || 0;
    acc.problems += add('problems_total');
    acc.devices.total += add('hosts_total') + add('aps_total') + add('switches_total') + add('cameras_total');
    acc.devices.up += add('hosts_up') + add('aps_up') + add('switches_up') + add('cameras_up');
    acc.devices.hosts += add('hosts_total');
    acc.devices.aps += add('aps_total');
    acc.devices.switches += add('switches_total');
    acc.devices.cameras += add('cameras_total');
    return acc;
  }, { problems: 0, devices: { total: 0, up: 0, hosts: 0, aps: 0, switches: 0, cameras: 0 } });

  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const daily = getDb().prepare(`
    SELECT day, AVG(uptime_pct) AS uptime_pct, AVG(avg_problems) AS avg_problems, MAX(max_problems) AS max_problems
    FROM daily WHERE bot_name IN (${placeholders}) AND day >= ?
    GROUP BY day ORDER BY day ASC
  `).all(...names, cutoff);

  return { latest, daily };
}

// สรุป samples ของวันที่กำหนด (YYYY-MM-DD, ขอบเขตวันแบบ UTC) ลง daily table — ใช้ INSERT OR REPLACE
function rollupDaily(day) {
  const dayStart = Math.floor(new Date(`${day}T00:00:00Z`).getTime() / 1000);
  const dayEnd   = dayStart + 86400;

  const rows = getDb().prepare(`
    SELECT bot_name,
           COUNT(*) AS samples,
           SUM(CASE WHEN state = 'up' THEN 1 ELSE 0 END) AS up_count,
           SUM(CASE WHEN state = 'down' THEN 1 ELSE 0 END) AS down_count,
           SUM(CASE WHEN state = 'unknown' THEN 1 ELSE 0 END) AS unknown_count,
           AVG(problems_total) AS avg_problems,
           MAX(problems_total) AS max_problems
    FROM samples
    WHERE ts >= ? AND ts < ?
    GROUP BY bot_name
  `).all(dayStart, dayEnd);

  const upsert = getDb().prepare(`
    INSERT OR REPLACE INTO daily (bot_name, day, samples, up_count, down_count, unknown_count, uptime_pct, avg_problems, max_problems)
    VALUES (@bot_name, @day, @samples, @up_count, @down_count, @unknown_count, @uptime_pct, @avg_problems, @max_problems)
  `);

  const tx = getDb().transaction((items) => {
    for (const r of items) {
      upsert.run({
        bot_name: r.bot_name,
        day,
        samples: r.samples,
        up_count: r.up_count,
        down_count: r.down_count,
        unknown_count: r.unknown_count,
        uptime_pct: computeUptimePct(r.up_count, r.down_count),
        avg_problems: r.avg_problems,
        max_problems: r.max_problems,
      });
    }
  });
  tx(rows);

  logger.info(`stats-db: rollupDaily(${day}) — ${rows.length} bot(s)`);
  return rows.length;
}

// ลบ samples ที่เก่ากว่า RETENTION_DAYS วัน — daily table เก็บถาวรไม่ลบ
function pruneOldSamples() {
  const cutoff = Math.floor(Date.now() / 1000) - RETENTION_DAYS * 86400;
  const info = getDb().prepare(`DELETE FROM samples WHERE ts < ?`).run(cutoff);
  logger.info(`stats-db: pruneOldSamples — removed ${info.changes} row(s) older than ${RETENTION_DAYS} days`);
  return info.changes;
}

// เติม sample state='unknown' ทุก POLL_INTERVAL_SEC ระหว่าง lastTs กับ nowTs
// เรียกตอน manager start เมื่อช่องว่างเกิน 2 รอบ poll (แปลว่า manager หยุดทำงานไปช่วงหนึ่ง)
// จำกัดไม่เกิน MAX_GAP_FILL_ROWS แถวต่อ bot กันกรณี manager ดับนานมาก
function fillUnknownGaps(botName, lastTs, nowTs) {
  if (lastTs == null) return 0; // ไม่มี sample เลย — bot ใหม่ ไม่ใช่ gap
  const gapSec = nowTs - lastTs;
  if (gapSec <= POLL_INTERVAL_SEC * 2) return 0;

  const stmt = insertStmt();
  const fill = getDb().transaction(() => {
    let ts = lastTs + POLL_INTERVAL_SEC;
    let count = 0;
    while (ts < nowTs && count < MAX_GAP_FILL_ROWS) {
      stmt.run({
        bot_name: botName, ts, state: 'unknown', partial: 0,
        problems_total: null, problems_disaster: null, problems_high: null, problems_average: null, problems_warning: null,
        hosts_total: null, hosts_up: null, aps_total: null, aps_up: null,
        switches_total: null, switches_up: null, cameras_total: null, cameras_up: null,
      });
      ts += POLL_INTERVAL_SEC;
      count++;
    }
    return count;
  });

  const inserted = fill();
  if (inserted > 0) {
    logger.info(`stats-db: fillUnknownGaps("${botName}") — inserted ${inserted} unknown sample(s)`);
  }
  return inserted;
}

module.exports = {
  initDb,
  closeDb,
  insertSample,
  getSamples,
  getLastSampleTs,
  getDailyStats,
  getUptimeSummary,
  getFleetDashboard,
  rollupDaily,
  pruneOldSamples,
  fillUnknownGaps,
};

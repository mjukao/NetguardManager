const dockerService = require('./docker');
const statsDb = require('./stats-db');
const logger = require('./logger');

const POLL_INTERVAL_MS      = 5 * 60 * 1000;
const STATS_FETCH_TIMEOUT_MS = 10 * 1000;
const HOURLY_CHECK_MS        = 60 * 60 * 1000;

let pollTimer = null;
let hourlyTimer = null;
let lastRollupDay = null;

function stripPrefix(containerName) {
  return containerName.replace(/^netguard-/, '');
}

// bot คุยกับ bot ผ่าน Docker DNS (container name) เหมือน getBotHealth ใน services/docker.js
async function fetchBotStats(botName) {
  const res = await fetch(`http://netguard-${botName}:3000/stats`, {
    signal: AbortSignal.timeout(STATS_FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`http-${res.status}`);
  return res.json();
}

async function pollOneBot(bot) {
  const botName = stripPrefix(bot.name);

  if (bot.state !== 'running') {
    statsDb.insertSample(botName, { state: 'down' });
    return;
  }

  try {
    const stats = await fetchBotStats(botName);
    if (!stats || stats.ok !== true) throw new Error('stats response ไม่ ok');
    statsDb.insertSample(botName, {
      state: 'up',
      partial: !!stats.partial,
      problems: stats.problems || {},
      devices: stats.devices || {},
    });
  } catch (err) {
    logger.warn(`poller: ดึง /stats ของ "${botName}" ไม่สำเร็จ: ${err.message}`);
    statsDb.insertSample(botName, { state: 'down' });
  }
}

async function pollAll() {
  let bots;
  try {
    bots = await dockerService.listBots();
  } catch (err) {
    logger.error('poller: listBots ล้มเหลว', err.message);
    return;
  }
  // poll ทุก bot พร้อมกัน — ไม่ให้ bot ที่ช้าบล็อกตัวอื่น
  await Promise.allSettled(bots.map(pollOneBot));
}

async function fillGapsForAllBots() {
  let bots;
  try {
    bots = await dockerService.listBots();
  } catch (err) {
    logger.warn('poller: fillGapsForAllBots — listBots ล้มเหลว', err.message);
    return;
  }
  const now = Math.floor(Date.now() / 1000);
  for (const bot of bots) {
    const botName = stripPrefix(bot.name);
    const lastTs = statsDb.getLastSampleTs(botName);
    statsDb.fillUnknownGaps(botName, lastTs, now);
  }
}

function checkDailyRollup() {
  const today = new Date().toISOString().slice(0, 10);
  if (lastRollupDay === today) return;

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  try {
    statsDb.rollupDaily(yesterday);
    statsDb.pruneOldSamples();
    lastRollupDay = today;
  } catch (err) {
    logger.error('poller: daily rollup ล้มเหลว', err.message);
  }
}

async function startPolling() {
  await fillGapsForAllBots();
  checkDailyRollup(); // เผื่อ manager restart ข้ามเที่ยงคืนไปโดยไม่ได้ rollup

  pollAll(); // รันทันทีตอน start ไม่ต้องรอครบ 5 นาที
  pollTimer = setInterval(pollAll, POLL_INTERVAL_MS);
  hourlyTimer = setInterval(checkDailyRollup, HOURLY_CHECK_MS);
  logger.info('poller: started (interval=5min)');
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  if (hourlyTimer) { clearInterval(hourlyTimer); hourlyTimer = null; }
}

module.exports = { startPolling, stopPolling, pollAll };

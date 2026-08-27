async function fetchJson(url, opts) {
  const res = await fetch(url, opts);
  if (res.status === 401) {
    window.location.href = '/login.html';
    throw new Error('unauthorized');
  }
  let data = null;
  try { data = await res.json(); } catch (err) { /* no body */ }
  if (!res.ok) {
    throw new Error((data && data.error) || `request failed: ${res.status}`);
  }
  return data;
}

function apiListBots() {
  return fetchJson('/api/bots');
}

function apiGetBotHealth(id) {
  return fetchJson(`/api/bots/${id}/health`);
}

function apiGetStatsSummary(name) {
  return fetchJson(`/api/bots/${name}/stats/summary`);
}

function apiGetStatsDaily(name, days) {
  return fetchJson(`/api/bots/${name}/stats/daily?days=${days}`);
}

function apiGetStatsSamples(name, hours) {
  return fetchJson(`/api/bots/${name}/stats/samples?hours=${hours}`);
}

function apiCreateBot(payload) {
  return fetchJson('/api/bots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

function apiBotAction(id, action) {
  return fetchJson(`/api/bots/${id}/${action}`, { method: 'POST' });
}

function apiRemoveBot(id, deleteFiles) {
  return fetchJson(`/api/bots/${id}?deleteFiles=${deleteFiles}`, { method: 'DELETE' });
}

function apiGetBotLogs(id) {
  return fetchJson(`/api/bots/${id}/logs`);
}

function apiGetTunnelLogs(name) {
  return fetchJson(`/api/bots/${name}/tunnel/logs`);
}

function apiAttachTunnel(name, token) {
  return fetchJson(`/api/bots/${name}/tunnel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
}

function apiDetachTunnel(name) {
  return fetchJson(`/api/bots/${name}/tunnel`, { method: 'DELETE' });
}

function apiGetMeta(name) {
  return fetchJson(`/api/bots/${name}/meta`);
}

function apiUpdateMeta(name, payload) {
  return fetchJson(`/api/bots/${name}/meta`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

function apiPullImage() {
  return fetchJson('/api/image/pull', { method: 'POST' });
}

function apiLogout() {
  return fetch('/api/auth/logout', { method: 'POST' });
}

async function loadBots() {
  let bots;
  try {
    bots = await apiListBots();
  } catch (err) {
    return;
  }

  // ดึง health ของทุก bot ที่ running มาก่อน render — การ์ดสรุป + filter "มีปัญหา"
  // ต้องใช้ข้อมูลนี้ตั้งแต่รอบแรก ไม่ใช่ทยอยเติมทีหลังเหมือนเดิม
  await Promise.all(bots.filter((b) => b.state === 'running').map(async (bot) => {
    try {
      bot.health = await apiGetBotHealth(bot.id);
    } catch (err) {
      bot.health = { ok: false, reason: 'error' };
    }
  }));

  botsCache = bots;
  lastRefreshedAt = Date.now();
  updateRefreshNote();
  renderSummaryBar(bots);
  renderTable();
}

async function loadBotUptime(bot) {
  const name = botDisplayName(bot);
  const cell = tbody.querySelector(`tr[data-id="${bot.id}"] .uptime-cell`);
  if (!cell) return;
  try {
    const summary = await apiGetStatsSummary(name);
    cell.innerHTML = uptimeCell(summary.last30d);
  } catch (err) {
    cell.innerHTML = uptimeCell(null);
  }
}

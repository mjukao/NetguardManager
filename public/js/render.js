function showToast(message, type) {
  const el = document.createElement('div');
  el.className = `toast ${type || 'info'}`;
  el.textContent = message;
  toastContainer.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function statusClass(state) {
  if (state === 'running') return 'running';
  if (state === 'exited' || state === 'dead') return 'stopped';
  return 'other';
}

function statusLabel(state) {
  if (state === 'running') return 'Running';
  if (state === 'exited') return 'Stopped';
  return state || 'Unknown';
}

function tunnelIcon(tunnel) {
  if (!tunnel || !tunnel.exists) return '';
  const ok = tunnel.state === 'running';
  const title = ok ? 'Tunnel เชื่อมต่ออยู่' : 'Tunnel ล่ม';
  return `<span class="tunnel-icon ${ok ? 'ok' : 'down'}" title="${title}">&#128279;</span>`;
}

// ทำงานปกติ = state running + health ok + tunnel (ถ้ามี) ต้องไม่ล่ม
// มีปัญหา = stopped/other, unhealthy, หรือ tunnel ล่ม
function botStatus(bot) {
  if (bot.state !== 'running') return 'problem';
  if (!bot.health || bot.health.ok !== true) return 'problem';
  if (bot.tunnel && bot.tunnel.exists && bot.tunnel.state !== 'running') return 'problem';
  return 'healthy';
}

function contractSoon(bot) {
  const days = daysUntil(bot.meta && bot.meta.contractEnd);
  return days !== null && days < 30;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

function contractBadge(contractEnd) {
  const days = daysUntil(contractEnd);
  if (days === null) return '';
  if (days < 0) return '<span class="contract-badge contract-expired">&#9888; หมดสัญญาแล้ว</span>';
  if (days < 30) return '<span class="contract-badge contract-warning">&#9888; ใกล้หมดสัญญา</span>';
  return '';
}

function uptimeCell(pct) {
  if (pct === null || pct === undefined) return '<span class="uptime-value uptime-na">&mdash;</span>';
  const cls = pct >= 99.5 ? 'uptime-good' : pct >= 95 ? 'uptime-warn' : 'uptime-bad';
  return `<span class="uptime-value ${cls}">${pct.toFixed(1)}%</span>`;
}

function botCell(bot, name) {
  const meta = bot.meta || {};
  const badge = contractBadge(meta.contractEnd);
  if (!meta.companyName) {
    return `<div class="bot-cell-company">${escapeHtml(name)}${badge}</div>`;
  }
  const tooltipParts = [meta.contactName, meta.contactPhone].filter(Boolean);
  const tooltip = tooltipParts.join(' ');
  const titleAttr = tooltip ? ` title="${escapeHtml(tooltip)}"` : '';
  return `
    <div class="bot-cell-company"${titleAttr}>${escapeHtml(meta.companyName)}${badge}</div>
    <div class="bot-cell-name">${escapeHtml(name)}</div>
  `;
}

function infoCell(bot) {
  const portPart = bot.port
    ? `<a class="port-link" href="http://localhost:${bot.port}/setup" target="_blank" rel="noopener">${bot.port}</a>`
    : '-';
  let monitorsPart = '-';
  if (bot.state === 'running') {
    monitorsPart = bot.health && bot.health.ok
      ? `${(bot.health.monitorsLoaded && bot.health.monitorsLoaded.length) || 0} monitors`
      : (bot.health ? escapeHtml(bot.health.reason || 'offline') : '-');
  }
  return `<span class="info-cell-text">${portPart} &middot; ${monitorsPart}</span>`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function botDisplayName(bot) {
  return bot.name.replace(/^netguard-/, '');
}

function renderSummaryBar(bots) {
  document.getElementById('countTotal').textContent = bots.length;
  document.getElementById('countHealthy').textContent = bots.filter((b) => botStatus(b) === 'healthy').length;
  document.getElementById('countProblem').textContent = bots.filter((b) => botStatus(b) === 'problem').length;
  document.getElementById('countContract').textContent = bots.filter(contractSoon).length;
}

function applyFilters(bots) {
  let list = bots;
  if (activeCardFilter === 'healthy') list = list.filter((b) => botStatus(b) === 'healthy');
  if (activeCardFilter === 'problem')  list = list.filter((b) => botStatus(b) === 'problem');
  if (activeCardFilter === 'contract') list = list.filter(contractSoon);

  const q = searchQuery.trim().toLowerCase();
  if (q) {
    list = list.filter((b) => {
      const name = botDisplayName(b).toLowerCase();
      const company = ((b.meta && b.meta.companyName) || '').toLowerCase();
      const contact = ((b.meta && b.meta.contactName) || '').toLowerCase();
      return name.includes(q) || company.includes(q) || contact.includes(q);
    });
  }
  return list;
}

function rowTemplate(bot) {
  const running = bot.state === 'running';
  const name = botDisplayName(bot);
  const hasTunnel = !!(bot.tunnel && bot.tunnel.exists);
  const id = escapeHtml(bot.id);
  const n = escapeHtml(name);

  const mainActionBtn = running
    ? `<button class="btn-icon btn-stop btn-main-action" data-action="stop" data-id="${id}">&#9208; Stop</button>`
    : `<button class="btn-icon btn-start btn-main-action" data-action="start" data-id="${id}">&#9654; Start</button>`;
  const kebabToggleAction = running
    ? `<button class="kebab-item" role="menuitem" data-action="stop" data-id="${id}">&#9208; Stop</button>`
    : `<button class="kebab-item" role="menuitem" data-action="start" data-id="${id}">&#9654; Start</button>`;

  return `
    <tr data-id="${id}" data-name="${n}" class="clickable-row" tabindex="0" role="button" aria-label="ดูสถิติของ ${n}">
      <td>${botCell(bot, name)}</td>
      <td>
        <span class="status">
          <span class="status-dot ${statusClass(bot.state)}"></span>
          ${statusLabel(bot.state)}
          ${tunnelIcon(bot.tunnel)}
        </span>
      </td>
      <td class="uptime-cell">${uptimeCell(null)}</td>
      <td class="col-info">${infoCell(bot)}</td>
      <td>
        <div class="row-actions">
          ${mainActionBtn}
          <div class="kebab-wrap">
            <button class="btn-icon btn-kebab" type="button" data-kebab-toggle data-id="${id}" aria-haspopup="true" aria-expanded="false" title="เมนูเพิ่มเติม">&#8942;</button>
            <div class="kebab-menu" role="menu">
              ${kebabToggleAction}
              <button class="kebab-item" role="menuitem" data-action="restart" data-id="${id}">&#8635; Restart</button>
              <button class="kebab-item" role="menuitem" data-action="log" data-id="${id}" data-name="${n}">&#128196; ดู Log</button>
              <button class="kebab-item" role="menuitem" data-action="edit-meta" data-name="${n}">&#9998; แก้ไขข้อมูลลูกค้า</button>
              ${!hasTunnel ? `<button class="kebab-item" role="menuitem" data-action="tunnel-add" data-name="${n}">&#128279; เพิ่ม Tunnel</button>` : ''}
              ${hasTunnel ? `<button class="kebab-item" role="menuitem" data-action="tunnel-log" data-name="${n}">&#128279; ดู Tunnel Log</button>` : ''}
              ${hasTunnel ? `<button class="kebab-item" role="menuitem" data-action="tunnel-remove" data-name="${n}">&#128279; ลบ Tunnel</button>` : ''}
              <div class="kebab-divider"></div>
              <button class="kebab-item kebab-danger" role="menuitem" data-action="remove" data-id="${id}" data-name="${n}">&#128465; ลบ Bot</button>
            </div>
          </div>
        </div>
      </td>
    </tr>
  `;
}

function renderTable() {
  if (!botsCache.length) {
    botsCard.style.display = 'none';
    emptyStateNone.style.display = 'block';
    emptyStateFiltered.style.display = 'none';
    return;
  }

  const filtered = applyFilters(botsCache);

  if (!filtered.length) {
    botsCard.style.display = 'none';
    emptyStateNone.style.display = 'none';
    emptyStateFiltered.style.display = 'block';
    return;
  }

  botsCard.style.display = '';
  emptyStateNone.style.display = 'none';
  emptyStateFiltered.style.display = 'none';

  tbody.innerHTML = filtered.map(rowTemplate).join('');
  filtered.forEach(loadBotUptime);
}

function updateActiveCardUI() {
  document.querySelectorAll('.summary-card').forEach((card) => {
    card.classList.toggle('active', card.dataset.filter !== '' && card.dataset.filter === activeCardFilter);
  });
}

function relativeTimeText(ms) {
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 5) return 'เมื่อสักครู่';
  if (sec < 60) return `${sec} วินาทีที่แล้ว`;
  const min = Math.floor(sec / 60);
  return `${min} นาทีที่แล้ว`;
}

function updateRefreshNote() {
  if (!lastRefreshedAt) return;
  refreshNote.textContent = `อัปเดตเมื่อ ${relativeTimeText(lastRefreshedAt)}`;
}

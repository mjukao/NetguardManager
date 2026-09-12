// Dashboard chart module. It owns only fleet-level calculations and Chart.js
// instances; table rendering and bot actions stay in their existing modules.
let fleetHealthChart = null;
let fleetTrendChart = null;
let lastFleetDashboard = null;
let lastFleetBots = null;

function dashboardColor(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function setDashboardValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function formatPercent(value) {
  return value === null || value === undefined || Number.isNaN(value) ? '—' : `${Number(value).toFixed(1)}%`;
}

function renderDeviceBars(devices) {
  const container = document.getElementById('deviceBars');
  if (!container) return;
  const entries = [['Hosts', devices.hosts], ['APs', devices.aps], ['Switches', devices.switches], ['Cameras', devices.cameras]];
  const max = Math.max(...entries.map(([, value]) => value), 1);
  container.innerHTML = entries.map(([label, value]) => `
    <div class="device-bar"><span>${label}</span><div><i style="width:${Math.max(3, (value / max) * 100)}%"></i></div><strong>${value}</strong></div>
  `).join('');
}

function renderHealthChart(healthy, issues, stopped) {
  const canvas = document.getElementById('healthChart');
  if (!canvas || !window.Chart) return;
  if (fleetHealthChart) fleetHealthChart.destroy();
  fleetHealthChart = new Chart(canvas, {
    type: 'doughnut',
    data: { datasets: [{ data: [healthy, issues, stopped], backgroundColor: [dashboardColor('--green'), dashboardColor('--amber'), dashboardColor('--text-dim')], borderColor: dashboardColor('--bg-panel'), borderWidth: 5, hoverOffset: 0 }] },
    options: { cutout: '76%', animation: { duration: 350 }, plugins: { legend: { display: false }, tooltip: { enabled: true } } },
  });
}

function renderTrendChart(rows) {
  const canvas = document.getElementById('fleetTrendChart');
  if (!canvas || !window.Chart) return;
  if (fleetTrendChart) fleetTrendChart.destroy();
  const labels = rows.map((row) => row.day ? row.day.slice(5) : '');
  fleetTrendChart = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets: [
      { data: rows.map((row) => row.uptime_pct), borderColor: dashboardColor('--teal'), backgroundColor: 'rgba(0, 212, 160, .12)', fill: true, borderWidth: 2, tension: .35, pointRadius: 0, yAxisID: 'uptime' },
      { data: rows.map((row) => row.avg_problems), borderColor: dashboardColor('--amber'), borderWidth: 2, tension: .35, pointRadius: 0, yAxisID: 'problems' },
    ] },
    options: { responsive: true, maintainAspectRatio: false, animation: false, interaction: { intersect: false, mode: 'index' }, plugins: { legend: { display: false } }, scales: {
      x: { grid: { display: false }, ticks: { color: dashboardColor('--text-dim'), font: { size: 10 }, maxTicksLimit: 6 } },
      uptime: { display: false, min: 0, max: 100 }, problems: { display: false, beginAtZero: true },
    } },
  });
}

function renderFleetDashboard(data, bots) {
  lastFleetDashboard = data;
  lastFleetBots = bots;
  const latest = data && data.latest ? data.latest : { problems: 0, devices: { total: 0, up: 0, hosts: 0, aps: 0, switches: 0, cameras: 0 } };
  const devices = latest.devices;
  const healthy = bots.filter((bot) => botStatus(bot) === 'healthy').length;
  const running = bots.filter((bot) => bot.state === 'running').length;
  const stopped = bots.filter((bot) => bot.state !== 'running').length;
  const issues = bots.length - healthy - stopped;
  const healthPct = bots.length ? Math.round((healthy / bots.length) * 100) : null;
  const contractSoonCount = bots.filter((bot) => contractSoon(bot)).length;
  const deviceOnline = devices.total ? Math.round((devices.up / devices.total) * 100) : null;
  const rows = (data && data.daily) || [];
  const uptimeRows = rows.filter((row) => row.uptime_pct !== null && row.uptime_pct !== undefined);
  const problemRows = rows.filter((row) => row.avg_problems !== null && row.avg_problems !== undefined);
  const avgUptime = uptimeRows.length ? uptimeRows.reduce((sum, row) => sum + Number(row.uptime_pct), 0) / uptimeRows.length : null;
  const avgProblems = problemRows.length ? problemRows.reduce((sum, row) => sum + Number(row.avg_problems), 0) / problemRows.length : null;

  setDashboardValue('dashRunning', running); setDashboardValue('dashHealthy', healthy); setDashboardValue('dashIssues', issues + stopped);
  setDashboardValue('dashDevices', devices.total || '—'); setDashboardValue('dashProblems', latest.problems || '0');
  setDashboardValue('dashDeviceUptime', formatPercent(deviceOnline)); setDashboardValue('dashContracts', contractSoonCount);
  setDashboardValue('dashHealthPct', healthPct === null ? '—' : `${healthPct}%`); setDashboardValue('dashLegendHealthy', healthy); setDashboardValue('dashLegendIssues', issues); setDashboardValue('dashLegendStopped', stopped);
  setDashboardValue('dashAvgUptime', formatPercent(avgUptime)); setDashboardValue('dashAvgProblems', avgProblems === null ? '—' : Number(avgProblems).toFixed(1));
  renderDeviceBars(devices); renderHealthChart(healthy, issues, stopped); renderTrendChart(rows);
}

window.addEventListener('netguard-theme-change', () => {
  if (lastFleetDashboard && lastFleetBots) renderFleetDashboard(lastFleetDashboard, lastFleetBots);
});

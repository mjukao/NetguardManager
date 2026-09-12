// Mutable dashboard state. Keep data and UI state separate from event wiring.
let botsCache = [];
let uptimeChart = null;
let problemsChart = null;
let removeTarget = null;
let attachTunnelTarget = null;
let editMetaTarget = null;
let refreshTimer = null;
let noteTimer = null;
let searchQuery = '';
let activeCardFilter = '';
let lastRefreshedAt = null;
let lastRenderedRowIds = null;
let sparklineCharts = {};
let sparklineCacheAt = 0;

const config = require('../config');
const logger = require('../services/logger');
const statsDb = require('../services/stats-db');
const poller = require('../services/poller');
const { createApp } = require('./create-app');

function startServer() {
  statsDb.initDb();
  poller.startPolling().catch((err) => logger.error('poller: startPolling failed', err.message));

  const server = createApp().listen(config.port, () => {
    logger.info(`NetGuard Manager listening on port ${config.port}`);
  });

  function shutdown(signal) {
    logger.info(`NetGuard Manager received ${signal} — shutting down`);
    poller.stopPolling();
    statsDb.closeDb();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  return server;
}

module.exports = { startServer };

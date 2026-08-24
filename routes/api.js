const express = require('express');
const guard = require('../middleware/guard');
const dockerService = require('../services/docker');
const logger = require('../services/logger');

const router = express.Router();

router.use(guard.networkGuard, guard.requireAuth);

router.get('/bots', async (req, res) => {
  try {
    const bots = await dockerService.listBots();
    res.json(bots);
  } catch (err) {
    logger.error('Failed to list bots:', err.message);
    res.status(500).json({ error: 'Failed to list bots' });
  }
});

router.get('/bots/:id/logs', async (req, res) => {
  try {
    const lines = parseInt(req.query.lines, 10) || 50;
    const logs = await dockerService.getBotLogs(req.params.id, lines);
    res.json(logs);
  } catch (err) {
    logger.error(`Failed to get logs for ${req.params.id}:`, err.message);
    res.status(500).json({ error: 'Failed to get logs' });
  }
});

router.get('/bots/:id/health', async (req, res) => {
  try {
    const bots = await dockerService.listBots();
    const bot = bots.find((b) => b.id === req.params.id);
    if (!bot || !bot.port) {
      return res.status(404).json({ error: 'Bot not found or has no exposed port' });
    }
    const health = await dockerService.getBotHealth(bot.port);
    res.json(health);
  } catch (err) {
    logger.error(`Failed to get health for ${req.params.id}:`, err.message);
    res.status(500).json({ error: 'Failed to get health' });
  }
});

module.exports = router;

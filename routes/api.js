const express = require('express');
const guard = require('../middleware/guard');
const dockerService = require('../services/docker');
const logger = require('../services/logger');

const router = express.Router();

router.use(guard.networkGuard, guard.requireAuth);

function handleError(res, err, fallbackMsg) {
  const status = err.statusCode || 500;
  if (status >= 500) {
    logger.error(`${fallbackMsg}:`, err.message);
  } else {
    logger.warn(`${fallbackMsg}:`, err.message);
  }
  res.status(status).json({ error: err.message || fallbackMsg });
}

router.get('/bots', async (req, res) => {
  try {
    const bots = await dockerService.listBots();
    res.json(bots);
  } catch (err) {
    handleError(res, err, 'Failed to list bots');
  }
});

router.get('/bots/:id/logs', async (req, res) => {
  try {
    const lines = parseInt(req.query.lines, 10) || 50;
    const logs = await dockerService.getBotLogs(req.params.id, lines);
    res.json(logs);
  } catch (err) {
    handleError(res, err, `Failed to get logs for ${req.params.id}`);
  }
});

router.get('/bots/:id/health', async (req, res) => {
  try {
    const health = await dockerService.getBotHealth(req.params.id);
    res.json(health);
  } catch (err) {
    handleError(res, err, `Failed to get health for ${req.params.id}`);
  }
});

router.post('/bots', async (req, res) => {
  try {
    const { name, port } = req.body || {};
    const bot = await dockerService.createBot({ name, port });
    res.status(201).json(bot);
  } catch (err) {
    handleError(res, err, 'Failed to create bot');
  }
});

router.post('/bots/:id/start', async (req, res) => {
  try {
    await dockerService.startBot(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err, `Failed to start ${req.params.id}`);
  }
});

router.post('/bots/:id/stop', async (req, res) => {
  try {
    await dockerService.stopBot(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err, `Failed to stop ${req.params.id}`);
  }
});

router.post('/bots/:id/restart', async (req, res) => {
  try {
    await dockerService.restartBot(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err, `Failed to restart ${req.params.id}`);
  }
});

router.delete('/bots/:id', async (req, res) => {
  try {
    const deleteFiles = req.query.deleteFiles === 'true';
    await dockerService.removeBot(req.params.id, { deleteFiles });
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err, `Failed to remove ${req.params.id}`);
  }
});

router.post('/image/pull', async (req, res) => {
  try {
    await dockerService.pullLatestImage();
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err, 'Failed to pull latest image');
  }
});

module.exports = router;

const express = require('express');
const rateLimit = require('express-rate-limit');
const guard = require('../middleware/guard');
const logger = require('../services/logger');
const config = require('../config');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again later.' },
});

router.use(guard.networkGuard);

router.post('/login', loginLimiter, (req, res) => {
  const { password } = req.body || {};
  if (!password || !guard.verifyPassword(password)) {
    logger.warn(`Failed login attempt from ${req.ip}`);
    return res.status(401).json({ error: 'Invalid password' });
  }

  const token = guard.createSession();
  res.cookie(guard.SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.nodeEnv === 'production' && req.secure,
    maxAge: 24 * 60 * 60 * 1000,
  });
  res.json({ loggedIn: true });
});

router.post('/logout', (req, res) => {
  const token = req.cookies && req.cookies[guard.SESSION_COOKIE];
  guard.destroySession(token);
  res.clearCookie(guard.SESSION_COOKIE);
  res.json({ loggedIn: false });
});

router.get('/status', (req, res) => {
  const token = req.cookies && req.cookies[guard.SESSION_COOKIE];
  res.json({ loggedIn: guard.isValidSession(token) });
});

module.exports = router;

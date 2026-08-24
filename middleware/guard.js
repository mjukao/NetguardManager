const crypto = require('crypto');
const config = require('../config');
const logger = require('../services/logger');

const SESSION_COOKIE = 'ng_session';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const sessions = new Map();

function hashPassword(password) {
  return crypto.createHash('sha256').update(password, 'utf8').digest('hex');
}

const DEFAULT_PASSWORD_HASH = hashPassword('admin');
let warnedDefaultPassword = false;

function getEffectiveHash() {
  if (config.managerPasswordHash) return config.managerPasswordHash;
  if (!warnedDefaultPassword) {
    logger.warn(
      'MANAGER_PASSWORD_HASH not set — falling back to default password "admin". Set MANAGER_PASSWORD_HASH in .env before exposing this dashboard.'
    );
    warnedDefaultPassword = true;
  }
  return DEFAULT_PASSWORD_HASH;
}

function verifyPassword(password) {
  const inputHash = Buffer.from(hashPassword(password || ''), 'utf8');
  const storedHash = Buffer.from(getEffectiveHash(), 'utf8');
  if (inputHash.length !== storedHash.length) return false;
  return crypto.timingSafeEqual(inputHash, storedHash);
}

function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

function destroySession(token) {
  sessions.delete(token);
}

function isValidSession(token) {
  if (!token) return false;
  const expiresAt = sessions.get(token);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    sessions.delete(token);
    return false;
  }
  return true;
}

// ── Layer 1: network guard — Tailscale (100.64.0.0/10) + private LAN only ──
function isPrivateIP(ip) {
  if (!ip) return false;
  let addr = ip;
  if (addr.startsWith('::ffff:')) addr = addr.slice(7);
  if (addr === '::1' || addr === '127.0.0.1' || addr === 'localhost') return true;

  const parts = addr.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  const [a, b] = parts;

  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // Tailscale CGNAT range
  return false;
}

function networkGuard(req, res, next) {
  const ip = req.ip || (req.socket && req.socket.remoteAddress);
  if (!isPrivateIP(ip)) {
    logger.warn(`Blocked request from disallowed IP: ${ip}`);
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

// ── Layer 2: session auth ──
function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies[SESSION_COOKIE];
  if (!isValidSession(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

module.exports = {
  SESSION_COOKIE,
  networkGuard,
  requireAuth,
  verifyPassword,
  createSession,
  destroySession,
  isValidSession,
  isPrivateIP,
};

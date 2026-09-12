const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('./logger');

const BOT_NAME_RE = /^[a-z0-9]{2,31}$/;
const META_FIELDS = ['companyName', 'contactName', 'contactPhone', 'contractEnd', 'note'];
const CONTRACT_END_RE = /^\d{4}-\d{2}-\d{2}$/;

function validationError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function metaPath(botName) {
  if (typeof botName !== 'string' || !BOT_NAME_RE.test(botName)) {
    throw validationError('Invalid bot name');
  }
  const root = path.resolve(config.botsRoot);
  const target = path.resolve(root, botName);
  if (target === root || !target.startsWith(root + path.sep)) {
    throw validationError('Invalid bot name');
  }
  return path.join(target, 'meta.json');
}

function readMeta(botName) {
  let filePath;
  try {
    filePath = metaPath(botName);
  } catch (err) {
    return {};
  }
  if (!fs.existsSync(filePath)) return {};
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    logger.warn(`Failed to read meta.json for "${botName}":`, err.message);
    return {};
  }
}

function writeFileAtomic(filePath, data) {
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  fs.renameSync(tmpPath, filePath);
}

function sanitizeField(value, maxLen, allowNewline) {
  let v = value.trim();
  if (!allowNewline) v = v.replace(/[\r\n]+/g, ' ');
  return v.slice(0, maxLen);
}

function initMeta(botName) {
  const filePath = metaPath(botName);
  if (fs.existsSync(filePath)) return;
  writeFileAtomic(filePath, { createdAt: new Date().toISOString() });
}

function writeMeta(botName, data) {
  const filePath = metaPath(botName);
  const existing = readMeta(botName);
  const patch = {};

  for (const field of META_FIELDS) {
    if (!data || !(field in data)) continue;
    const raw = data[field];
    if (typeof raw !== 'string') {
      throw validationError(`Field "${field}" must be a string`);
    }
    if (field === 'contractEnd') {
      const trimmed = raw.trim();
      if (trimmed !== '' && !CONTRACT_END_RE.test(trimmed)) {
        throw validationError('contractEnd must be in YYYY-MM-DD format');
      }
      patch.contractEnd = trimmed.slice(0, 200);
    } else if (field === 'note') {
      patch.note = sanitizeField(raw, 500, true);
    } else {
      patch[field] = sanitizeField(raw, 200, false);
    }
  }

  const now = new Date().toISOString();
  const merged = {
    ...existing,
    ...patch,
    createdAt: existing.createdAt || now,
    updatedAt: now,
  };

  writeFileAtomic(filePath, merged);
  return merged;
}

module.exports = {
  readMeta,
  writeMeta,
  initMeta,
};

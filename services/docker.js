const Docker = require('dockerode');
const config = require('../config');
const logger = require('./logger');

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

function stripLeadingSlash(name) {
  return name.startsWith('/') ? name.slice(1) : name;
}

function findHostPort(ports) {
  const mapping = (ports || []).find((p) => p.PrivatePort === 3000 && p.PublicPort);
  return mapping ? mapping.PublicPort : null;
}

async function listBots() {
  const containers = await docker.listContainers({ all: true });
  const bots = containers.filter((c) => c.Image === config.botImage);

  return Promise.all(
    bots.map(async (c) => {
      let health = null;
      try {
        const detail = await docker.getContainer(c.Id).inspect();
        health = detail.State && detail.State.Health ? detail.State.Health.Status : null;
      } catch (err) {
        logger.warn(`inspect failed for container ${c.Id}:`, err.message);
      }

      return {
        id: c.Id,
        name: stripLeadingSlash((c.Names && c.Names[0]) || c.Id),
        state: c.State,
        status: c.Status,
        port: findHostPort(c.Ports),
        createdAt: new Date(c.Created * 1000).toISOString(),
        health,
      };
    })
  );
}

function demuxLogBuffer(buffer) {
  const lines = [];
  let offset = 0;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset + 4);
    const start = offset + 8;
    const end = start + length;
    if (end > buffer.length) break;
    lines.push(buffer.slice(start, end).toString('utf8'));
    offset = end;
  }
  if (lines.length === 0 && buffer.length > 0) {
    return buffer.toString('utf8').split('\n').filter(Boolean);
  }
  return lines.join('').split('\n').filter(Boolean);
}

async function getBotLogs(id, lines = 50) {
  const container = docker.getContainer(id);
  const buffer = await container.logs({
    stdout: true,
    stderr: true,
    tail: lines,
    timestamps: false,
    follow: false,
  });
  return demuxLogBuffer(buffer);
}

async function getBotHealth(port) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(`http://localhost:${port}/health`, { signal: controller.signal });
    if (!res.ok) return { ok: false, monitorsLoaded: 0 };
    const data = await res.json();
    return { ok: true, monitorsLoaded: data.monitorsLoaded ?? 0 };
  } catch (err) {
    return { ok: false, monitorsLoaded: 0 };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { listBots, getBotLogs, getBotHealth };

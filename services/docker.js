const fs = require('fs');
const path = require('path');
const net = require('net');
const Docker = require('dockerode');
const config = require('../config');
const logger = require('./logger');

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

const BOT_NAME_RE = /^[a-z0-9][a-z0-9-]{1,30}$/;

const ENV_TEMPLATE = `# ---- LINE ----------------------------------------
LINE_CHANNEL_SECRET=
LINE_CHANNEL_ACCESS_TOKEN=

# ---- Zabbix ---------------------------------------
ZABBIX_URL=
ZABBIX_API_TOKEN=

# ---- Omada (Open API) ------------------------------
OMADA_URL=
OMADA_CLIENT_ID=
OMADA_CLIENT_SECRET=
OMADA_OMADAC_ID=
OMADA_SITE_ID=

# ---- HikCentral (AK/SK) -----------------------------
HIKCENTRAL_URL=
HIKCENTRAL_APP_KEY=
HIKCENTRAL_APP_SECRET=

# ---- Claude AI --------------------------------------
ANTHROPIC_API_KEY=

# ---- Cloudflare Tunnel -------------------------------
CLOUDFLARE_TUNNEL_TOKEN=
`;

function stripLeadingSlash(name) {
  return name.startsWith('/') ? name.slice(1) : name;
}

function findHostPort(ports) {
  const mapping = (ports || []).find((p) => p.PrivatePort === 3000 && p.PublicPort);
  return mapping ? mapping.PublicPort : null;
}

function validationError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function isValidBotName(name) {
  return typeof name === 'string' && BOT_NAME_RE.test(name);
}

function isValidPort(port) {
  return Number.isInteger(port) && port >= 1024 && port <= 65535;
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '0.0.0.0');
  });
}

async function assertManaged(container) {
  const detail = await container.inspect();
  const labels = (detail.Config && detail.Config.Labels) || {};
  const managed = labels['netguard.managed'] === 'true' || detail.Config.Image === config.botImage;
  if (!managed) {
    throw validationError('Refusing to operate on a container not managed by NetGuard Manager', 403);
  }
  return detail;
}

async function listBots() {
  const containers = await docker.listContainers({ all: true });
  const bots = containers.filter(
    (c) => (c.Labels && c.Labels['netguard.managed'] === 'true') || c.Image === config.botImage
  );

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

async function fetchHealth(host) {
  const res = await fetch(`http://${host}:3000/health`, {
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) throw new Error(`http-${res.status}`);
  return res.json();
}

async function getBotHealth(containerId) {
  const container = docker.getContainer(containerId);
  const detail = await container.inspect();

  if (!detail.State.Running) {
    return { ok: false, reason: 'stopped' };
  }

  const containerName = stripLeadingSlash(detail.Name);
  const networks = detail.NetworkSettings.Networks || {};
  const ip = (networks[config.botNetwork] && networks[config.botNetwork].IPAddress)
    || Object.values(networks).map((n) => n.IPAddress).find(Boolean);

  // Prefer the container name — Docker's embedded DNS resolves it on any
  // user-defined network they share, and unlike the IP it survives restarts.
  let lastErr;
  for (const host of [containerName, ip].filter(Boolean)) {
    try {
      const data = await fetchHealth(host);
      return { ok: true, monitorsLoaded: data.monitorsLoaded || [] };
    } catch (err) {
      lastErr = err;
    }
  }

  if (!containerName && !ip) return { ok: false, reason: 'no-ip' };
  return { ok: false, reason: lastErr ? lastErr.message : 'unreachable' };
}

async function createBot({ name, port }) {
  if (!isValidBotName(name)) {
    throw validationError('Invalid bot name — use lowercase letters, numbers, and hyphens only (2-31 chars, must start with a letter or digit)');
  }
  const portNum = Number(port);
  if (!isValidPort(portNum)) {
    throw validationError('Invalid port — must be an integer between 1024 and 65535');
  }
  if (!config.botsHostPath) {
    throw validationError('BOTS_HOST_PATH is not configured on the manager', 503);
  }

  try {
    await docker.getNetwork(config.botNetwork).inspect();
  } catch (err) {
    throw validationError(
      `Network "${config.botNetwork}" not found — start the manager with docker compose up first`,
      503
    );
  }

  const containerName = `netguard-${name}`;
  const existing = await listBots();
  if (existing.some((b) => b.name === containerName)) {
    throw validationError(`Bot name "${name}" already exists`, 409);
  }
  if (existing.some((b) => b.port === portNum)) {
    throw validationError(`Port ${portNum} is already used by another bot`, 409);
  }
  if (!(await isPortFree(portNum))) {
    throw validationError(`Port ${portNum} is already in use`, 409);
  }

  const botDir = path.join(config.botsRoot, name);
  fs.mkdirSync(path.join(botDir, 'data'), { recursive: true });
  fs.mkdirSync(path.join(botDir, 'logs'), { recursive: true });

  const envPath = path.join(botDir, '.env');
  if (!fs.existsSync(envPath)) {
    fs.writeFileSync(envPath, ENV_TEMPLATE);
  }

  const hostBotDir = `${config.botsHostPath}/${name}`;

  let container;
  try {
    container = await docker.createContainer({
      Image: config.botImage,
      name: containerName,
      Labels: {
        'netguard.managed': 'true',
        'netguard.botname': name,
      },
      HostConfig: {
        RestartPolicy: { Name: 'always' },
        PortBindings: { '3000/tcp': [{ HostPort: String(portNum) }] },
        Binds: [
          `${hostBotDir}/.env:/app/.env`,
          `${hostBotDir}/data:/app/data`,
          `${hostBotDir}/logs:/app/logs`,
        ],
      },
      ExposedPorts: { '3000/tcp': {} },
      NetworkingConfig: {
        EndpointsConfig: {
          [config.botNetwork]: {},
        },
      },
    });
    await container.start();
  } catch (err) {
    if (container) {
      try {
        await container.remove({ force: true });
      } catch (cleanupErr) {
        logger.warn(`Cleanup failed for container ${container.id}:`, cleanupErr.message);
      }
    }
    throw err;
  }

  return { id: container.id, name: containerName, port: portNum };
}

async function startBot(id) {
  const container = docker.getContainer(id);
  await assertManaged(container);
  await container.start();
}

async function stopBot(id) {
  const container = docker.getContainer(id);
  await assertManaged(container);
  await container.stop();
}

async function restartBot(id) {
  const container = docker.getContainer(id);
  await assertManaged(container);
  await container.restart();
}

async function removeBot(id, { deleteFiles = false } = {}) {
  const container = docker.getContainer(id);
  const detail = await assertManaged(container);
  const labels = (detail.Config && detail.Config.Labels) || {};
  const botName = labels['netguard.botname'] || stripLeadingSlash(detail.Name).replace(/^netguard-/, '');

  try {
    await container.stop();
  } catch (err) {
    if (err.statusCode !== 304 && err.statusCode !== 404) throw err;
  }
  await container.remove();

  if (deleteFiles && botName) {
    const root = path.resolve(config.botsRoot);
    const target = path.resolve(root, botName);
    if (target === root || !target.startsWith(root + path.sep)) {
      logger.warn(`Skipped deleting files for "${botName}" — path traversal guard triggered`);
      return;
    }
    fs.rmSync(target, { recursive: true, force: true });
  }
}

async function pullLatestImage() {
  return new Promise((resolve, reject) => {
    docker.pull(config.botImage, (err, stream) => {
      if (err) return reject(err);
      docker.modem.followProgress(stream, (err2, output) => {
        if (err2) return reject(err2);
        resolve(output);
      });
    });
  });
}

module.exports = {
  listBots,
  getBotLogs,
  getBotHealth,
  createBot,
  startBot,
  stopBot,
  restartBot,
  removeBot,
  pullLatestImage,
};

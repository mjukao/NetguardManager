require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT, 10) || 8080,
  managerPasswordHash: process.env.MANAGER_PASSWORD_HASH || '',
  nodeEnv: process.env.NODE_ENV || 'development',
  botImage: 'phattadol358/netguard-ai:latest',
  // BOTS_ROOT: path as seen inside this container (for fs read/write)
  botsRoot: process.env.BOTS_ROOT || '/bots',
  // BOTS_HOST_PATH: same folder's path on the Docker host (for bind mounts,
  // since dockerode's Binds are resolved by the daemon on the host, not in here)
  botsHostPath: process.env.BOTS_HOST_PATH || '',
  botNetwork: process.env.BOT_NETWORK || 'netguard-net',
};

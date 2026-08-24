require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT, 10) || 8080,
  managerPasswordHash: process.env.MANAGER_PASSWORD_HASH || '',
  nodeEnv: process.env.NODE_ENV || 'development',
  botImage: 'phattadol358/netguard-ai:latest',
};

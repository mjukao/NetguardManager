const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const guard = require('../middleware/guard');
const apiRoutes = require('../routes/api');
const authRoutes = require('../routes/auth');

function createApp() {
  const app = express();
  const publicDir = path.join(__dirname, '..', 'public');

  app.use(express.json());
  app.use(cookieParser());
  app.use(guard.networkGuard);

  function serveDashboard(req, res) {
    const token = req.cookies && req.cookies[guard.SESSION_COOKIE];
    if (!guard.isValidSession(token)) return res.redirect('/login.html');
    return res.sendFile(path.join(publicDir, 'index.html'));
  }

  app.get('/', serveDashboard);
  app.get('/index.html', serveDashboard);
  app.use(express.static(publicDir, { index: false }));
  app.use('/api/auth', authRoutes);
  app.use('/api', apiRoutes);

  return app;
}

module.exports = { createApp };

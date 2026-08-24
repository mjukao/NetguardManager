const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const config = require('./config');
const logger = require('./services/logger');
const guard = require('./middleware/guard');
const apiRoutes = require('./routes/api');
const authRoutes = require('./routes/auth');

const app = express();
const publicDir = path.join(__dirname, 'public');

app.use(express.json());
app.use(cookieParser());
app.use(guard.networkGuard);

function serveIndex(req, res) {
  const token = req.cookies && req.cookies[guard.SESSION_COOKIE];
  if (!guard.isValidSession(token)) {
    return res.redirect('/login.html');
  }
  res.sendFile(path.join(publicDir, 'index.html'));
}

app.get('/', serveIndex);
app.get('/index.html', serveIndex);

app.use(express.static(publicDir, { index: false }));

app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);

app.listen(config.port, () => {
  logger.info(`NetGuard Manager listening on port ${config.port}`);
});

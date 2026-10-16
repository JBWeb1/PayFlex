const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const db = require('./db');
const config = require('./config');
const authRoutes = require('./routes/auth');
const paymentRoutes = require('./routes/payments');
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');
const { notFoundHandler, errorHandler } = require('./middleware/errors');

function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(cors(config.corsOrigins.length ? { origin: config.corsOrigins } : undefined));
  app.use(express.json({ limit: '100kb' }));
  if (!config.isTest) app.use(morgan(config.isProd ? 'combined' : 'dev'));

  app.get('/api/health', async (req, res) => {
    let database = 'connected';
    try {
      await db.raw('select 1');
    } catch {
      database = 'unavailable';
    }
    res.status(database === 'connected' ? 200 : 503).json({
      status: database === 'connected' ? 'ok' : 'degraded',
      database: db.isPostgres ? 'postgres' : 'sqlite',
      db: database,
      uptime: Math.round(process.uptime()),
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/public', publicRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api', notFoundHandler);

  // In production the API also serves the built frontend.
  const dist = path.resolve(__dirname, '../../frontend/dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}

module.exports = createApp;

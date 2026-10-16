const http = require('http');
const { Server } = require('socket.io');
const config = require('./config');
const db = require('./db');
const createApp = require('./app');
const realtime = require('./services/realtime');
const { expireDuePayments } = require('./services/payments');

async function start() {
  const [, applied] = await db.migrateLatest();
  console.log(`[db] ${db.isPostgres ? 'PostgreSQL' : `SQLite (${config.sqliteFile})`} ready${
    applied.length ? `, applied ${applied.length} migration(s)` : ''
  }`);

  const app = createApp();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: config.corsOrigins.length ? config.corsOrigins : true },
  });
  realtime.attach(io);

  const sweeper = setInterval(() => {
    expireDuePayments()
      .then((n) => n && console.log(`[expiry] expired ${n} payment(s)`))
      .catch((err) => console.error('[expiry] sweep failed:', err.message));
  }, config.expirySweepMs);

  server.listen(config.port, () => {
    console.log(`PayFlex API listening on http://localhost:${config.port}`);
  });

  const shutdown = async () => {
    clearInterval(sweeper);
    io.close();
    server.close();
    await db.destroy();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((err) => {
  console.error('Failed to start PayFlex API:', err.message);
  process.exit(1);
});

require('dotenv').config();

const env = process.env;
const isProd = env.NODE_ENV === 'production';
const isTest = env.NODE_ENV === 'test';

const list = (value) =>
  (value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const config = {
  env: env.NODE_ENV || 'development',
  isProd,
  isTest,
  port: Number(env.PORT) || 5000,
  // postgres://... uses PostgreSQL; anything else uses a local SQLite file.
  databaseUrl: env.DATABASE_URL || '',
  sqliteFile: isTest ? ':memory:' : env.SQLITE_FILE || './data/payflex.sqlite',
  jwtSecret: env.JWT_SECRET || (isProd ? null : 'payflex-dev-secret-change-me'),
  jwtExpiresIn: env.JWT_EXPIRES_IN || '7d',
  // Public URL of the frontend, used to build payment links and QR codes.
  appUrl: (env.APP_URL || 'http://localhost:5173').replace(/\/$/, ''),
  corsOrigins: list(env.CORS_ORIGINS),
  adminEmails: list(env.ADMIN_EMAILS).map((e) => e.toLowerCase()),
  currency: env.CURRENCY || 'ZAR',
  defaultExpiryHours: Number(env.PAYMENT_EXPIRY_HOURS) || 72,
  expirySweepMs: Number(env.EXPIRY_SWEEP_MS) || 60_000,
  timezone: env.TZ_REPORTS || 'Africa/Johannesburg',
  webhook: {
    timeoutMs: Number(env.WEBHOOK_TIMEOUT_MS) || 5_000,
    maxAttempts: Number(env.WEBHOOK_MAX_ATTEMPTS) || 3,
    retryBaseMs: env.WEBHOOK_RETRY_BASE_MS !== undefined ? Number(env.WEBHOOK_RETRY_BASE_MS) : 2_000,
  },
  mail: {
    host: env.SMTP_HOST || '',
    port: Number(env.SMTP_PORT) || 587,
    secure: env.SMTP_SECURE === 'true',
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    from: env.MAIL_FROM || 'PayFlex <no-reply@payflex.local>',
  },
};

if (!config.jwtSecret) {
  throw new Error('JWT_SECRET must be set in production');
}

module.exports = config;

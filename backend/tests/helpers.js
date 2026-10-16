const request = require('supertest');
const db = require('../src/db');
const createApp = require('../src/app');

// Each test file gets its own in-memory SQLite database (or DATABASE_URL if set).
async function setupDb() {
  await db.migrateLatest();
}

async function resetDb() {
  for (const table of ['webhook_deliveries', 'payment_events', 'payments', 'users']) {
    // eslint-disable-next-line no-await-in-loop
    await db(table).del();
  }
}

async function teardownDb() {
  await db.destroy();
}

const expirePayment = (id) =>
  db('payments')
    .where({ id })
    .update({ expires_at: new Date(Date.now() - 1000).toISOString() });

const app = createApp();
const api = () => request(app);

let counter = 0;
async function registerUser(overrides = {}) {
  counter += 1;
  const body = {
    name: 'Test User',
    email: `user${counter}@example.com`,
    password: 'password123',
    businessName: `Shop ${counter}`,
    ...overrides,
  };
  const res = await api().post('/api/auth/register').send(body).expect(201);
  return { token: res.body.token, user: res.body.user, password: body.password };
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

const goodCard = { name: 'Thandi M', number: '4242 4242 4242 4242', expiry: '12/39', cvc: '123' };

module.exports = { expirePayment, setupDb, resetDb, teardownDb, api, registerUser, auth, goodCard };

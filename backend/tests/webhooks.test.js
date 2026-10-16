const http = require('http');
const deliveries = require('../src/db/webhookDeliveries');
const { signatureHeader, verifySignature } = require('../src/services/webhooks');
const { setupDb, resetDb, teardownDb, api, registerUser, auth } = require('./helpers');

let server;
let received;
let failNext;

beforeAll(async () => {
  await setupDb();
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
    });
    req.on('end', () => {
      received.push({ headers: req.headers, body });
      if (failNext > 0) {
        failNext -= 1;
        res.writeHead(500).end();
      } else {
        res.writeHead(200).end('ok');
      }
    });
  });
  await new Promise((r) => server.listen(0, r));
});
beforeEach(() => {
  received = [];
  failNext = 0;
});
afterEach(resetDb);
afterAll(async () => {
  server.close();
  await teardownDb();
});

const waitFor = async (fn, ms = 3000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // eslint-disable-next-line no-await-in-loop
    if (await fn()) return;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('condition not met in time');
};

describe('webhook signatures', () => {
  test('round trip and tamper detection', () => {
    const body = '{"hello":"world"}';
    const header = signatureHeader('whsec_test', body);
    expect(verifySignature('whsec_test', body, header)).toBe(true);
    expect(verifySignature('whsec_other', body, header)).toBe(false);
    expect(verifySignature('whsec_test', `${body} `, header)).toBe(false);
    const old = signatureHeader('whsec_test', body, Math.floor(Date.now() / 1000) - 3600);
    expect(verifySignature('whsec_test', body, old)).toBe(false);
  });
});

describe('webhook delivery', () => {
  test('paid events are signed, retried on failure and logged', async () => {
    const { token } = await registerUser();
    const url = `http://127.0.0.1:${server.address().port}/hook`;
    await api().patch('/api/auth/me').set(auth(token)).send({ webhookUrl: url }).expect(200);
    const { body: secretBody } = await api().get('/api/auth/me/webhook-secret').set(auth(token));

    const created = await api().post('/api/payments').set(auth(token)).send({ amount: 42 }).expect(201);
    const p = created.body.payment;
    failNext = 1;
    await api().post(`/api/public/payments/${p.slug}/pay`).send({ method: 'qr' }).expect(200);

    await waitFor(async () => (await deliveries.countForEvent('payment.paid')) === 2);
    const paidHooks = received.filter((r) => r.headers['payflex-event'] === 'payment.paid');
    expect(paidHooks).toHaveLength(2);
    const last = paidHooks[1];
    expect(verifySignature(secretBody.webhookSecret, last.body, last.headers['payflex-signature'])).toBe(true);
    const event = JSON.parse(last.body);
    expect(event.type).toBe('payment.paid');
    expect(event.data.reference).toBe(p.reference);
    expect(event.data.amount).toBe(4200);

    const log = await api().get(`/api/payments/${p.id}/webhooks`).set(auth(token)).expect(200);
    const paidLog = log.body.items.filter((d) => d.event === 'payment.paid');
    expect(paidLog.map((d) => d.success).sort()).toEqual([false, true]);
  });
});

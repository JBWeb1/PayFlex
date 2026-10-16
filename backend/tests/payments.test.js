const { outbox } = require('../src/services/mailer');
const { expirePayment, setupDb, resetDb, teardownDb, api, registerUser, auth, goodCard } = require('./helpers');

beforeAll(setupDb);
afterEach(resetDb);
afterAll(teardownDb);

async function createPayment(token, body = {}) {
  const res = await api()
    .post('/api/payments')
    .set(auth(token))
    .send({ amount: 149.99, description: 'Coffee beans', ...body });
  expect(res.status).toBe(201);
  return res.body.payment;
}

describe('payment requests', () => {
  test('create stores cents and returns a pay link and QR code', async () => {
    const { token } = await registerUser();
    const p = await createPayment(token);
    expect(p.amount).toBe(14999);
    expect(p.status).toBe('pending');
    expect(p.reference).toMatch(/^PF-[A-Z0-9]{8}$/);
    expect(p.payUrl).toBe(`http://localhost:5173/pay/${p.slug}`);
    expect(p.qr).toMatch(/^data:image\/png;base64,/);
    expect(new Date(p.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  test('rejects bad amounts', async () => {
    const { token } = await registerUser();
    for (const amount of [0, -5, 'abc', 10.555]) {
      // eslint-disable-next-line no-await-in-loop
      await api().post('/api/payments').set(auth(token)).send({ amount }).expect(400);
    }
  });

  test('emails the payer when asked', async () => {
    const { token } = await registerUser();
    outbox.length = 0;
    await createPayment(token, { payerEmail: 'payer@example.com', sendEmail: true });
    await new Promise((r) => setImmediate(r));
    expect(outbox.some((m) => m.to === 'payer@example.com' && /requested/.test(m.subject))).toBe(true);
  });

  test('merchants only see their own payments', async () => {
    const a = await registerUser();
    const b = await registerUser();
    const p = await createPayment(a.token);
    await api().get(`/api/payments/${p.id}`).set(auth(b.token)).expect(404);
    await api().post(`/api/payments/${p.id}/cancel`).set(auth(b.token)).expect(404);
    const list = await api().get('/api/payments').set(auth(b.token)).expect(200);
    expect(list.body.total).toBe(0);
  });

  test('list supports search, status filter and pagination', async () => {
    const { token } = await registerUser();
    await createPayment(token, { description: 'Haircut' });
    await createPayment(token, { description: 'Beard trim' });
    const third = await createPayment(token, { description: 'Haircut deluxe' });
    await api().post(`/api/payments/${third.id}/cancel`).set(auth(token)).expect(200);

    const search = await api().get('/api/payments?q=haircut').set(auth(token)).expect(200);
    expect(search.body.total).toBe(2);
    const cancelled = await api().get('/api/payments?status=cancelled').set(auth(token)).expect(200);
    expect(cancelled.body.items.map((i) => i.id)).toEqual([third.id]);
    const page = await api().get('/api/payments?limit=2&page=2').set(auth(token)).expect(200);
    expect(page.body.items).toHaveLength(1);
    expect(page.body.pages).toBe(2);
  });
});

describe('public checkout', () => {
  test('payer sees a safe public view', async () => {
    const { token } = await registerUser({ businessName: 'Kasi Coffee' });
    const p = await createPayment(token, { payerEmail: 'payer@example.com' });
    const res = await api().get(`/api/public/payments/${p.slug}`).expect(200);
    expect(res.body.payment.merchant.name).toBe('Kasi Coffee');
    expect(res.body.payment).not.toHaveProperty('payerEmail');
    expect(res.body.payment).not.toHaveProperty('events');
    await api().get('/api/public/payments/doesnotexist').expect(404);
  });

  test('declined card is recorded, then a good card pays exactly once', async () => {
    const { token, user } = await registerUser();
    const p = await createPayment(token);
    outbox.length = 0;

    const declined = await api()
      .post(`/api/public/payments/${p.slug}/pay`)
      .send({ method: 'card', card: { ...goodCard, number: '4000 0000 0000 0002' } });
    expect(declined.status).toBe(400);
    expect(declined.body.error).toMatch(/declined/i);

    const invalid = await api()
      .post(`/api/public/payments/${p.slug}/pay`)
      .send({ method: 'card', card: { ...goodCard, number: '4242 4242 4242 4241' } });
    expect(invalid.status).toBe(400);

    const paid = await api()
      .post(`/api/public/payments/${p.slug}/pay`)
      .send({ method: 'card', card: goodCard, payerName: 'Thandi', payerEmail: 'thandi@example.com' })
      .expect(200);
    expect(paid.body.payment.status).toBe('paid');
    expect(paid.body.payment.cardLast4).toBe('4242');
    expect(paid.body.payment.transactionId).toMatch(/^txn_/);

    await api().post(`/api/public/payments/${p.slug}/pay`).send({ method: 'qr' }).expect(409);

    const detail = await api().get(`/api/payments/${p.id}`).set(auth(token)).expect(200);
    expect(detail.body.payment.failedAttempts).toBe(2);
    expect(detail.body.payment.payerEmail).toBe('thandi@example.com');
    expect(detail.body.payment.events.map((e) => e.type)).toEqual([
      'payment.created',
      'payment.failed',
      'payment.failed',
      'payment.paid',
    ]);

    await new Promise((r) => setImmediate(r));
    expect(outbox.some((m) => m.to === user.email && /received/.test(m.subject))).toBe(true);
    expect(outbox.some((m) => m.to === 'thandi@example.com' && /Receipt/.test(m.subject))).toBe(true);
  });

  test('concurrent pay attempts only succeed once', async () => {
    const { token } = await registerUser();
    const p = await createPayment(token);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => api().post(`/api/public/payments/${p.slug}/pay`).send({ method: 'qr' }))
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(4);
  });

  test('EFT requires a bank', async () => {
    const { token } = await registerUser();
    const p = await createPayment(token);
    await api().post(`/api/public/payments/${p.slug}/pay`).send({ method: 'eft', bank: '' }).expect(400);
    await api().post(`/api/public/payments/${p.slug}/pay`).send({ method: 'eft', bank: 'Capitec' }).expect(200);
  });

  test('expired and cancelled links cannot be paid', async () => {
    const { token } = await registerUser();
    const expiring = await createPayment(token);
    await expirePayment(expiring.id);
    const res = await api().post(`/api/public/payments/${expiring.slug}/pay`).send({ method: 'qr' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/expired/);

    const cancelled = await createPayment(token);
    await api().post(`/api/payments/${cancelled.id}/cancel`).set(auth(token)).expect(200);
    await api().post(`/api/public/payments/${cancelled.slug}/pay`).send({ method: 'qr' }).expect(409);
  });

  test('links with expiresInHours=0 never expire', async () => {
    const { token } = await registerUser();
    const p = await createPayment(token, { expiresInHours: 0 });
    expect(p.expiresAt).toBeNull();
  });

  test('suspended merchants cannot take payments', async () => {
    const admin = await registerUser();
    const merchant = await registerUser();
    const p = await createPayment(merchant.token);
    await api()
      .patch(`/api/admin/users/${merchant.user.id}`)
      .set(auth(admin.token))
      .send({ status: 'suspended' })
      .expect(200);
    await api().post(`/api/public/payments/${p.slug}/pay`).send({ method: 'qr' }).expect(409);
  });
});

describe('merchant actions', () => {
  async function paidPayment(token, amount = 100) {
    const p = await createPayment(token, { amount });
    await api().post(`/api/public/payments/${p.slug}/pay`).send({ method: 'qr' }).expect(200);
    return p;
  }

  test('partial then full refund', async () => {
    const { token } = await registerUser();
    const p = await paidPayment(token, 100);

    await api().post(`/api/payments/${p.id}/refund`).set(auth(token)).send({ amount: 150 }).expect(400);
    const partial = await api().post(`/api/payments/${p.id}/refund`).set(auth(token)).send({ amount: 30 }).expect(200);
    expect(partial.body.payment.status).toBe('partially_refunded');
    expect(partial.body.payment.refundedAmount).toBe(3000);

    const full = await api().post(`/api/payments/${p.id}/refund`).set(auth(token)).send({}).expect(200);
    expect(full.body.payment.status).toBe('refunded');
    expect(full.body.payment.refundedAmount).toBe(10000);

    await api().post(`/api/payments/${p.id}/refund`).set(auth(token)).send({}).expect(409);
  });

  test('cannot cancel a paid payment or refund a pending one', async () => {
    const { token } = await registerUser();
    const paid = await paidPayment(token);
    await api().post(`/api/payments/${paid.id}/cancel`).set(auth(token)).expect(409);
    const pending = await createPayment(token);
    await api().post(`/api/payments/${pending.id}/refund`).set(auth(token)).send({}).expect(409);
  });

  test('reminders need a pending payment with a payer email', async () => {
    const { token } = await registerUser();
    const noEmail = await createPayment(token);
    await api().post(`/api/payments/${noEmail.id}/remind`).set(auth(token)).expect(400);
    const withEmail = await createPayment(token, { payerEmail: 'p@example.com' });
    const res = await api().post(`/api/payments/${withEmail.id}/remind`).set(auth(token)).expect(200);
    expect(res.body.payment.events.at(-1).type).toBe('payment.reminder_sent');
  });

  test('stats and CSV export', async () => {
    const { token } = await registerUser();
    await paidPayment(token, 100);
    const refunded = await paidPayment(token, 50);
    await api().post(`/api/payments/${refunded.id}/refund`).set(auth(token)).send({ amount: 20 }).expect(200);
    await createPayment(token, { amount: 75, description: '=SUM(A1)' });
    const expired = await createPayment(token, { amount: 10 });
    await expirePayment(expired.id);
    await api().get(`/api/payments/${expired.id}`).set(auth(token)).expect(200); // triggers lazy expiry

    const stats = await api().get('/api/payments/stats').set(auth(token)).expect(200);
    expect(stats.body.totals).toMatchObject({
      payments: 4,
      paid: 2,
      pending: 1,
      pendingAmount: 7500,
      grossVolume: 15000,
      refunded: 2000,
      netVolume: 13000,
      averagePayment: 7500,
    });
    expect(stats.body.totals.conversionRate).toBeCloseTo(2 / 3);
    expect(stats.body.series).toHaveLength(30);
    expect(stats.body.series.reduce((n, d) => n + d.revenue, 0)).toBe(13000);

    const csv = await api().get('/api/payments/export.csv').set(auth(token)).expect(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    const lines = csv.text.split('\n');
    expect(lines[0]).toMatch(/^Reference,Created,Status,Amount/);
    expect(lines).toHaveLength(5);
    expect(csv.text).toContain("'=SUM(A1)");
  });
});

describe('admin', () => {
  test('admin routes are admin-only', async () => {
    await registerUser(); // admin
    const merchant = await registerUser();
    await api().get('/api/admin/stats').set(auth(merchant.token)).expect(403);
    await api().get('/api/admin/users').set(auth(merchant.token)).expect(403);
  });

  test('admin sees platform stats, users and payments and can suspend users', async () => {
    const admin = await registerUser();
    const merchant = await registerUser();
    const p = await createPayment(merchant.token, { amount: 200 });
    await api().post(`/api/public/payments/${p.slug}/pay`).send({ method: 'qr' }).expect(200);

    const stats = await api().get('/api/admin/stats').set(auth(admin.token)).expect(200);
    expect(stats.body.users.total).toBe(2);
    expect(stats.body.totals.netVolume).toBe(20000);
    expect(stats.body.topMerchants[0].email).toBe(merchant.user.email);

    const users = await api().get('/api/admin/users?q=example').set(auth(admin.token)).expect(200);
    expect(users.body.items.find((u) => u.id === merchant.user.id).volume).toBe(20000);

    const payments = await api().get('/api/admin/payments').set(auth(admin.token)).expect(200);
    expect(payments.body.items[0].merchant.email).toBe(merchant.user.email);

    await api().patch(`/api/admin/users/${admin.user.id}`).set(auth(admin.token)).send({ status: 'suspended' }).expect(400);
    await api()
      .patch(`/api/admin/users/${merchant.user.id}`)
      .set(auth(admin.token))
      .send({ status: 'suspended' })
      .expect(200);
    await api().get('/api/auth/me').set(auth(merchant.token)).expect(403);
    await api().post('/api/auth/login').send({ email: merchant.user.email, password: merchant.password }).expect(403);
  });
});

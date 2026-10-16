const { setupDb, resetDb, teardownDb, api, registerUser, auth } = require('./helpers');

beforeAll(setupDb);
afterEach(resetDb);
afterAll(teardownDb);

describe('auth', () => {
  test('first account becomes admin, later accounts are merchants', async () => {
    const first = await registerUser();
    const second = await registerUser();
    expect(first.user.role).toBe('admin');
    expect(second.user.role).toBe('merchant');
    expect(first.user).not.toHaveProperty('passwordHash');
    expect(first.user).not.toHaveProperty('webhookSecret');
  });

  test('rejects duplicate emails case-insensitively', async () => {
    await registerUser({ email: 'dup@example.com' });
    const res = await api()
      .post('/api/auth/register')
      .send({ name: 'Again', email: 'DUP@example.com', password: 'password123' });
    expect(res.status).toBe(409);
  });

  test('validates input', async () => {
    const res = await api().post('/api/auth/register').send({ name: 'A', email: 'nope', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.fields).toHaveProperty('email');
    expect(res.body.fields).toHaveProperty('password');
  });

  test('login works and wrong passwords are rejected with a generic error', async () => {
    const { user, password } = await registerUser();
    const ok = await api().post('/api/auth/login').send({ email: user.email, password });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeTruthy();

    const bad = await api().post('/api/auth/login').send({ email: user.email, password: 'wrong-password' });
    const unknown = await api().post('/api/auth/login').send({ email: 'ghost@example.com', password: 'x' });
    expect(bad.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(bad.body.error).toBe(unknown.body.error);
  });

  test('me, profile update, password change and webhook secret rotation', async () => {
    const { token, password } = await registerUser();
    const me = await api().get('/api/auth/me').set(auth(token)).expect(200);
    expect(me.body.user.email).toMatch(/@example.com$/);

    const upd = await api()
      .patch('/api/auth/me')
      .set(auth(token))
      .send({ businessName: 'Kasi Coffee', webhookUrl: 'https://example.com/hook' })
      .expect(200);
    expect(upd.body.user.businessName).toBe('Kasi Coffee');

    await api().patch('/api/auth/me').set(auth(token)).send({ webhookUrl: 'ftp://nope' }).expect(400);

    await api()
      .post('/api/auth/me/password')
      .set(auth(token))
      .send({ currentPassword: 'wrong', newPassword: 'newpassword1' })
      .expect(400);
    await api()
      .post('/api/auth/me/password')
      .set(auth(token))
      .send({ currentPassword: password, newPassword: 'newpassword1' })
      .expect(200);
    await api().post('/api/auth/login').send({ email: me.body.user.email, password: 'newpassword1' }).expect(200);

    const s1 = await api().get('/api/auth/me/webhook-secret').set(auth(token)).expect(200);
    const s2 = await api().post('/api/auth/me/webhook-secret').set(auth(token)).expect(200);
    expect(s1.body.webhookSecret).toMatch(/^whsec_/);
    expect(s2.body.webhookSecret).not.toBe(s1.body.webhookSecret);
  });

  test('protected routes need a valid token', async () => {
    await api().get('/api/auth/me').expect(401);
    await api().get('/api/auth/me').set(auth('garbage')).expect(401);
  });
});

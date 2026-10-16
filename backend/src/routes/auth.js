const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const config = require('../config');
const users = require('../db/users');
const validate = require('../middleware/validate');
const { signToken, requireAuth } = require('../middleware/auth');
const { conflict, unauthorized, forbidden, badRequest } = require('../utils/httpError');
const { httpUrl } = require('../utils/schemas');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: config.isTest ? 1000 : 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again in a few minutes' },
});

const password = z.string().min(8, 'Password must be at least 8 characters').max(128);
const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email'));

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(80),
  email,
  password,
  businessName: z.string().trim().max(120).optional(),
});

const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required'),
});

const profileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  businessName: z.string().trim().max(120).optional(),
  webhookUrl: z.union([z.literal(''), httpUrl]).optional(),
  notifyOnPayment: z.boolean().optional(),
});

const passwordSchema = z.object({ currentPassword: z.string().min(1), newPassword: password });

router.post('/register', authLimiter, validate(registerSchema), async (req, res) => {
  const { name, email: address, password: plain, businessName } = req.valid.body;
  if (await users.findByEmail(address)) throw conflict('An account with that email already exists');

  // The very first account, or any email in ADMIN_EMAILS, becomes an admin.
  const isFirst = (await users.count()) === 0;
  const role = isFirst || config.adminEmails.includes(address) ? 'admin' : 'merchant';

  const user = await users.create({
    name,
    email: address,
    businessName: businessName || '',
    role,
    passwordHash: await bcrypt.hash(plain, 10),
    lastLoginAt: new Date().toISOString(),
  });
  res.status(201).json({ token: signToken(user), user: users.toPublic(user) });
});

router.post('/login', authLimiter, validate(loginSchema), async (req, res) => {
  const { email: address, password: plain } = req.valid.body;
  const user = await users.findByEmail(address);
  // Same message for unknown email and wrong password so accounts can't be enumerated.
  if (!user || !(await bcrypt.compare(plain, user.passwordHash))) {
    throw unauthorized('Incorrect email or password');
  }
  if (user.status !== 'active') throw forbidden('Your account is suspended');
  const updated = await users.update(user.id, { lastLoginAt: new Date().toISOString() });
  res.json({ token: signToken(updated), user: users.toPublic(updated) });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: users.toPublic(req.user) });
});

router.patch('/me', requireAuth, validate(profileSchema), async (req, res) => {
  const user = await users.update(req.user.id, req.valid.body);
  res.json({ user: users.toPublic(user) });
});

router.post('/me/password', requireAuth, validate(passwordSchema), async (req, res) => {
  const { currentPassword, newPassword } = req.valid.body;
  if (!(await bcrypt.compare(currentPassword, req.user.passwordHash))) {
    throw badRequest('Current password is incorrect');
  }
  await users.update(req.user.id, { passwordHash: await bcrypt.hash(newPassword, 10) });
  res.json({ message: 'Password updated' });
});

router.get('/me/webhook-secret', requireAuth, (req, res) => {
  res.json({ webhookSecret: req.user.webhookSecret });
});

router.post('/me/webhook-secret', requireAuth, async (req, res) => {
  const user = await users.update(req.user.id, { webhookSecret: users.newWebhookSecret() });
  res.json({ webhookSecret: user.webhookSecret });
});

module.exports = router;

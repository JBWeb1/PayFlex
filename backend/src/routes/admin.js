const express = require('express');
const { z } = require('zod');
const paymentsDb = require('../db/payments');
const users = require('../db/users');
const validate = require('../middleware/validate');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { paymentStats } = require('../services/stats');
const { badRequest, notFound } = require('../utils/httpError');

const router = express.Router();
router.use(requireAuth, requireAdmin);

const pageSchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum([...paymentsDb.STATUSES, 'all']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const updateUserSchema = z.object({
  status: z.enum(['active', 'suspended']).optional(),
  role: z.enum(['merchant', 'admin']).optional(),
});

const paged = (items, total, page, limit) => ({
  items,
  page,
  limit,
  total,
  pages: Math.max(1, Math.ceil(total / limit)),
});

router.get('/stats', async (req, res) => {
  const [stats, total, suspended, topMerchants] = await Promise.all([
    paymentStats(undefined, 30),
    users.count(),
    users.count({ status: 'suspended' }),
    paymentsDb.topMerchants(5),
  ]);
  res.json({ ...stats, users: { total, suspended }, topMerchants });
});

router.get('/users', validate(pageSchema, 'query'), async (req, res) => {
  const { q, page, limit } = req.valid.query;
  const { items, total } = await users.list({ q, page, limit });
  const volumes = await paymentsDb.volumesFor(items.map((u) => u.id));
  res.json(
    paged(
      items.map((u) => ({
        ...users.toPublic(u),
        volume: volumes.get(u.id)?.volume || 0,
        paidCount: volumes.get(u.id)?.count || 0,
      })),
      total,
      page,
      limit
    )
  );
});

router.patch('/users/:id', validate(updateUserSchema), async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) throw notFound('User not found');
  const id = Number(req.params.id);
  if (id === req.user.id) throw badRequest("You can't change your own account here");
  if (!(await users.findById(id))) throw notFound('User not found');
  const user = await users.update(id, req.valid.body);
  res.json({ user: users.toPublic(user) });
});

router.get('/payments', validate(pageSchema, 'query'), async (req, res) => {
  const { q, status, page, limit } = req.valid.query;
  const { items, total } = await paymentsDb.listWithMerchant({ q, status }, { page, limit });
  res.json(paged(items.map(({ merchantId, ...p }) => p), total, page, limit));
});

module.exports = router;

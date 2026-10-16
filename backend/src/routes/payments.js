const express = require('express');
const { z } = require('zod');
const paymentsDb = require('../db/payments');
const deliveries = require('../db/webhookDeliveries');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const payments = require('../services/payments');
const { paymentStats } = require('../services/stats');
const { notFound } = require('../utils/httpError');
const { fromCents } = require('../utils/money');
const { httpUrl, amount } = require('../utils/schemas');
const toCsv = require('../utils/csv');

const router = express.Router();
router.use(requireAuth);

const createSchema = z.object({
  amount,
  description: z.string().trim().max(200).optional(),
  payerName: z.string().trim().max(80).optional(),
  payerEmail: z
    .union([z.literal(''), z.string().trim().toLowerCase().pipe(z.email('Enter a valid payer email'))])
    .optional(),
  redirectUrl: z.union([z.literal(''), httpUrl]).optional(),
  // 0 means the link never expires.
  expiresInHours: z.coerce.number().int().min(0).max(24 * 90).optional(),
  sendEmail: z.boolean().optional(),
});

const listSchema = z.object({
  status: z.enum([...paymentsDb.STATUSES, 'all']).default('all'),
  q: z.string().trim().max(100).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const refundSchema = z.object({ amount: amount.optional() });

async function loadOwned(req) {
  if (!/^\d+$/.test(req.params.id)) throw notFound('Payment not found');
  const payment = await paymentsDb.findOwned(Number(req.params.id), req.user.id, { withEvents: true });
  if (!payment) throw notFound('Payment not found');
  return payments.expireIfDue(payment);
}

router.post('/', validate(createSchema), async (req, res) => {
  const payment = await payments.createPayment(req.user, req.valid.body);
  res.status(201).json({ payment: await payments.withLinks(payment) });
});

router.get('/', validate(listSchema, 'query'), async (req, res) => {
  const { page, limit, ...filter } = req.valid.query;
  const { items, total } = await paymentsDb.list({ ...filter, merchantId: req.user.id }, { page, limit });
  const now = new Date();
  res.json({
    items: items.map((p) => ({
      ...paymentsDb.merchantView(p),
      // Show overdue links as expired even before the sweeper gets to them.
      status: paymentsDb.isExpired(p, now) ? 'expired' : p.status,
      payUrl: payments.payUrl(p),
    })),
    page,
    limit,
    total,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
});

router.get('/stats', async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 7), 365);
  res.json(await paymentStats(req.user.id, days));
});

router.get('/export.csv', validate(listSchema, 'query'), async (req, res) => {
  const { page, limit, ...filter } = req.valid.query;
  const { items } = await paymentsDb.list({ ...filter, merchantId: req.user.id }, { page: 1, limit: 10_000 });
  const iso = (d) => d || '';
  const csv = toCsv(
    [
      { label: 'Reference', value: (p) => p.reference },
      { label: 'Created', value: (p) => iso(p.createdAt) },
      { label: 'Status', value: (p) => p.status },
      { label: 'Amount', value: (p) => fromCents(p.amount).toFixed(2) },
      { label: 'Refunded', value: (p) => fromCents(p.refundedAmount).toFixed(2) },
      { label: 'Currency', value: (p) => p.currency },
      { label: 'Description', value: (p) => p.description },
      { label: 'Payer name', value: (p) => p.payerName },
      { label: 'Payer email', value: (p) => p.payerEmail },
      { label: 'Method', value: (p) => p.method },
      { label: 'Paid at', value: (p) => iso(p.paidAt) },
      { label: 'Transaction', value: (p) => p.transactionId },
    ],
    items
  );
  const stamp = new Date().toISOString().slice(0, 10);
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="payflex-payments-${stamp}.csv"`);
  res.send(csv);
});

router.get('/:id', async (req, res) => {
  res.json({ payment: await payments.withLinks(await loadOwned(req)) });
});

router.get('/:id/webhooks', async (req, res) => {
  const payment = await loadOwned(req);
  res.json({ items: await deliveries.forPayment(payment.id) });
});

router.post('/:id/cancel', async (req, res) => {
  const payment = await payments.cancel(await loadOwned(req));
  res.json({ payment: await payments.withLinks(payment) });
});

router.post('/:id/refund', validate(refundSchema), async (req, res) => {
  const payment = await payments.refund(await loadOwned(req), req.valid.body.amount);
  res.json({ payment: await payments.withLinks(payment) });
});

router.post('/:id/remind', async (req, res) => {
  const payment = await payments.remind(await loadOwned(req), req.user);
  res.json({ payment: await payments.withLinks(payment) });
});

module.exports = router;

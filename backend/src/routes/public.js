const express = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const config = require('../config');
const users = require('../db/users');
const { publicView } = require('../db/payments');
const validate = require('../middleware/validate');
const payments = require('../services/payments');
const { notFound } = require('../utils/httpError');

const router = express.Router();

const payLimiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: config.isTest ? 1000 : 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many payment attempts, please wait a few minutes' },
});

const payer = {
  payerName: z.string().trim().max(80).optional(),
  payerEmail: z.union([z.literal(''), z.string().trim().toLowerCase().pipe(z.email('Enter a valid email'))]).optional(),
};

const paySchema = z.discriminatedUnion('method', [
  z.object({
    method: z.literal('card'),
    card: z.object({
      name: z.string().trim().max(80),
      number: z.string().max(30),
      expiry: z.string().max(7),
      cvc: z.string().max(4),
    }),
    ...payer,
  }),
  z.object({ method: z.literal('eft'), bank: z.string().trim().max(60), ...payer }),
  z.object({ method: z.literal('qr'), ...payer }),
]);

router.param('slug', (req, res, next, slug) => {
  next(/^[a-z0-9]{6,32}$/.test(slug) ? undefined : notFound('Payment not found'));
});

router.get('/payments/:slug', async (req, res) => {
  const payment = await payments.findBySlug(req.params.slug);
  const merchant = await users.findById(payment.merchantId);
  res.json({ payment: publicView(payment, merchant) });
});

router.get('/payments/:slug/qr', async (req, res) => {
  const payment = await payments.findBySlug(req.params.slug);
  res.json({ qr: await payments.qrDataUrl(payment), payUrl: payments.payUrl(payment) });
});

router.post('/payments/:slug/pay', payLimiter, validate(paySchema), async (req, res) => {
  const body = req.valid.body;
  const details = body.method === 'card' ? body.card : body.method === 'eft' ? { bank: body.bank } : {};
  const { payment, merchant } = await payments.pay(req.params.slug, {
    method: body.method,
    details,
    payerName: body.payerName,
    payerEmail: body.payerEmail,
  });
  res.json({ payment: publicView(payment, merchant) });
});

module.exports = router;

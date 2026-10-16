const db = require('./index');
const { nowIso, iso, num, whereContains, camelToRow } = require('./util');

const STATUSES = ['pending', 'paid', 'expired', 'cancelled', 'refunded', 'partially_refunded'];
const SETTLED = ['paid', 'partially_refunded', 'refunded'];
const METHODS = ['card', 'eft', 'qr'];

const FIELDS = {
  merchantId: 'merchant_id',
  amount: 'amount',
  currency: 'currency',
  description: 'description',
  reference: 'reference',
  slug: 'slug',
  status: 'status',
  payerName: 'payer_name',
  payerEmail: 'payer_email',
  redirectUrl: 'redirect_url',
  expiresAt: 'expires_at',
  paidAt: 'paid_at',
  method: 'method',
  transactionId: 'transaction_id',
  cardLast4: 'card_last4',
  refundedAmount: 'refunded_amount',
  refundedAt: 'refunded_at',
  cancelledAt: 'cancelled_at',
};

function fromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    merchantId: row.merchant_id,
    amount: num(row.amount),
    currency: row.currency,
    description: row.description,
    reference: row.reference,
    slug: row.slug,
    status: row.status,
    payerName: row.payer_name,
    payerEmail: row.payer_email,
    redirectUrl: row.redirect_url,
    expiresAt: iso(row.expires_at),
    paidAt: iso(row.paid_at),
    method: row.method || null,
    transactionId: row.transaction_id || null,
    cardLast4: row.card_last4 || null,
    failedAttempts: num(row.failed_attempts),
    refundedAmount: num(row.refunded_amount),
    refundedAt: iso(row.refunded_at),
    cancelledAt: iso(row.cancelled_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

const isExpired = (payment, now = new Date()) =>
  payment.status === 'pending' && Boolean(payment.expiresAt) && new Date(payment.expiresAt) <= now;

// Everything the owning merchant may see.
const merchantView = (payment) => {
  const { merchantId, ...rest } = payment;
  return rest;
};

// What an anonymous payer is allowed to see.
const publicView = (payment, merchant) => ({
  slug: payment.slug,
  reference: payment.reference,
  amount: payment.amount,
  currency: payment.currency,
  description: payment.description,
  status: payment.status,
  payerName: payment.payerName,
  expiresAt: payment.expiresAt,
  paidAt: payment.paidAt,
  method: payment.method,
  transactionId: payment.transactionId,
  cardLast4: payment.cardLast4,
  redirectUrl: payment.status === 'paid' ? payment.redirectUrl : '',
  merchant: merchant ? { name: merchant.businessName || merchant.name } : undefined,
});

async function events(paymentId) {
  const rows = await db('payment_events').where({ payment_id: paymentId }).orderBy('id', 'asc');
  return rows.map((r) => ({ type: r.type, message: r.message, at: iso(r.created_at) }));
}

async function findOne(where, { withEvents = false } = {}) {
  const payment = fromRow(await db('payments').where(where).first());
  if (payment && withEvents) payment.events = await events(payment.id);
  return payment;
}

const findById = (id, opts) => findOne({ id }, opts);
const findBySlug = (slug, opts) => findOne({ slug }, opts);
const findOwned = (id, merchantId, opts) => findOne({ id, merchant_id: merchantId }, opts);

const eventRow = (paymentId, type, message) => ({
  payment_id: paymentId,
  type,
  message: (message || '').slice(0, 255),
  created_at: nowIso(),
});

async function create(data, eventMessage) {
  const now = nowIso();
  const id = await db.transaction(async (trx) => {
    const [row] = await trx('payments')
      .insert({ ...camelToRow(data, FIELDS), created_at: now, updated_at: now })
      .returning('id');
    const newId = typeof row === 'object' ? row.id : row;
    await trx('payment_events').insert(eventRow(newId, 'payment.created', eventMessage));
    return newId;
  });
  return findById(id, { withEvents: true });
}

async function addEvent(paymentId, type, message) {
  await db('payment_events').insert(eventRow(paymentId, type, message));
}

/**
 * Atomically apply `patch` only if the row still matches `guard` (snake_case columns),
 * recording `event` in the same transaction. Returns the updated payment, or null if
 * the guard no longer matched (someone else changed it first).
 */
async function transition(id, guard, patch, event) {
  const changed = await db.transaction(async (trx) => {
    const n = await trx('payments')
      .where({ id, ...guard })
      .update({ ...camelToRow(patch, FIELDS), updated_at: nowIso() });
    if (!n) return false;
    if (event) await trx('payment_events').insert(eventRow(id, event.type, event.message));
    return true;
  });
  return changed ? findById(id, { withEvents: true }) : null;
}

async function recordFailure(id, message) {
  await db.transaction(async (trx) => {
    await trx('payments').where({ id }).increment('failed_attempts', 1).update({ updated_at: nowIso() });
    await trx('payment_events').insert(eventRow(id, 'payment.failed', message));
  });
  return findById(id, { withEvents: true });
}

async function findDue(now = new Date(), limit = 500) {
  const rows = await db('payments')
    .where({ status: 'pending' })
    .whereNotNull('expires_at')
    .where('expires_at', '<=', now.toISOString())
    .limit(limit);
  return rows.map(fromRow);
}

function filtered({ merchantId, status, q, from, to } = {}) {
  const query = db('payments');
  if (merchantId) query.where('payments.merchant_id', merchantId);
  if (status && status !== 'all') query.where('payments.status', status);
  if (from) query.where('payments.created_at', '>=', from.toISOString());
  if (to) query.where('payments.created_at', '<=', to.toISOString());
  if (q) {
    whereContains(query, ['payments.reference', 'payments.description', 'payments.payer_name', 'payments.payer_email'], q);
  }
  return query;
}

async function list(filter, { page = 1, limit = 20 } = {}) {
  const [rows, total] = await Promise.all([
    filtered(filter)
      .select('payments.*')
      .orderBy('payments.created_at', 'desc')
      .orderBy('payments.id', 'desc')
      .offset((page - 1) * limit)
      .limit(limit),
    filtered(filter).count({ n: '*' }).first(),
  ]);
  return { items: rows.map(fromRow), total: num(total.n) };
}

async function listWithMerchant(filter, paging) {
  const { items, total } = await list(filter, paging);
  const ids = [...new Set(items.map((p) => p.merchantId))];
  const merchants = ids.length
    ? await db('users').whereIn('id', ids).select('id', 'name', 'email', 'business_name')
    : [];
  const byId = new Map(merchants.map((m) => [m.id, m]));
  return {
    total,
    items: items.map((p) => {
      const m = byId.get(p.merchantId);
      return { ...p, merchant: m ? { id: m.id, name: m.business_name || m.name, email: m.email } : null };
    }),
  };
}

// ---- reporting ----

async function totalsByStatus(merchantId) {
  const query = db('payments')
    .select('status')
    .count({ count: '*' })
    .sum({ amount: 'amount' })
    .sum({ refunded: 'refunded_amount' })
    .groupBy('status');
  if (merchantId) query.where({ merchant_id: merchantId });
  const rows = await query;
  return rows.map((r) => ({ status: r.status, count: num(r.count), amount: num(r.amount), refunded: num(r.refunded) }));
}

async function paidSince(since, merchantId) {
  const query = db('payments')
    .select('amount', 'refunded_amount', 'paid_at')
    .whereIn('status', SETTLED)
    .where('paid_at', '>=', since.toISOString());
  if (merchantId) query.where({ merchant_id: merchantId });
  const rows = await query;
  return rows.map((r) => ({ net: num(r.amount) - num(r.refunded_amount), paidAt: new Date(r.paid_at) }));
}

const volumeColumns = (qb) =>
  qb
    .select('merchant_id')
    .sum({ volume: db.raw('amount - refunded_amount') })
    .count({ count: '*' })
    .whereIn('status', SETTLED)
    .groupBy('merchant_id');

async function volumesFor(merchantIds) {
  if (!merchantIds.length) return new Map();
  const rows = await volumeColumns(db('payments')).whereIn('merchant_id', merchantIds);
  return new Map(rows.map((r) => [r.merchant_id, { volume: num(r.volume), count: num(r.count) }]));
}

async function topMerchants(limit = 5) {
  const rows = await db
    .select('v.merchant_id', 'v.volume', 'v.count', 'u.name', 'u.business_name', 'u.email')
    .from(volumeColumns(db('payments')).as('v'))
    .join('users as u', 'u.id', 'v.merchant_id')
    .orderBy('v.volume', 'desc')
    .limit(limit);
  return rows.map((r) => ({
    id: r.merchant_id,
    volume: num(r.volume),
    count: num(r.count),
    name: r.name,
    businessName: r.business_name,
    email: r.email,
  }));
}

module.exports = {
  STATUSES,
  SETTLED,
  METHODS,
  isExpired,
  merchantView,
  publicView,
  events,
  findById,
  findBySlug,
  findOwned,
  create,
  addEvent,
  transition,
  recordFailure,
  findDue,
  list,
  listWithMerchant,
  totalsByStatus,
  paidSince,
  volumesFor,
  topMerchants,
};

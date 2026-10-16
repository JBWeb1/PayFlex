const db = require('./index');
const { nowIso, iso } = require('./util');

const fromRow = (row) => ({
  id: row.id,
  event: row.event,
  url: row.url,
  attempt: row.attempt,
  success: Boolean(row.success),
  statusCode: row.status_code,
  error: row.error,
  durationMs: row.duration_ms,
  createdAt: iso(row.created_at),
});

async function create(record) {
  await db('webhook_deliveries').insert({
    merchant_id: record.merchantId,
    payment_id: record.paymentId,
    event: record.event,
    url: record.url,
    attempt: record.attempt,
    success: record.success,
    status_code: record.statusCode ?? null,
    error: record.error ? String(record.error).slice(0, 255) : null,
    duration_ms: record.durationMs,
    created_at: nowIso(),
  });
}

async function forPayment(paymentId, limit = 50) {
  const rows = await db('webhook_deliveries').where({ payment_id: paymentId }).orderBy('id', 'desc').limit(limit);
  return rows.map(fromRow);
}

async function countForEvent(event) {
  const row = await db('webhook_deliveries').where({ event }).count({ n: '*' }).first();
  return Number(row.n);
}

module.exports = { create, forPayment, countForEvent };

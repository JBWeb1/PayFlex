const config = require('../config');
const paymentsDb = require('../db/payments');

const DAY = 86_400_000;

function dayKey(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Summary numbers and a daily net revenue series.
 * Pass a merchant id to scope it, or nothing for platform-wide stats.
 */
async function paymentStats(merchantId, days = 30) {
  const since = new Date(Date.now() - days * DAY);
  const [byStatus, paid] = await Promise.all([
    paymentsDb.totalsByStatus(merchantId),
    paymentsDb.paidSince(since, merchantId),
  ]);

  const statuses = Object.fromEntries(paymentsDb.STATUSES.map((s) => [s, { count: 0, amount: 0 }]));
  let refunded = 0;
  for (const row of byStatus) {
    statuses[row.status] = { count: row.count, amount: row.amount };
    refunded += row.refunded;
  }

  const paidCount = paymentsDb.SETTLED.reduce((n, s) => n + statuses[s].count, 0);
  const gross = paymentsDb.SETTLED.reduce((n, s) => n + statuses[s].amount, 0);
  const totalCount = Object.values(statuses).reduce((n, s) => n + s.count, 0);
  // Conversion ignores requests that are still open or were withdrawn by the merchant.
  const closed = paidCount + statuses.expired.count;

  // Bucket by calendar day in the reporting timezone (portable across SQLite and Postgres).
  const series = [];
  const index = new Map();
  for (let i = days - 1; i >= 0; i -= 1) {
    const key = dayKey(new Date(Date.now() - i * DAY));
    if (!index.has(key)) {
      index.set(key, series.length);
      series.push({ date: key, revenue: 0, count: 0 });
    }
  }
  for (const p of paid) {
    const slot = index.get(dayKey(p.paidAt));
    if (slot !== undefined) {
      series[slot].revenue += p.net;
      series[slot].count += 1;
    }
  }

  return {
    currency: config.currency,
    totals: {
      payments: totalCount,
      paid: paidCount,
      pending: statuses.pending.count,
      pendingAmount: statuses.pending.amount,
      grossVolume: gross,
      refunded,
      netVolume: gross - refunded,
      averagePayment: paidCount ? Math.round(gross / paidCount) : 0,
      conversionRate: closed ? paidCount / closed : 0,
    },
    statuses,
    series,
  };
}

module.exports = { paymentStats };

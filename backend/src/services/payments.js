const QRCode = require('qrcode');
const config = require('../config');
const paymentsDb = require('../db/payments');
const users = require('../db/users');
const gateway = require('./gateway');
const realtime = require('./realtime');
const webhooks = require('./webhooks');
const { sendMailSafe } = require('./mailer');
const { newReference, newSlug } = require('../utils/ids');
const { formatMoney } = require('../utils/money');
const { badRequest, conflict, notFound } = require('../utils/httpError');

const payUrl = (payment) => `${config.appUrl}/pay/${payment.slug}`;

function qrDataUrl(payment) {
  return QRCode.toDataURL(payUrl(payment), { width: 320, margin: 1, errorCorrectionLevel: 'M' });
}

async function withLinks(payment) {
  return { ...paymentsDb.merchantView(payment), payUrl: payUrl(payment), qr: await qrDataUrl(payment) };
}

// Emails, websockets and webhooks for a payment lifecycle event. Never throws.
async function announce(event, payment, merchant) {
  const owner = merchant || (await users.findById(payment.merchantId));
  realtime.emitPaymentEvent(event, payment, owner);
  if (!owner) return;
  webhooks.deliverInBackground(owner, event, payment);

  const amount = formatMoney(payment.amount, payment.currency);
  const shopName = users.displayName(owner);
  const label = `${payment.reference}${payment.description ? ` (${payment.description})` : ''}`;

  if (event === 'payment.paid') {
    if (owner.notifyOnPayment) {
      sendMailSafe({
        to: owner.email,
        subject: `You received ${amount}`,
        text: `Good news! Payment ${label} for ${amount} was paid${
          payment.payerName ? ` by ${payment.payerName}` : ''
        }.\nTransaction: ${payment.transactionId}`,
      });
    }
    if (payment.payerEmail) {
      sendMailSafe({
        to: payment.payerEmail,
        subject: `Receipt from ${shopName}: ${amount}`,
        text: `Thanks for your payment to ${shopName}.\n\nReference: ${payment.reference}\nAmount: ${amount}\nTransaction: ${payment.transactionId}\n\nView your receipt: ${payUrl(payment)}`,
      });
    }
  }
  if ((event === 'payment.refunded' || event === 'payment.partially_refunded') && payment.payerEmail) {
    sendMailSafe({
      to: payment.payerEmail,
      subject: `Refund from ${shopName}`,
      text: `${shopName} refunded ${formatMoney(payment.refundedAmount, payment.currency)} for ${payment.reference}.`,
    });
  }
}

function sendPaymentRequestEmail(payment, merchant, { reminder = false } = {}) {
  if (!payment.payerEmail) return null;
  const shopName = users.displayName(merchant);
  const amount = formatMoney(payment.amount, payment.currency);
  return sendMailSafe({
    to: payment.payerEmail,
    subject: `${reminder ? 'Reminder: ' : ''}${shopName} requested ${amount}`,
    text: `Hi${payment.payerName ? ` ${payment.payerName}` : ''},\n\n${shopName} has requested a payment of ${amount}${
      payment.description ? ` for "${payment.description}"` : ''
    }.\n\nPay securely here: ${payUrl(payment)}\n${
      payment.expiresAt ? `This link expires on ${new Date(payment.expiresAt).toUTCString()}.` : ''
    }`,
  });
}

async function createPayment(merchant, input) {
  const hours = input.expiresInHours ?? config.defaultExpiryHours;
  let payment = await paymentsDb.create(
    {
      merchantId: merchant.id,
      amount: input.amount,
      currency: config.currency,
      description: input.description || '',
      payerName: input.payerName || '',
      payerEmail: input.payerEmail || '',
      redirectUrl: input.redirectUrl || '',
      reference: newReference(),
      slug: newSlug(),
      status: 'pending',
      expiresAt: hours > 0 ? new Date(Date.now() + hours * 3_600_000).toISOString() : null,
    },
    `Payment request for ${formatMoney(input.amount, config.currency)} created`
  );

  if (input.sendEmail && payment.payerEmail) {
    sendPaymentRequestEmail(payment, merchant);
    await paymentsDb.addEvent(payment.id, 'payment.request_sent', `Payment request emailed to ${payment.payerEmail}`);
    payment = await paymentsDb.findById(payment.id, { withEvents: true });
  }
  realtime.emitPaymentEvent('payment.created', payment, merchant);
  return payment;
}

// Lazily expire a pending payment whose time has run out.
async function expireIfDue(payment) {
  if (!paymentsDb.isExpired(payment)) return payment;
  const updated = await paymentsDb.transition(
    payment.id,
    { status: 'pending' },
    { status: 'expired' },
    { type: 'payment.expired', message: 'Payment link expired' }
  );
  if (!updated) return paymentsDb.findById(payment.id, { withEvents: true });
  await announce('payment.expired', updated);
  return updated;
}

async function expireDuePayments(now = new Date()) {
  const due = await paymentsDb.findDue(now);
  for (const p of due) {
    // eslint-disable-next-line no-await-in-loop
    await expireIfDue(p);
  }
  return due.length;
}

async function findBySlug(slug) {
  const payment = await paymentsDb.findBySlug(slug);
  if (!payment) throw notFound('Payment not found');
  return expireIfDue(payment);
}

async function pay(slug, { method, details, payerName, payerEmail }) {
  const payment = await findBySlug(slug);
  if (payment.status !== 'pending') {
    throw conflict(`This payment is ${payment.status.replace('_', ' ')} and can no longer be paid`);
  }
  const merchant = await users.findById(payment.merchantId);
  if (!merchant || merchant.status !== 'active') {
    throw conflict('This merchant is not currently accepting payments');
  }

  const result = await gateway.charge({ method, details, payment });
  if (!result.success) {
    const failed = await paymentsDb.recordFailure(payment.id, `${method}: ${result.reason}`);
    await announce('payment.failed', failed, merchant);
    throw badRequest(result.reason);
  }

  const patch = {
    status: 'paid',
    paidAt: new Date().toISOString(),
    method,
    transactionId: result.transactionId,
    cardLast4: result.cardLast4,
  };
  if (payerName && !payment.payerName) patch.payerName = payerName;
  if (payerEmail && !payment.payerEmail) patch.payerEmail = payerEmail.toLowerCase();

  // The status guard makes sure a payment can only be marked paid once.
  const paid = await paymentsDb.transition(payment.id, { status: 'pending' }, patch, {
    type: 'payment.paid',
    message: `Paid by ${method}${result.cardLast4 ? ` (•••• ${result.cardLast4})` : ''}`,
  });
  if (!paid) {
    await gateway.refund({ transactionId: result.transactionId });
    throw conflict('This payment was already completed');
  }
  await announce('payment.paid', paid, merchant);
  return { payment: paid, merchant };
}

async function cancel(payment) {
  if (payment.status !== 'pending') throw conflict(`Only pending payments can be cancelled (status: ${payment.status})`);
  const updated = await paymentsDb.transition(
    payment.id,
    { status: 'pending' },
    { status: 'cancelled', cancelledAt: new Date().toISOString() },
    { type: 'payment.cancelled', message: 'Cancelled by merchant' }
  );
  if (!updated) throw conflict('Payment changed state, please refresh');
  await announce('payment.cancelled', updated);
  return updated;
}

async function refund(payment, amount) {
  if (!['paid', 'partially_refunded'].includes(payment.status)) {
    throw conflict('Only paid payments can be refunded');
  }
  const remaining = payment.amount - payment.refundedAmount;
  const value = amount ?? remaining;
  if (value <= 0 || value > remaining) {
    throw badRequest(`Refund must be between ${formatMoney(1)} and ${formatMoney(remaining, payment.currency)}`);
  }
  const result = await gateway.refund({ transactionId: payment.transactionId, amount: value });
  if (!result.success) throw badRequest(result.reason || 'Refund failed');

  const total = payment.refundedAmount + value;
  const status = total >= payment.amount ? 'refunded' : 'partially_refunded';
  // Guarding on the previous refunded amount stops two refunds racing past the total.
  const updated = await paymentsDb.transition(
    payment.id,
    { refunded_amount: payment.refundedAmount, status: payment.status },
    { status, refundedAmount: total, refundedAt: new Date().toISOString() },
    { type: `payment.${status}`, message: `Refunded ${formatMoney(value, payment.currency)} (${result.refundId})` }
  );
  if (!updated) throw conflict('Payment changed state, please refresh');
  await announce(`payment.${status}`, updated);
  return updated;
}

async function remind(payment, merchant) {
  if (payment.status !== 'pending') throw conflict('Only pending payments can be reminded');
  if (!payment.payerEmail) throw badRequest('This payment has no payer email');
  sendPaymentRequestEmail(payment, merchant, { reminder: true });
  await paymentsDb.addEvent(payment.id, 'payment.reminder_sent', `Reminder emailed to ${payment.payerEmail}`);
  return paymentsDb.findById(payment.id, { withEvents: true });
}

module.exports = {
  payUrl,
  qrDataUrl,
  withLinks,
  createPayment,
  expireIfDue,
  expireDuePayments,
  findBySlug,
  pay,
  cancel,
  refund,
  remind,
};

const crypto = require('crypto');
const config = require('../config');
const deliveries = require('../db/webhookDeliveries');
const { merchantView } = require('../db/payments');

function sign(secret, timestamp, body) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

// Header format: "t=<unix seconds>,v1=<hex hmac>" (see README for verification code).
function signatureHeader(secret, body, timestamp = Math.floor(Date.now() / 1000)) {
  return `t=${timestamp},v1=${sign(secret, timestamp, body)}`;
}

function verifySignature(secret, body, header, toleranceSec = 300) {
  const parts = Object.fromEntries(
    String(header || '')
      .split(',')
      .map((p) => p.split('='))
  );
  const t = Number(parts.t);
  if (!t || !parts.v1) return false;
  if (Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = Buffer.from(sign(secret, t, body));
  const given = Buffer.from(parts.v1);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function attemptDelivery({ merchant, payment, event, url, body, attempt }) {
  const started = Date.now();
  const record = { merchantId: merchant.id, paymentId: payment.id, event, url, attempt };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'PayFlex-Webhooks/1.0',
        'PayFlex-Event': event,
        'PayFlex-Signature': signatureHeader(merchant.webhookSecret, body),
      },
      body,
      signal: AbortSignal.timeout(config.webhook.timeoutMs),
    });
    record.statusCode = res.status;
    record.success = res.ok;
    if (!res.ok) record.error = `HTTP ${res.status}`;
  } catch (err) {
    record.success = false;
    record.error = err.name === 'TimeoutError' ? 'Timed out' : err.message;
  }
  record.durationMs = Date.now() - started;
  await deliveries.create(record);
  return record.success;
}

async function deliver(merchant, event, payment) {
  if (!merchant.webhookUrl) return false;
  const { events, ...data } = merchantView(payment);
  const body = JSON.stringify({
    id: `evt_${crypto.randomBytes(12).toString('hex')}`,
    type: event,
    createdAt: new Date().toISOString(),
    data,
  });

  for (let attempt = 1; attempt <= config.webhook.maxAttempts; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await attemptDelivery({ merchant, payment, event, url: merchant.webhookUrl, body, attempt });
    if (ok) return true;
    if (attempt < config.webhook.maxAttempts) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(config.webhook.retryBaseMs * 2 ** (attempt - 1));
    }
  }
  return false;
}

function deliverInBackground(merchant, event, payment) {
  return deliver(merchant, event, payment).catch((err) => {
    console.error(`[webhook] ${event} for ${payment.reference} crashed: ${err.message}`);
    return false;
  });
}

module.exports = { deliver, deliverInBackground, signatureHeader, verifySignature };

const crypto = require('crypto');
const luhnValid = require('../utils/luhn');

/**
 * Simulated payment gateway.
 *
 * Swap this module for a real provider (PayFast, Yoco, Peach, Stripe, ...) by
 * keeping the same `charge` / `refund` contract. Nothing here moves real money.
 *
 * Test cards:
 *   4242 4242 4242 4242  -> approved
 *   4000 0000 0000 0002  -> declined
 *   4000 0000 0000 9995  -> insufficient funds
 */
const DECLINES = {
  '4000000000000002': 'Card declined by issuer',
  '4000000000009995': 'Insufficient funds',
};

const txnId = () => `txn_${crypto.randomBytes(10).toString('hex')}`;

function validateCard({ number, expiry, cvc, name }) {
  const digits = String(number || '').replace(/\D/g, '');
  if (!name || !String(name).trim()) return 'Cardholder name is required';
  if (!luhnValid(digits)) return 'Card number is invalid';
  const m = /^(\d{2})\s*\/\s*(\d{2})$/.exec(String(expiry || ''));
  if (!m) return 'Expiry must be MM/YY';
  const month = Number(m[1]);
  const year = 2000 + Number(m[2]);
  if (month < 1 || month > 12) return 'Expiry month is invalid';
  const now = new Date();
  if (year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) {
    return 'Card has expired';
  }
  if (!/^\d{3,4}$/.test(String(cvc || ''))) return 'CVC is invalid';
  return null;
}

async function charge({ method, details = {} }) {
  if (method === 'card') {
    const invalid = validateCard(details);
    if (invalid) return { success: false, reason: invalid, retryable: true };
    const digits = String(details.number).replace(/\D/g, '');
    if (DECLINES[digits]) return { success: false, reason: DECLINES[digits], retryable: true };
    return { success: true, transactionId: txnId(), cardLast4: digits.slice(-4) };
  }
  if (method === 'eft') {
    if (!details.bank) return { success: false, reason: 'Choose your bank', retryable: true };
    return { success: true, transactionId: txnId() };
  }
  if (method === 'qr') {
    return { success: true, transactionId: txnId() };
  }
  return { success: false, reason: 'Unsupported payment method', retryable: false };
}

async function refund() {
  return { success: true, refundId: `rfd_${crypto.randomBytes(10).toString('hex')}` };
}

module.exports = { charge, refund, validateCard };

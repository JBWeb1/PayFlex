const { z } = require('zod');

const httpUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    try {
      const { protocol } = new URL(value);
      return protocol === 'http:' || protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Must be a valid http(s) URL');

// Rands with at most two decimals, converted to integer cents.
const amount = z.coerce
  .number({ message: 'Amount must be a number' })
  .positive('Amount must be greater than zero')
  .max(1_000_000, 'Amount is too large')
  .refine((n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6, 'Use at most two decimal places')
  .transform((n) => Math.round(n * 100));

module.exports = { httpUrl, amount };

// Amounts are stored as integer cents to avoid floating point drift.
const toCents = (amount) => Math.round(Number(amount) * 100);
const fromCents = (cents) => Math.round(cents) / 100;

const SYMBOLS = { ZAR: 'R', USD: '$', EUR: '€', GBP: '£' };

// Matches how the web app displays money ("R 1,349.50") regardless of the server's ICU locale data.
function formatMoney(cents, currency = 'ZAR') {
  const n = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    fromCents(cents)
  );
  return `${SYMBOLS[currency] || currency} ${n}`;
}

module.exports = { toCents, fromCents, formatMoney };

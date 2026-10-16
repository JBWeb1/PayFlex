export const formatMoney = (cents, currency = 'ZAR') =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency }).format((cents || 0) / 100);

export const formatCompactMoney = (cents, currency = 'ZAR') =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(
    (cents || 0) / 100
  );

export const formatDate = (value) =>
  value ? new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';

export const formatDay = (value) =>
  new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short' }).format(new Date(`${value}T12:00:00`));

export function timeAgo(value) {
  if (!value) return '';
  const diff = (Date.now() - new Date(value).getTime()) / 1000;
  const future = diff < 0;
  const s = Math.abs(diff);
  const units = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  for (const [unit, secs] of units) {
    if (s >= secs) {
      return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(
        Math.round((future ? 1 : -1) * (s / secs)),
        unit
      );
    }
  }
  return future ? 'in a moment' : 'just now';
}

export const STATUS_META = {
  pending: { label: 'Pending', className: 'bg-amber-50 text-amber-800 ring-amber-200' },
  paid: { label: 'Paid', className: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  expired: { label: 'Expired', className: 'bg-slate-100 text-slate-600 ring-slate-200' },
  cancelled: { label: 'Cancelled', className: 'bg-slate-100 text-slate-600 ring-slate-200' },
  refunded: { label: 'Refunded', className: 'bg-violet-50 text-violet-800 ring-violet-200' },
  partially_refunded: { label: 'Part refunded', className: 'bg-violet-50 text-violet-800 ring-violet-200' },
};

export const METHOD_LABELS = { card: 'Card', eft: 'Instant EFT', qr: 'QR scan' };

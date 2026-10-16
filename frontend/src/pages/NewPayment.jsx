import { useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage, fieldErrors } from '../lib/api';
import { formatMoney } from '../lib/format';
import ShareLink from '../components/ShareLink';
import { Field, PageHeader } from '../components/ui';
import { useAuth } from '../context/AuthContext';

const EXPIRY_OPTIONS = [
  [1, '1 hour'],
  [24, '24 hours'],
  [72, '3 days'],
  [168, '7 days'],
  [720, '30 days'],
  [0, 'Never'],
];

const QUICK_AMOUNTS = [50, 100, 250, 500];

const EMPTY = {
  amount: '',
  description: '',
  payerName: '',
  payerEmail: '',
  expiresInHours: 72,
  redirectUrl: '',
  sendEmail: true,
};

export default function NewPayment() {
  const { user } = useAuth();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);
  const [advanced, setAdvanced] = useState(false);

  const set = (key) => (e) =>
    setForm({ ...form, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setError('');
    try {
      const res = await api.post('/payments', {
        ...form,
        amount: Number(form.amount),
        expiresInHours: Number(form.expiresInHours),
        sendEmail: Boolean(form.payerEmail) && form.sendEmail,
      });
      setCreated(res.data.payment);
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <>
        <PageHeader title="Payment request ready 🎉" subtitle={`Reference ${created.reference}`} />
        <div className="card max-w-3xl p-6">
          <p className="mb-1 text-3xl font-bold tabular-nums">{formatMoney(created.amount, created.currency)}</p>
          {created.description && <p className="mb-4 text-slate-600">{created.description}</p>}
          {created.payerEmail && created.events.some((ev) => ev.type === 'payment.request_sent') && (
            <p className="mb-4 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">
              We emailed the payment link to {created.payerEmail}.
            </p>
          )}
          <ShareLink payment={created} merchantName={user.businessName || user.name} />
          <div className="mt-6 flex gap-2 border-t border-slate-100 pt-4">
            <Link to={`/app/payments/${created.id}`} className="btn-secondary">
              View details
            </Link>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setCreated(null);
                setForm(EMPTY);
              }}
            >
              Create another
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="New payment request" subtitle="Create a link and QR code your customer can pay." />
      <form onSubmit={submit} className="card max-w-2xl space-y-5 p-6">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <Field label="Amount (R)" error={errors.amount}>
          <input
            className="input text-lg font-semibold"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            required
            placeholder="0.00"
            value={form.amount}
            onChange={set('amount')}
          />
        </Field>
        <div className="-mt-3 flex gap-2">
          {QUICK_AMOUNTS.map((a) => (
            <button key={a} type="button" className="btn-secondary px-3 py-1 text-xs" onClick={() => setForm({ ...form, amount: String(a) })}>
              R{a}
            </button>
          ))}
        </div>

        <Field label="What is it for?" error={errors.description}>
          <input
            className="input"
            maxLength={200}
            placeholder="e.g. Invoice #1042, haircut, catering deposit"
            value={form.description}
            onChange={set('description')}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Customer name (optional)" error={errors.payerName}>
            <input className="input" maxLength={80} value={form.payerName} onChange={set('payerName')} />
          </Field>
          <Field label="Customer email (optional)" error={errors.payerEmail}>
            <input className="input" type="email" value={form.payerEmail} onChange={set('payerEmail')} />
          </Field>
        </div>
        {form.payerEmail && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.sendEmail} onChange={set('sendEmail')} className="h-4 w-4 accent-brand-700" />
            Email the payment link to the customer
          </label>
        )}

        <Field label="Link expires after" error={errors.expiresInHours}>
          <select className="input" value={form.expiresInHours} onChange={set('expiresInHours')}>
            {EXPIRY_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>

        <button type="button" className="text-sm font-medium text-brand-700" onClick={() => setAdvanced((a) => !a)}>
          {advanced ? '− Hide' : '+ Show'} advanced options
        </button>
        {advanced && (
          <Field label="Redirect after payment" hint="Send the customer back to your site once they’ve paid" error={errors.redirectUrl}>
            <input className="input" type="url" placeholder="https://yourshop.co.za/thanks" value={form.redirectUrl} onChange={set('redirectUrl')} />
          </Field>
        )}

        <button type="submit" className="btn-primary w-full py-3" disabled={busy}>
          {busy ? 'Creating…' : 'Create payment request'}
        </button>
      </form>
    </>
  );
}

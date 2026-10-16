import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api, { errorMessage } from '../lib/api';
import { connectSocket } from '../lib/socket';
import { formatDate, formatMoney, METHOD_LABELS } from '../lib/format';
import { Field, Logo, PageLoader, Spinner } from '../components/ui';

const BANKS = ['ABSA', 'Capitec', 'Discovery Bank', 'FNB', 'Investec', 'Nedbank', 'Standard Bank', 'TymeBank'];

const formatCardNumber = (v) =>
  v
    .replace(/\D/g, '')
    .slice(0, 19)
    .replace(/(.{4})/g, '$1 ')
    .trim();

const formatExpiry = (v) => {
  const d = v.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
};

function Receipt({ payment }) {
  const [seconds, setSeconds] = useState(payment.redirectUrl ? 8 : null);

  useEffect(() => {
    if (seconds === null) return undefined;
    if (seconds <= 0) {
      window.location.assign(payment.redirectUrl);
      return undefined;
    }
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds, payment.redirectUrl]);

  return (
    <div className="text-center">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-3xl text-emerald-700">✓</div>
      <h2 className="mt-4 text-xl font-bold">Payment successful</h2>
      <p className="mt-1 text-slate-600">Thank you{payment.payerName ? `, ${payment.payerName}` : ''}!</p>
      <dl className="mt-6 divide-y divide-slate-100 rounded-lg border border-slate-200 text-left text-sm">
        {[
          ['Paid to', payment.merchant?.name],
          ['Amount', formatMoney(payment.amount, payment.currency)],
          ['Reference', payment.reference],
          ['Method', `${METHOD_LABELS[payment.method] || ''}${payment.cardLast4 ? ` •••• ${payment.cardLast4}` : ''}`],
          ['Date', formatDate(payment.paidAt)],
          ['Transaction', payment.transactionId],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 px-4 py-2">
            <dt className="text-slate-500">{k}</dt>
            <dd className="break-all text-right font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="no-print mt-6 flex flex-col gap-2">
        <button type="button" className="btn-secondary" onClick={() => window.print()}>
          Print / save receipt
        </button>
        {payment.redirectUrl && (
          <a href={payment.redirectUrl} className="btn-primary">
            Return to {payment.merchant?.name} {seconds > 0 && `(${seconds})`}
          </a>
        )}
      </div>
    </div>
  );
}

function Closed({ payment }) {
  const copy = {
    expired: ['This payment link has expired', 'Ask the merchant to send you a new link.'],
    cancelled: ['This payment request was cancelled', 'No payment is needed.'],
    refunded: ['This payment was refunded', 'The full amount has been returned.'],
    partially_refunded: ['This payment was partly refunded', `${formatMoney(payment.amount, payment.currency)} was paid.`],
  }[payment.status] || ['This payment is no longer available', ''];
  return (
    <div className="py-6 text-center">
      <h2 className="text-lg font-bold">{copy[0]}</h2>
      <p className="mt-2 text-sm text-slate-600">{copy[1]}</p>
    </div>
  );
}

function Checkout({ payment, slug, onPaid }) {
  const [method, setMethod] = useState('card');
  const [card, setCard] = useState({ name: '', number: '', expiry: '', cvc: '' });
  const [bank, setBank] = useState('');
  const [payer, setPayer] = useState({ payerName: payment.payerName || '', payerEmail: '' });
  const [qr, setQr] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (method === 'qr' && !qr) {
      api
        .get(`/public/payments/${slug}/qr`)
        .then((res) => setQr(res.data.qr))
        .catch(() => {});
    }
  }, [method, qr, slug]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body = { method, ...payer };
    if (method === 'card') body.card = card;
    if (method === 'eft') body.bank = bank;
    try {
      const res = await api.post(`/public/payments/${slug}/pay`, body);
      onPaid(res.data.payment);
    } catch (err) {
      setError(errorMessage(err, 'Payment failed, please try again'));
    } finally {
      setBusy(false);
    }
  };

  const tab = (m) =>
    `flex-1 rounded-md px-3 py-2 text-sm font-medium ${method === m ? 'bg-white text-slate-900 shadow' : 'text-slate-600'}`;

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1" role="tablist">
        {['card', 'eft', 'qr'].map((m) => (
          <button key={m} type="button" role="tab" aria-selected={method === m} className={tab(m)} onClick={() => setMethod(m)}>
            {METHOD_LABELS[m]}
          </button>
        ))}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {method === 'card' && (
        <div className="space-y-3">
          <Field label="Name on card">
            <input className="input" autoComplete="cc-name" required value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} />
          </Field>
          <Field label="Card number">
            <input
              className="input font-mono"
              inputMode="numeric"
              autoComplete="cc-number"
              placeholder="4242 4242 4242 4242"
              required
              value={card.number}
              onChange={(e) => setCard({ ...card, number: formatCardNumber(e.target.value) })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Expiry">
              <input
                className="input font-mono"
                inputMode="numeric"
                autoComplete="cc-exp"
                placeholder="MM/YY"
                required
                value={card.expiry}
                onChange={(e) => setCard({ ...card, expiry: formatExpiry(e.target.value) })}
              />
            </Field>
            <Field label="CVC">
              <input
                className="input font-mono"
                inputMode="numeric"
                autoComplete="cc-csc"
                placeholder="123"
                required
                value={card.cvc}
                onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/\D/g, '').slice(0, 4) })}
              />
            </Field>
          </div>
        </div>
      )}

      {method === 'eft' && (
        <Field label="Your bank">
          <select className="input" required value={bank} onChange={(e) => setBank(e.target.value)}>
            <option value="">Choose your bank…</option>
            {BANKS.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </Field>
      )}

      {method === 'qr' && (
        <div className="flex flex-col items-center gap-2 text-center">
          {qr ? <img src={qr} alt="Payment QR code" className="h-48 w-48 rounded-lg border border-slate-200" /> : <Spinner />}
          <p className="text-sm text-slate-600">
            Scan with your phone camera or banking app. This page updates automatically once you’ve paid.
          </p>
        </div>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer text-slate-600">Want an emailed receipt?</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input
            className="input"
            placeholder="Your name"
            value={payer.payerName}
            onChange={(e) => setPayer({ ...payer, payerName: e.target.value })}
          />
          <input
            className="input"
            type="email"
            placeholder="Email for receipt"
            value={payer.payerEmail}
            onChange={(e) => setPayer({ ...payer, payerEmail: e.target.value })}
          />
        </div>
      </details>

      <button type="submit" className="btn-primary w-full py-3 text-base" disabled={busy}>
        {busy ? 'Processing…' : method === 'qr' ? 'Simulate scan-to-pay' : `Pay ${formatMoney(payment.amount, payment.currency)}`}
      </button>
      <p className="text-center text-xs text-slate-400">
        🔒 Demo checkout — no real money moves. Test card 4242 4242 4242 4242, any future expiry and CVC.
      </p>
    </form>
  );
}

export default function PayPage() {
  const { slug } = useParams();
  const [payment, setPayment] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get(`/public/payments/${slug}`)
      .then((res) => setPayment(res.data.payment))
      .catch((err) => setError(errorMessage(err, 'Payment not found')));

    // Live updates: e.g. paid on another device after scanning the QR code.
    const socket = connectSocket();
    socket.on('connect', () => socket.emit('payment:subscribe', slug));
    socket.on('payment:update', ({ payment: p }) => setPayment(p));
    return () => socket.disconnect();
  }, [slug]);

  return (
    <div className="flex min-h-screen flex-col items-center bg-gradient-to-b from-brand-50 to-slate-50 px-4 py-10">
      <div className="w-full max-w-md">
        {error ? (
          <div className="card p-8 text-center">
            <h1 className="text-lg font-bold">{error}</h1>
            <p className="mt-2 text-sm text-slate-600">Check the link you were sent, or contact the merchant.</p>
          </div>
        ) : !payment ? (
          <PageLoader />
        ) : (
          <div className="card overflow-hidden">
            <div className="border-b border-slate-100 bg-white px-6 py-5 text-center">
              <p className="text-sm text-slate-500">{payment.merchant?.name} requests</p>
              <p className="mt-1 text-4xl font-bold tabular-nums">{formatMoney(payment.amount, payment.currency)}</p>
              {payment.description && <p className="mt-2 text-slate-700">{payment.description}</p>}
              <p className="mt-2 font-mono text-xs text-slate-400">{payment.reference}</p>
              {payment.status === 'pending' && payment.expiresAt && (
                <p className="mt-1 text-xs text-slate-500">Link valid until {formatDate(payment.expiresAt)}</p>
              )}
            </div>
            <div className="p-6">
              {payment.status === 'paid' ? (
                <Receipt payment={payment} />
              ) : payment.status === 'pending' ? (
                <Checkout payment={payment} slug={slug} onPaid={setPayment} />
              ) : (
                <Closed payment={payment} />
              )}
            </div>
          </div>
        )}
        <p className="no-print mt-6 flex items-center justify-center gap-2 text-xs text-slate-500">
          Powered by <Logo className="scale-75 text-sm" />
        </p>
      </div>
    </div>
  );
}

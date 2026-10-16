import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { errorMessage } from '../lib/api';
import { formatDate, formatMoney, METHOD_LABELS, timeAgo } from '../lib/format';
import { usePaymentEvents } from '../components/Layout';
import ShareLink from '../components/ShareLink';
import { PageHeader, PageLoader, StatusBadge } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const EVENT_LABELS = {
  'payment.created': 'Created',
  'payment.request_sent': 'Request emailed',
  'payment.reminder_sent': 'Reminder sent',
  'payment.failed': 'Attempt failed',
  'payment.paid': 'Paid',
  'payment.expired': 'Expired',
  'payment.cancelled': 'Cancelled',
  'payment.refunded': 'Refunded',
  'payment.partially_refunded': 'Partially refunded',
};

function Row({ label, children }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium">{children || '—'}</dd>
    </div>
  );
}

export default function PaymentDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const [payment, setPayment] = useState(null);
  const [hooks, setHooks] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [refundAmount, setRefundAmount] = useState('');

  const load = useCallback(async () => {
    try {
      const [p, h] = await Promise.all([api.get(`/payments/${id}`), api.get(`/payments/${id}/webhooks`)]);
      setPayment(p.data.payment);
      setHooks(h.data.items);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);
  usePaymentEvents(
    useCallback(
      ({ payment: p }) => {
        if (String(p.id) === String(id)) load();
      },
      [id, load]
    )
  );

  const act = async (action, body, success) => {
    setBusy(action);
    try {
      const res = await api.post(`/payments/${id}/${action}`, body);
      setPayment(res.data.payment);
      toast.success(success);
      setRefundAmount('');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy('');
    }
  };

  if (error) {
    return (
      <div className="card p-8 text-center">
        <p className="font-semibold">{error}</p>
        <Link to="/app/payments" className="mt-4 inline-block text-brand-700">
          Back to payments
        </Link>
      </div>
    );
  }
  if (!payment) return <PageLoader />;

  const refundable = payment.amount - payment.refundedAmount;
  const canRefund = ['paid', 'partially_refunded'].includes(payment.status);
  const isPending = payment.status === 'pending';

  return (
    <>
      <Link to="/app/payments" className="mb-4 inline-block text-sm text-slate-500 hover:text-slate-800">
        ← All payments
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {formatMoney(payment.amount, payment.currency)} <StatusBadge status={payment.status} />
          </span>
        }
        subtitle={`${payment.reference}${payment.description ? ` · ${payment.description}` : ''}`}
        actions={
          isPending && (
            <>
              {payment.payerEmail && (
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={busy === 'remind'}
                  onClick={() => act('remind', {}, `Reminder sent to ${payment.payerEmail}`)}
                >
                  Send reminder
                </button>
              )}
              <button
                type="button"
                className="btn-danger"
                disabled={busy === 'cancel'}
                onClick={() => window.confirm('Cancel this payment request? The link will stop working.') && act('cancel', {}, 'Payment cancelled')}
              >
                Cancel request
              </button>
            </>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {isPending && (
            <section className="card p-5">
              <h2 className="mb-4 font-semibold">Share with your customer</h2>
              <ShareLink payment={payment} merchantName={user.businessName || user.name} />
            </section>
          )}

          {canRefund && (
            <section className="card p-5">
              <h2 className="font-semibold">Refund</h2>
              <p className="mb-3 text-sm text-slate-500">
                {formatMoney(refundable, payment.currency)} can still be refunded.
              </p>
              <form
                className="flex flex-col gap-2 sm:flex-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  const amount = refundAmount ? Number(refundAmount) : undefined;
                  const label = formatMoney(amount ? Math.round(amount * 100) : refundable, payment.currency);
                  if (window.confirm(`Refund ${label} to the customer?`)) act('refund', { amount }, `Refunded ${label}`);
                }}
              >
                <input
                  className="input sm:max-w-[12rem]"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={refundable / 100}
                  placeholder={`Full: ${(refundable / 100).toFixed(2)}`}
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                />
                <button type="submit" className="btn-danger" disabled={busy === 'refund'}>
                  {refundAmount ? 'Refund amount' : 'Refund in full'}
                </button>
              </form>
            </section>
          )}

          <section className="card p-5">
            <h2 className="mb-4 font-semibold">Timeline</h2>
            <ol className="relative space-y-4 border-l border-slate-200 pl-5">
              {payment.events
                .slice()
                .reverse()
                .map((ev, i) => (
                  <li key={`${ev.at}-${i}`} className="relative">
                    <span
                      className={`absolute -left-[1.6rem] top-1 h-3 w-3 rounded-full ring-4 ring-white ${
                        ev.type === 'payment.paid' ? 'bg-emerald-500' : ev.type === 'payment.failed' ? 'bg-red-500' : 'bg-slate-300'
                      }`}
                    />
                    <p className="text-sm font-medium">{EVENT_LABELS[ev.type] || ev.type}</p>
                    {ev.message && <p className="text-sm text-slate-600">{ev.message}</p>}
                    <p className="text-xs text-slate-400" title={formatDate(ev.at)}>
                      {timeAgo(ev.at)}
                    </p>
                  </li>
                ))}
            </ol>
          </section>

          {hooks.length > 0 && (
            <section className="card overflow-hidden">
              <h2 className="border-b border-slate-100 px-5 py-4 font-semibold">Webhook deliveries</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="th">Event</th>
                      <th className="th">Attempt</th>
                      <th className="th">Result</th>
                      <th className="th">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {hooks.map((h) => (
                      <tr key={h.id}>
                        <td className="td font-mono text-xs">{h.event}</td>
                        <td className="td">#{h.attempt}</td>
                        <td className={`td ${h.success ? 'text-emerald-700' : 'text-red-700'}`}>
                          {h.success ? `✓ ${h.statusCode}` : `✕ ${h.error || h.statusCode}`}
                          <span className="ml-2 text-xs text-slate-400">{h.durationMs}ms</span>
                        </td>
                        <td className="td text-slate-500">{formatDate(h.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>

        <aside className="card h-fit p-5">
          <h2 className="mb-2 font-semibold">Details</h2>
          <dl className="divide-y divide-slate-100">
            <Row label="Reference">
              <span className="font-mono text-xs">{payment.reference}</span>
            </Row>
            <Row label="Created">{formatDate(payment.createdAt)}</Row>
            <Row label="Expires">{payment.expiresAt ? formatDate(payment.expiresAt) : 'Never'}</Row>
            <Row label="Customer">{payment.payerName}</Row>
            <Row label="Customer email">{payment.payerEmail}</Row>
            <Row label="Paid">{payment.paidAt && formatDate(payment.paidAt)}</Row>
            <Row label="Method">
              {payment.method && `${METHOD_LABELS[payment.method]}${payment.cardLast4 ? ` •••• ${payment.cardLast4}` : ''}`}
            </Row>
            <Row label="Transaction">{payment.transactionId && <span className="font-mono text-xs">{payment.transactionId}</span>}</Row>
            <Row label="Failed attempts">{String(payment.failedAttempts)}</Row>
            {payment.refundedAmount > 0 && <Row label="Refunded">{formatMoney(payment.refundedAmount, payment.currency)}</Row>}
          </dl>
        </aside>
      </div>
    </>
  );
}

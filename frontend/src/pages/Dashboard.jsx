import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../lib/api';
import { formatMoney, timeAgo } from '../lib/format';
import { usePaymentEvents } from '../components/Layout';
import RevenueChart from '../components/RevenueChart';
import { EmptyState, PageHeader, PageLoader, StatCard, StatusBadge } from '../components/ui';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([api.get('/payments/stats'), api.get('/payments', { params: { limit: 6 } })]);
      setStats(s.data);
      setRecent(r.data.items);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  usePaymentEvents(load);

  if (error) return <p className="text-red-700">{error}</p>;
  if (!stats) return <PageLoader />;

  const { totals, currency, series } = stats;
  const last30 = series.reduce((n, d) => n + d.revenue, 0);

  return (
    <>
      <PageHeader
        title={`Hi, ${user.name.split(' ')[0]} 👋`}
        subtitle="Here’s how your payments are doing."
        actions={
          <Link to="/app/payments/new" className="btn-primary">
            + New payment request
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Net volume" value={formatMoney(totals.netVolume, currency)} hint={`${totals.paid} paid payment${totals.paid === 1 ? '' : 's'}`} />
        <StatCard
          label="Awaiting payment"
          value={formatMoney(totals.pendingAmount, currency)}
          hint={`${totals.pending} open request${totals.pending === 1 ? '' : 's'}`}
        />
        <StatCard label="Average payment" value={formatMoney(totals.averagePayment, currency)} />
        <StatCard
          label="Conversion"
          value={`${Math.round(totals.conversionRate * 100)}%`}
          hint="Paid vs. paid + expired"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-semibold">Revenue, last 30 days</h2>
            <span className="text-sm text-slate-500">{formatMoney(last30, currency)}</span>
          </div>
          <RevenueChart series={series} currency={currency} />
        </section>

        <section className="card">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold">Recent activity</h2>
            <Link to="/app/payments" className="text-sm font-medium text-brand-700">
              View all
            </Link>
          </div>
          {recent.length === 0 ? (
            <EmptyState
              title="No payments yet"
              action={
                <Link to="/app/payments/new" className="btn-primary">
                  Create your first request
                </Link>
              }
            >
              Create a payment request and share the link or QR code with your customer.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recent.map((p) => (
                <li key={p.id}>
                  <Link to={`/app/payments/${p.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{p.description || p.reference}</p>
                      <p className="text-xs text-slate-500">{timeAgo(p.createdAt)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums">{formatMoney(p.amount, p.currency)}</p>
                      <StatusBadge status={p.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

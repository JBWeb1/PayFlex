import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import api, { errorMessage } from '../lib/api';
import { formatDate, formatMoney, STATUS_META } from '../lib/format';
import RevenueChart from '../components/RevenueChart';
import { PageHeader, PageLoader, Pagination, StatCard, StatusBadge } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

function Users({ currentUserId }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    const res = await api.get('/admin/users', { params: { q: q || undefined, page } });
    setData(res.data);
  }, [q, page]);

  useEffect(() => {
    const t = setTimeout(() => load().catch((err) => toast.error(errorMessage(err))), 250);
    return () => clearTimeout(t);
  }, [load, toast]);

  const update = async (user, patch, message) => {
    try {
      await api.patch(`/admin/users/${user.id}`, patch);
      toast.success(message);
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <section className="card">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-4">
        <h2 className="font-semibold">Merchants</h2>
        <input
          className="input max-w-xs"
          type="search"
          placeholder="Search users…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">User</th>
              <th className="th">Role</th>
              <th className="th text-right">Volume</th>
              <th className="th">Joined</th>
              <th className="th">Status</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data?.items.map((u) => (
              <tr key={u.id}>
                <td className="td">
                  <p className="font-medium">{u.businessName || u.name}</p>
                  <p className="text-xs text-slate-500">{u.email}</p>
                </td>
                <td className="td capitalize">{u.role}</td>
                <td className="td text-right tabular-nums">
                  {formatMoney(u.volume)} <span className="text-xs text-slate-400">({u.paidCount})</span>
                </td>
                <td className="td text-slate-600">{formatDate(u.createdAt)}</td>
                <td className="td">
                  <span className={u.status === 'active' ? 'text-emerald-700' : 'text-red-700'}>{u.status}</span>
                </td>
                <td className="td text-right">
                  {u.id !== currentUserId && (
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="btn-secondary px-2 py-1 text-xs"
                        onClick={() =>
                          update(u, { role: u.role === 'admin' ? 'merchant' : 'admin' }, `${u.email} is now ${u.role === 'admin' ? 'a merchant' : 'an admin'}`)
                        }
                      >
                        {u.role === 'admin' ? 'Make merchant' : 'Make admin'}
                      </button>
                      <button
                        type="button"
                        className={`${u.status === 'active' ? 'btn-danger' : 'btn-secondary'} px-2 py-1 text-xs`}
                        onClick={() =>
                          update(
                            u,
                            { status: u.status === 'active' ? 'suspended' : 'active' },
                            `${u.email} ${u.status === 'active' ? 'suspended' : 'reactivated'}`
                          )
                        }
                      >
                        {u.status === 'active' ? 'Suspend' : 'Reactivate'}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && <Pagination page={data.page} pages={data.pages} total={data.total} onChange={setPage} />}
    </section>
  );
}

function AllPayments() {
  const toast = useToast();
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);

  useEffect(() => {
    api
      .get('/admin/payments', { params: { status, page } })
      .then((res) => setData(res.data))
      .catch((err) => toast.error(errorMessage(err)));
  }, [status, page, toast]);

  return (
    <section className="card">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-4">
        <h2 className="font-semibold">All payments</h2>
        <select
          className="input max-w-[12rem]"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">All statuses</option>
          {Object.entries(STATUS_META).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Reference</th>
              <th className="th">Merchant</th>
              <th className="th text-right">Amount</th>
              <th className="th">Status</th>
              <th className="th">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data?.items.map((p) => (
              <tr key={p.id}>
                <td className="td font-mono text-xs">{p.reference}</td>
                <td className="td">{p.merchant?.name}</td>
                <td className="td text-right tabular-nums">{formatMoney(p.amount, p.currency)}</td>
                <td className="td">
                  <StatusBadge status={p.status} />
                </td>
                <td className="td text-slate-600">{formatDate(p.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && <Pagination page={data.page} pages={data.pages} total={data.total} onChange={setPage} />}
    </section>
  );
}

export default function Admin() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user.role !== 'admin') return;
    api
      .get('/admin/stats')
      .then((res) => setStats(res.data))
      .catch((err) => setError(errorMessage(err)));
  }, [user.role]);

  if (user.role !== 'admin') return <Navigate to="/app" replace />;
  if (error) return <p className="text-red-700">{error}</p>;
  if (!stats) return <PageLoader />;

  return (
    <>
      <PageHeader title="Admin" subtitle="Platform-wide activity across all merchants." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Net volume" value={formatMoney(stats.totals.netVolume, stats.currency)} />
        <StatCard label="Payments" value={stats.totals.payments} hint={`${stats.totals.paid} paid`} />
        <StatCard label="Merchants" value={stats.users.total} hint={`${stats.users.suspended} suspended`} />
        <StatCard label="Conversion" value={`${Math.round(stats.totals.conversionRate * 100)}%`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <h2 className="mb-4 font-semibold">Platform revenue, last 30 days</h2>
          <RevenueChart series={stats.series} currency={stats.currency} />
        </section>
        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Top merchants</h2>
          {stats.topMerchants.length === 0 ? (
            <p className="text-sm text-slate-500">No paid volume yet.</p>
          ) : (
            <ol className="space-y-3">
              {stats.topMerchants.map((m, i) => (
                <li key={m.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="mr-2 text-slate-400">{i + 1}.</span>
                    {m.businessName || m.name}
                  </span>
                  <span className="font-semibold tabular-nums">{formatMoney(m.volume, stats.currency)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <div className="mt-6 space-y-6">
        <Users currentUserId={user.id} />
        <AllPayments />
      </div>
    </>
  );
}

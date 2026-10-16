import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api, { downloadFile, errorMessage } from '../lib/api';
import { formatDate, formatMoney, METHOD_LABELS, STATUS_META } from '../lib/format';
import { usePaymentEvents } from '../components/Layout';
import { EmptyState, PageHeader, Pagination, Spinner, StatusBadge } from '../components/ui';
import { useToast } from '../context/ToastContext';

export default function Payments() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || 'all';
  const q = params.get('q') || '';
  const page = Number(params.get('page')) || 1;

  const [search, setSearch] = useState(q);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const update = (next) => {
    const merged = { status, q, page: 1, ...next };
    const clean = Object.fromEntries(
      Object.entries(merged).filter(([k, v]) => v && !(k === 'status' && v === 'all') && !(k === 'page' && v === 1))
    );
    setParams(clean);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/payments', { params: { status, q: q || undefined, page } });
      setData(res.data);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [status, q, page, toast]);

  useEffect(() => {
    load();
  }, [load]);
  usePaymentEvents(load);

  // Debounce the search box into the URL.
  useEffect(() => {
    if (search === q) return undefined;
    const t = setTimeout(() => update({ q: search }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const exportCsv = async () => {
    try {
      await downloadFile(
        '/payments/export.csv',
        { status, q: q || undefined },
        `payflex-payments-${new Date().toISOString().slice(0, 10)}.csv`
      );
    } catch (err) {
      toast.error(errorMessage(err, 'Export failed'));
    }
  };

  return (
    <>
      <PageHeader
        title="Payments"
        subtitle="Every payment request you’ve created."
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={exportCsv}>
              Export CSV
            </button>
            <Link to="/app/payments/new" className="btn-primary">
              + New request
            </Link>
          </>
        }
      />

      <div className="card">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row">
          <input
            className="input sm:max-w-xs"
            type="search"
            placeholder="Search reference, description, payer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="flex flex-wrap gap-1">
            {['all', ...Object.keys(STATUS_META)].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => update({ status: s })}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  status === s ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {s === 'all' ? 'All' : STATUS_META[s].label}
              </button>
            ))}
          </div>
          {loading && <Spinner className="ml-auto h-5 w-5 self-center" />}
        </div>

        {data && data.items.length === 0 ? (
          <EmptyState title="No payments found">
            {q || status !== 'all' ? 'Try a different search or filter.' : 'Create a payment request to get started.'}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Reference</th>
                  <th className="th">Description</th>
                  <th className="th">Payer</th>
                  <th className="th text-right">Amount</th>
                  <th className="th">Status</th>
                  <th className="th">Method</th>
                  <th className="th">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.items.map((p) => (
                  <tr
                    key={p.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => navigate(`/app/payments/${p.id}`)}
                  >
                    <td className="td font-mono text-xs">
                      <Link to={`/app/payments/${p.id}`} onClick={(e) => e.stopPropagation()}>
                        {p.reference}
                      </Link>
                    </td>
                    <td className="td max-w-[16rem] truncate">{p.description || '—'}</td>
                    <td className="td text-slate-600">{p.payerName || p.payerEmail || '—'}</td>
                    <td className="td text-right font-semibold tabular-nums">{formatMoney(p.amount, p.currency)}</td>
                    <td className="td">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="td text-slate-600">{METHOD_LABELS[p.method] || '—'}</td>
                    <td className="td text-slate-600">{formatDate(p.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pagination page={data.page} pages={data.pages} total={data.total} onChange={(p) => update({ page: p })} />}
      </div>
    </>
  );
}

import { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { connectSocket } from '../lib/socket';
import { formatMoney } from '../lib/format';
import { Logo, PageLoader } from './ui';

const EVENT = 'payflex:payment';

// Pages call this to refresh when a live payment event arrives.
export function usePaymentEvents(handler) {
  useEffect(() => {
    const listener = (e) => handler(e.detail);
    window.addEventListener(EVENT, listener);
    return () => window.removeEventListener(EVENT, listener);
  }, [handler]);
}

function useLiveNotifications(token) {
  const toast = useToast();
  useEffect(() => {
    if (!token) return undefined;
    const socket = connectSocket(token);
    socket.on('payment:event', (detail) => {
      window.dispatchEvent(new CustomEvent(EVENT, { detail }));
      const { event, payment } = detail;
      const amount = formatMoney(payment.amount, payment.currency);
      if (event === 'payment.paid') toast.success(`💸 ${amount} received for ${payment.reference}`);
      if (event === 'payment.failed') toast.error(`A payment attempt on ${payment.reference} failed`);
    });
    return () => socket.disconnect();
  }, [token, toast]);
}

const NAV = [
  { to: '/app', label: 'Overview', end: true },
  // "Payments" covers payment detail pages but not the "New request" page.
  { to: '/app/payments', label: 'Payments', exclude: '/app/payments/new' },
  { to: '/app/payments/new', label: 'New request' },
  { to: '/app/settings', label: 'Settings' },
];

export default function Layout() {
  const { user, token, loading, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  useLiveNotifications(user ? token : null);

  useEffect(() => setMenuOpen(false), [location.pathname]);

  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  const links = user.role === 'admin' ? [...NAV, { to: '/app/admin', label: 'Admin' }] : NAV;
  const navClass = (link) => ({ isActive }) =>
    `block rounded-lg px-3 py-2 text-sm font-medium ${
      isActive && location.pathname !== link.exclude
        ? 'bg-brand-50 text-brand-800'
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`;

  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/app">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={navClass(l)}>
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="hidden items-center gap-3 md:flex">
            <span className="text-sm text-slate-500">{user.businessName || user.name}</span>
            <button type="button" className="btn-secondary px-3 py-1.5" onClick={logout}>
              Log out
            </button>
          </div>
          <button
            type="button"
            className="btn-secondary px-3 py-1.5 md:hidden"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            Menu
          </button>
        </div>
        {menuOpen && (
          <nav className="space-y-1 border-t border-slate-200 px-4 py-3 md:hidden">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={navClass(l)}>
                {l.label}
              </NavLink>
            ))}
            <button type="button" className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-600" onClick={logout}>
              Log out
            </button>
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}

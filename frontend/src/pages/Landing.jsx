import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Logo } from '../components/ui';

const FEATURES = [
  ['Payment links & QR codes', 'Create a request in seconds and share it by link, WhatsApp, email or a printable QR code.'],
  ['Card, Instant EFT & scan-to-pay', 'A mobile-friendly checkout page your customers can pay from any device.'],
  ['Live notifications', 'Watch payments land in real time, with email alerts and receipts sent automatically.'],
  ['Refunds & reminders', 'Issue full or partial refunds and nudge customers who haven’t paid yet.'],
  ['Insights & exports', 'Track revenue, conversion and average ticket size. Export everything to CSV.'],
  ['Signed webhooks', 'Connect your own systems with HMAC-signed webhooks, retries and a delivery log.'],
];

export default function Landing() {
  const { user, loading } = useAuth();
  if (!loading && user) return <Navigate to="/app" replace />;

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <Logo />
        <div className="flex gap-2">
          <Link to="/login" className="btn-secondary">
            Log in
          </Link>
          <Link to="/register" className="btn-primary">
            Get started
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-4 pb-16 pt-12 text-center sm:pt-20">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
          Get paid with a link. <span className="text-brand-700">Anywhere.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-slate-600">
          PayFlex lets small businesses request payments, share a QR code and get notified the moment money arrives.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link to="/register" className="btn-primary px-6 py-3 text-base">
            Create a free account
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-20 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(([title, body]) => (
          <div key={title} className="card p-6">
            <h3 className="font-semibold">{title}</h3>
            <p className="mt-2 text-sm text-slate-600">{body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

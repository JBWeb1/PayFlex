import { Link, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import { Login, Register } from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Payments from './pages/Payments';
import NewPayment from './pages/NewPayment';
import PaymentDetail from './pages/PaymentDetail';
import Settings from './pages/Settings';
import Admin from './pages/Admin';
import PayPage from './pages/PayPage';

function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-5xl font-bold text-brand-700">404</p>
      <p className="text-slate-600">That page doesn&apos;t exist.</p>
      <Link to="/" className="btn-primary">
        Go home
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/pay/:slug" element={<PayPage />} />
      <Route path="/app" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="payments" element={<Payments />} />
        <Route path="payments/new" element={<NewPayment />} />
        <Route path="payments/:id" element={<PaymentDetail />} />
        <Route path="settings" element={<Settings />} />
        <Route path="admin" element={<Admin />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

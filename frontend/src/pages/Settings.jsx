import { useState } from 'react';
import api, { errorMessage, fieldErrors } from '../lib/api';
import { CopyButton, Field, PageHeader } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const VERIFY_SNIPPET = `const crypto = require('crypto');

// rawBody: the exact request body string, header: req.headers['payflex-signature']
function verify(rawBody, header, secret) {
  const { t, v1 } = Object.fromEntries(header.split(',').map((p) => p.split('=')));
  const expected = crypto.createHmac('sha256', secret).update(\`\${t}.\${rawBody}\`).digest('hex');
  const fresh = Math.abs(Date.now() / 1000 - Number(t)) < 300;
  return fresh && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}`;

export default function Settings() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [profile, setProfile] = useState({
    name: user.name,
    businessName: user.businessName,
    webhookUrl: user.webhookUrl,
    notifyOnPayment: user.notifyOnPayment,
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [secret, setSecret] = useState('');
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });

  const saveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const res = await api.patch('/auth/me', profile);
      setUser(res.data.user);
      toast.success('Settings saved');
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const revealSecret = async () => setSecret((await api.get('/auth/me/webhook-secret')).data.webhookSecret);

  const rotateSecret = async () => {
    if (!window.confirm('Generate a new signing secret? The old one stops working immediately.')) return;
    setSecret((await api.post('/auth/me/webhook-secret')).data.webhookSecret);
    toast.success('New webhook secret generated');
  };

  const changePassword = async (e) => {
    e.preventDefault();
    try {
      await api.post('/auth/me/password', passwords);
      setPasswords({ currentPassword: '', newPassword: '' });
      toast.success('Password updated');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <>
      <PageHeader title="Settings" subtitle={user.email} />
      <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
        <form onSubmit={saveProfile} className="card space-y-4 p-6">
          <h2 className="font-semibold">Business profile</h2>
          <Field label="Your name" error={errors.name}>
            <input className="input" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
          </Field>
          <Field label="Business name" hint="Shown on checkout pages and receipts" error={errors.businessName}>
            <input
              className="input"
              value={profile.businessName}
              onChange={(e) => setProfile({ ...profile, businessName: e.target.value })}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-brand-700"
              checked={profile.notifyOnPayment}
              onChange={(e) => setProfile({ ...profile, notifyOnPayment: e.target.checked })}
            />
            Email me when a payment is received
          </label>

          <h2 className="pt-2 font-semibold">Webhooks</h2>
          <Field
            label="Endpoint URL"
            hint="We POST signed JSON events (payment.paid, payment.refunded, …) to this URL"
            error={errors.webhookUrl}
          >
            <input
              className="input"
              type="url"
              placeholder="https://yourshop.co.za/payflex/webhook"
              value={profile.webhookUrl}
              onChange={(e) => setProfile({ ...profile, webhookUrl: e.target.value })}
            />
          </Field>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </form>

        <div className="space-y-6">
          <section className="card space-y-3 p-6">
            <h2 className="font-semibold">Webhook signing secret</h2>
            <p className="text-sm text-slate-600">
              Each webhook carries a <code className="rounded bg-slate-100 px-1">PayFlex-Signature</code> header. Verify it with
              this secret to be sure the request came from PayFlex.
            </p>
            {secret ? (
              <div className="flex gap-2">
                <input className="input font-mono text-xs" readOnly value={secret} />
                <CopyButton text={secret} />
              </div>
            ) : (
              <button type="button" className="btn-secondary" onClick={revealSecret}>
                Reveal secret
              </button>
            )}
            <button type="button" className="block text-sm font-medium text-red-700" onClick={rotateSecret}>
              Rotate secret
            </button>
            <details className="text-sm">
              <summary className="cursor-pointer font-medium text-brand-700">Verification example (Node.js)</summary>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{VERIFY_SNIPPET}</pre>
            </details>
          </section>

          <form onSubmit={changePassword} className="card space-y-4 p-6">
            <h2 className="font-semibold">Change password</h2>
            <Field label="Current password">
              <input
                className="input"
                type="password"
                autoComplete="current-password"
                required
                value={passwords.currentPassword}
                onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
              />
            </Field>
            <Field label="New password" hint="At least 8 characters">
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={passwords.newPassword}
                onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
              />
            </Field>
            <button type="submit" className="btn-secondary">
              Update password
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

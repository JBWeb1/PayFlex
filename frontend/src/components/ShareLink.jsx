import { formatMoney } from '../lib/format';
import { CopyButton } from './ui';

// QR code plus one-tap sharing for a payment link.
export default function ShareLink({ payment, merchantName }) {
  const amount = formatMoney(payment.amount, payment.currency);
  const message = `${merchantName} requested ${amount}${payment.description ? ` for ${payment.description}` : ''}. Pay securely: ${payment.payUrl}`;
  const canShare = typeof navigator !== 'undefined' && navigator.share;

  const share = () =>
    navigator.share({ title: `Payment request ${payment.reference}`, text: message, url: payment.payUrl }).catch(() => {});

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
      <div className="shrink-0 rounded-xl border border-slate-200 bg-white p-3">
        <img src={payment.qr} alt={`QR code for ${payment.reference}`} className="h-44 w-44" />
      </div>
      <div className="w-full min-w-0 space-y-3">
        <div>
          <p className="label">Payment link</p>
          <div className="flex gap-2">
            <input className="input font-mono text-xs" readOnly value={payment.payUrl} onFocus={(e) => e.target.select()} />
            <CopyButton text={payment.payUrl} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="btn-secondary" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">
            WhatsApp
          </a>
          <a
            className="btn-secondary"
            href={`mailto:${payment.payerEmail || ''}?subject=${encodeURIComponent(
              `Payment request from ${merchantName}`
            )}&body=${encodeURIComponent(message)}`}
          >
            Email
          </a>
          <a className="btn-secondary" href={payment.qr} download={`${payment.reference}-qr.png`}>
            Download QR
          </a>
          <a className="btn-secondary" href={payment.payUrl} target="_blank" rel="noreferrer">
            Open checkout
          </a>
          {canShare && (
            <button type="button" className="btn-secondary" onClick={share}>
              Share…
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

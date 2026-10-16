# PayFlex

Payment links and QR-code checkout for small businesses. A merchant creates a payment request, shares the link or QR code (WhatsApp, email, print), and the customer pays from any device. The merchant is notified instantly, and refunds, reminders, analytics, CSV exports and signed webhooks are built in.

> **Payments are simulated.** `backend/src/services/gateway.js` is a stand-in gateway with test cards. To take real money, swap it for a provider such as PayFast, Yoco, Peach or Stripe, keeping the same `charge` / `refund` contract.

## Features

| Area | What you get |
| --- | --- |
| **Payment requests** | Amount, description, customer details, expiry (1h to 30 days, or never), and an optional redirect URL after payment. Each request gets a reference such as `PF-7KQ9M2XA`. |
| **Sharing** | Server-generated QR code, copy link, WhatsApp, email, native share sheet and QR download. The customer can also be emailed the link automatically. |
| **Checkout** | Mobile-first public page with card (Luhn, expiry and CVC checks), Instant EFT, and QR scan-to-pay. Status updates live, so scanning on a phone updates the desktop page. Printable receipt and auto-redirect back to the merchant. |
| **Live notifications** | Socket.IO pushes events to the merchant dashboard and shows toasts when money lands or an attempt fails. |
| **Lifecycle** | `pending → paid → partially_refunded / refunded`, plus `expired` and `cancelled`. Updates are guarded so a link can only be paid once, even under concurrent requests. A background sweeper expires old links. |
| **Merchant tools** | Full or partial refunds, payment reminders, cancellation, a per-payment event timeline and a webhook delivery log. |
| **Analytics** | Net and gross volume, refunds, average payment, conversion rate, open requests, and a 30-day revenue chart. |
| **Payments list** | Search, status filters, pagination and CSV export (protected against spreadsheet formula injection). |
| **Webhooks** | HMAC-SHA256 signed (`PayFlex-Signature: t=…,v1=…`), retried with exponential backoff, and every attempt is logged. The secret can be revealed and rotated in Settings. |
| **Email** | Payment received (merchant), receipt and refund notices (customer), and requests and reminders. Messages are logged when SMTP isn't configured. |
| **Admin** | Platform stats, top merchants, user search, suspend/reactivate, promote to admin, and all payments. The first account to register becomes admin. |
| **Security** | bcrypt passwords, JWT auth, helmet, rate limits on login and checkout, zod validation on every input, no account enumeration on login, and per-merchant data isolation. |

## Tech stack

- **Backend:** Node 20+, Express 5, Knex (SQL), Socket.IO, zod, Nodemailer, qrcode
- **Database:** SQLite (zero setup, the default) or PostgreSQL (set `DATABASE_URL`)
- **Frontend:** React 18, React Router, Vite, Tailwind CSS, Recharts

## Getting started

```bash
# 1. API
cd backend
cp .env.example .env        # optional, the defaults work for local dev
npm install
npm run dev                 # http://localhost:5000, creates data/payflex.sqlite and runs migrations

# 2. Web app (second terminal)
cd frontend
npm install
npm run dev                 # http://localhost:5173 (proxies /api and websockets to :5000)
```

Open http://localhost:5173 and register. The first account becomes the admin.

**Test cards** (any future expiry, any CVC):

| Card | Result |
| --- | --- |
| `4242 4242 4242 4242` | Approved |
| `4000 0000 0000 0002` | Declined |
| `4000 0000 0000 9995` | Insufficient funds |

### PostgreSQL

```bash
DATABASE_URL=postgres://user:pass@localhost:5432/payflex npm run migrate
DATABASE_URL=postgres://user:pass@localhost:5432/payflex npm start
```

Migrations live in `backend/src/db/migrations` and also run automatically when the server starts.

### Production

```bash
cd frontend && npm ci && npm run build      # outputs frontend/dist
cd ../backend && npm ci && NODE_ENV=production JWT_SECRET=... APP_URL=https://pay.example.com npm start
```

The API serves `frontend/dist` when it exists, so a single process hosts both.

## Tests

```bash
cd backend
npm test                                         # in-memory SQLite
DATABASE_URL=postgres://... npm test             # the same suite against PostgreSQL
```

The suite covers auth, isolation between merchants, the full checkout lifecycle, double-payment races, refunds, expiry, stats, CSV export, admin permissions and signed webhook delivery with retries. CI runs it against both databases.

## API overview

All authenticated routes take `Authorization: Bearer <token>`. Amounts are sent in rands (e.g. `149.99`) and returned in cents (`14999`).

| Method | Route | Description |
| --- | --- | --- |
| POST | `/api/auth/register`, `/api/auth/login` | Returns `{ token, user }` |
| GET / PATCH | `/api/auth/me` | Profile, business name, webhook URL, notification settings |
| POST | `/api/auth/me/password` | Change password |
| GET / POST | `/api/auth/me/webhook-secret` | Reveal / rotate the webhook signing secret |
| POST | `/api/payments` | Create a payment request (returns `payUrl` and `qr`) |
| GET | `/api/payments?status=&q=&page=&limit=` | List and search |
| GET | `/api/payments/stats?days=30` | Dashboard metrics and daily revenue series |
| GET | `/api/payments/export.csv` | CSV export (same filters as the list) |
| GET | `/api/payments/:id` | Detail, including the event timeline |
| GET | `/api/payments/:id/webhooks` | Webhook delivery log |
| POST | `/api/payments/:id/cancel` / `refund` / `remind` | Merchant actions (`refund` takes an optional `amount`) |
| GET | `/api/public/payments/:slug` | Public checkout view |
| POST | `/api/public/payments/:slug/pay` | `{ method: 'card', card }`, `{ method: 'eft', bank }` or `{ method: 'qr' }` |
| GET | `/api/admin/stats`, `/api/admin/users`, `/api/admin/payments` | Admin only |
| PATCH | `/api/admin/users/:id` | `{ status, role }` |

Socket.IO events: authenticated merchants receive `payment:event`, and checkout pages emit `payment:subscribe` with the slug to receive `payment:update`.

### Verifying webhooks

```js
const crypto = require('crypto');

function verify(rawBody, header, secret) {
  const { t, v1 } = Object.fromEntries(header.split(',').map((p) => p.split('=')));
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  const fresh = Math.abs(Date.now() / 1000 - Number(t)) < 300;
  return fresh && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}
```

Events: `payment.paid`, `payment.failed`, `payment.expired`, `payment.cancelled`, `payment.refunded`, `payment.partially_refunded`.

## Project layout

```
backend/
  src/
    app.js, server.js, config.js
    db/            knex setup, migrations, repositories (users, payments, webhook deliveries)
    routes/        auth, payments, public checkout, admin
    services/      payments lifecycle, gateway (simulated), webhooks, mailer, realtime, stats
    middleware/    auth, validation, errors
  tests/
frontend/
  src/
    pages/         Landing, Auth, Dashboard, Payments, NewPayment, PaymentDetail, Settings, Admin, PayPage
    components/    Layout, ShareLink, RevenueChart, ui
    context/       Auth, Toast
```

The loose files at the repository root and in `payflex/` are the original prototype. They are superseded by `backend/` and `frontend/` and can be deleted.

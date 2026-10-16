const crypto = require('crypto');
const db = require('./index');
const { nowIso, iso, num, whereContains, camelToRow } = require('./util');

const newWebhookSecret = () => `whsec_${crypto.randomBytes(24).toString('hex')}`;

const FIELDS = {
  name: 'name',
  email: 'email',
  passwordHash: 'password_hash',
  role: 'role',
  status: 'status',
  businessName: 'business_name',
  webhookUrl: 'webhook_url',
  webhookSecret: 'webhook_secret',
  notifyOnPayment: 'notify_on_payment',
  lastLoginAt: 'last_login_at',
};

function fromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    status: row.status,
    businessName: row.business_name,
    webhookUrl: row.webhook_url,
    webhookSecret: row.webhook_secret,
    notifyOnPayment: Boolean(row.notify_on_payment),
    lastLoginAt: iso(row.last_login_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

// Safe to send to the account owner or an admin.
const toPublic = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  status: user.status,
  businessName: user.businessName,
  webhookUrl: user.webhookUrl,
  notifyOnPayment: user.notifyOnPayment,
  createdAt: user.createdAt,
  lastLoginAt: user.lastLoginAt,
});

const displayName = (user) => user.businessName || user.name;

async function findById(id) {
  return fromRow(await db('users').where({ id }).first());
}

async function findByEmail(email) {
  return fromRow(await db('users').where({ email: email.toLowerCase() }).first());
}

async function count(where = {}) {
  const row = await db('users').where(where).count({ n: '*' }).first();
  return num(row.n);
}

async function create(data) {
  const now = nowIso();
  const [row] = await db('users')
    .insert({
      ...camelToRow(data, FIELDS),
      webhook_secret: newWebhookSecret(),
      created_at: now,
      updated_at: now,
    })
    .returning('*');
  return fromRow(row);
}

async function update(id, patch) {
  const [row] = await db('users')
    .where({ id })
    .update({ ...camelToRow(patch, FIELDS), updated_at: nowIso() })
    .returning('*');
  return fromRow(row);
}

async function list({ q, page, limit }) {
  const base = () => {
    const query = db('users');
    if (q) whereContains(query, ['name', 'email', 'business_name'], q);
    return query;
  };
  const [rows, total] = await Promise.all([
    base().orderBy('created_at', 'desc').orderBy('id', 'desc').offset((page - 1) * limit).limit(limit),
    base().count({ n: '*' }).first(),
  ]);
  return { items: rows.map(fromRow), total: num(total.n) };
}

module.exports = { newWebhookSecret, toPublic, displayName, findById, findByEmail, count, create, update, list };

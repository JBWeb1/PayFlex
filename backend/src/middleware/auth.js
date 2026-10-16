const jwt = require('jsonwebtoken');
const config = require('../config');
const users = require('../db/users');
const { unauthorized, forbidden } = require('../utils/httpError');

const signToken = (user) =>
  jwt.sign({ sub: String(user.id), role: user.role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });

async function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(unauthorized());

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    return next(unauthorized('Your session has expired, please log in again'));
  }
  const user = await users.findById(Number(payload.sub));
  if (!user) return next(unauthorized());
  if (user.status !== 'active') return next(forbidden('Your account is suspended'));
  req.user = user;
  return next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return next(forbidden('Admins only'));
  return next();
}

module.exports = { signToken, requireAuth, requireAdmin };

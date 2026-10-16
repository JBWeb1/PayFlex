const jwt = require('jsonwebtoken');
const config = require('../config');
const users = require('../db/users');
const { merchantView, publicView } = require('../db/payments');

let io = null;

const userRoom = (userId) => `user:${userId}`;
const paymentRoom = (slug) => `payment:${slug}`;

function attach(server) {
  io = server;
  io.on('connection', async (socket) => {
    // Merchants authenticate the socket to receive events for their own payments.
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (token) {
      try {
        const { sub } = jwt.verify(token, config.jwtSecret);
        const user = await users.findById(Number(sub));
        if (user && user.status === 'active') {
          socket.join(userRoom(user.id));
          if (user.role === 'admin') socket.join('admins');
        }
      } catch {
        // Invalid token: the socket can still follow public payment pages.
      }
    }

    // Payers follow a single payment by its public slug.
    socket.on('payment:subscribe', (slug) => {
      if (typeof slug === 'string' && /^[a-z0-9]{6,32}$/.test(slug)) socket.join(paymentRoom(slug));
    });
    socket.on('payment:unsubscribe', (slug) => {
      if (typeof slug === 'string') socket.leave(paymentRoom(slug));
    });
  });
}

function emitPaymentEvent(event, payment, merchant) {
  if (!io) return;
  const merchantPayload = { event, payment: merchantView(payment) };
  io.to(userRoom(payment.merchantId)).emit('payment:event', merchantPayload);
  io.to('admins').emit('admin:payment', merchantPayload);
  io.to(paymentRoom(payment.slug)).emit('payment:update', { event, payment: publicView(payment, merchant) });
}

module.exports = { attach, emitPaymentEvent };

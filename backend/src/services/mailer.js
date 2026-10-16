const nodemailer = require('nodemailer');
const config = require('../config');

let transporter;

function getTransporter() {
  if (transporter) return transporter;
  if (config.mail.host) {
    transporter = nodemailer.createTransport({
      host: config.mail.host,
      port: config.mail.port,
      secure: config.mail.secure,
      auth: config.mail.user ? { user: config.mail.user, pass: config.mail.pass } : undefined,
    });
  } else {
    // No SMTP configured: render the message but don't send it anywhere.
    transporter = nodemailer.createTransport({ jsonTransport: true });
  }
  return transporter;
}

const outbox = []; // last few messages, handy in development and tests

async function sendMail({ to, subject, text, html }) {
  if (!to) return null;
  const info = await getTransporter().sendMail({ from: config.mail.from, to, subject, text, html });
  outbox.push({ to, subject, text, at: new Date() });
  if (outbox.length > 50) outbox.shift();
  if (!config.mail.host && !config.isTest) {
    console.log(`[mail] (not sent, SMTP not configured) to=${to} subject="${subject}"`);
  }
  return info;
}

// Email failures should never break a payment flow.
function sendMailSafe(message) {
  return sendMail(message).catch((err) => {
    console.error(`[mail] failed to send "${message.subject}" to ${message.to}: ${err.message}`);
  });
}

module.exports = { sendMail, sendMailSafe, outbox };

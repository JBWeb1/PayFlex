const sendEmail = require('../utils/sendEmail');
const User = require('../models/User');

router.post('/pay/:id', async (req, res) => {
  const payment = await Payment.findById(req.params.id);
  payment.status = 'paid';
  await payment.save();

  const io = req.app.get('io');
  io.emit('paymentUpdate', { id: payment._id, status: 'paid' });

  const user = await User.findById(payment.userId);
  await sendEmail(user.email, 'Payment Received', `Payment of R${payment.amount} was received.`);

  res.json({ message: 'Payment processed' });
});

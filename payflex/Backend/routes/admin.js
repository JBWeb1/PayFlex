const express = require('express');
const router = express.Router();
const Payment = require('../models/Payment');
const User = require('../models/User');

router.get('/payments', async (req, res) => {
  const payments = await Payment.find().populate('userId', 'email');
  res.json(payments);
});

router.get('/users', async (req, res) => {
  const users = await User.find();
  res.json(users);
});

module.exports = router;

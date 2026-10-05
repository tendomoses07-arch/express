const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { initiatePayment, verifyPayment, PAYMENT_METHODS } = require('../paymentGateway');

// 1. Initiate Mobile Money Cashless Payment
router.post('/initiate', (req, res) => {
  try {
    const { delivery_id, payment_method, customer_phone } = req.body;

    if (!delivery_id) {
      return res.status(400).json({ error: 'delivery_id is required' });
    }
    if (!customer_phone) {
      return res.status(400).json({ error: 'Customer phone number is required' });
    }

    const result = initiatePayment({
      delivery_id: Number(delivery_id),
      payment_method,
      customer_phone
    });

    res.json(result);
  } catch (err) {
    console.error('Initiate payment error:', err);
    res.status(400).json({ error: err.message });
  }
});

// 2. Server-side Verify Payment (Called by polling, webhook, or STK callback)
router.post('/verify', (req, res) => {
  try {
    const { reference_id, simulate_failure } = req.body;

    if (!reference_id) {
      return res.status(400).json({ error: 'reference_id is required' });
    }

    const verificationResult = verifyPayment({
      reference_id,
      simulateFailure: !!simulate_failure
    });

    res.json(verificationResult);
  } catch (err) {
    console.error('Verify payment error:', err);
    res.status(400).json({ error: err.message });
  }
});

// 3. Get payment details by reference or delivery ID
router.get('/reference/:reference_id', (req, res) => {
  try {
    const { reference_id } = req.params;
    const payment = db.prepare('SELECT * FROM payments WHERE reference_id = ?').get(reference_id);
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    res.json(payment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

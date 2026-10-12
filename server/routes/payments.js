const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { initiatePayment, verifyPayment, processProviderCallback, PAYMENT_METHODS } = require('../paymentGateway');

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

// 2. Server-side Verify Payment (Status check and dev simulation)
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

// 2b. Authenticated Carrier Callback / Webhook Endpoint
function handlePaymentCallback(req, res) {
  try {
    const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET || process.env.MOMO_WEBHOOK_SECRET;
    const authHeader = req.headers['authorization'];
    const signature = req.headers['x-callback-signature'] || req.headers['x-webhook-token'] || (authHeader ? authHeader.replace(/^Bearer\s+/i, '') : null);

    // Verify webhook signature / token
    if (!webhookSecret || !signature || signature !== webhookSecret) {
      return res.status(401).json({ error: 'Unauthorized payment provider webhook' });
    }

    const { reference_id, external_id, externalId, amount, currency, status, provider_txn_id } = req.body;
    const ref = reference_id || external_id || externalId;

    if (!ref) {
      return res.status(400).json({ error: 'Transaction reference is required' });
    }

    const result = processProviderCallback({
      reference_id: ref,
      amount,
      currency: currency || 'UGX',
      status: status || 'SUCCESSFUL',
      provider_txn_id,
      raw_payload: req.body
    });

    res.json(result);
  } catch (err) {
    console.error('Payment webhook processing error:', err.message);
    res.status(400).json({ error: err.message });
  }
}

router.post('/callback', handlePaymentCallback);
router.post('/webhook', handlePaymentCallback);

// 3. Get payment details by reference ID
router.get('/reference/:reference_id', (req, res) => {
  try {
    const { reference_id } = req.params;
    const payment = db.prepare('SELECT id, delivery_id, tracking_number, amount, currency, payment_method, reference_id, payment_status, created_at, confirmed_at FROM payments WHERE reference_id = ?').get(reference_id);
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    res.json(payment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

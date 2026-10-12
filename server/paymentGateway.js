const { db } = require('./db');
const realtimeService = require('./services/realtimeService');
const crypto = require('crypto');

// Supported Uganda Mobile Money operators
const PAYMENT_METHODS = {
  MTN: 'MTN Mobile Money',
  AIRTEL: 'Airtel Money'
};

// Validates Ugandan phone numbers (e.g., 0772123456, +256772123456, 0701234567)
function sanitizeAndValidateUgandaPhone(phone) {
  if (!phone) return { valid: false, message: 'Phone number is required' };
  
  let cleaned = String(phone).replace(/\s+/g, '').replace(/[-().]/g, '');
  if (cleaned.startsWith('+256')) {
    cleaned = '0' + cleaned.slice(4);
  } else if (cleaned.startsWith('256')) {
    cleaned = '0' + cleaned.slice(3);
  } else if (cleaned.length === 9 && cleaned.startsWith('7')) {
    cleaned = '0' + cleaned;
  }

  // Must be 10 digits starting with 07
  const ugandaRegex = /^07[0-9]{8}$/;
  if (!ugandaRegex.test(cleaned)) {
    return { valid: false, message: 'Must be a valid 10-digit Uganda phone number (e.g., 0772123456)' };
  }

  // Detect network prefix
  // MTN: 077, 078, 076
  // Airtel: 070, 075, 074
  const prefix = cleaned.substring(0, 3);
  let detectedMethod = PAYMENT_METHODS.MTN;
  if (['070', '075', '074'].includes(prefix)) {
    detectedMethod = PAYMENT_METHODS.AIRTEL;
  } else if (['077', '078', '076'].includes(prefix)) {
    detectedMethod = PAYMENT_METHODS.MTN;
  }

  return { valid: true, formattedPhone: cleaned, detectedMethod };
}

// Generate unique transaction reference
function generateReferenceId(method) {
  const prefix = method === PAYMENT_METHODS.MTN ? 'MM' : 'AM';
  const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const rand = Math.floor(10000 + Math.random() * 90000);
  return `${prefix}-${dateStr}-${rand}`;
}

// Initiate Cashless Payment
function initiatePayment({ delivery_id, payment_method, customer_phone }) {
  // 1. Verify delivery exists on backend
  const delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(delivery_id);
  if (!delivery) {
    throw new Error('Delivery request not found');
  }

  if (delivery.status !== 'Awaiting Payment' && delivery.status !== 'Request Created') {
    throw new Error(`Cannot initiate payment for delivery in status: ${delivery.status}`);
  }

  // 2. Validate phone number
  const phoneCheck = sanitizeAndValidateUgandaPhone(customer_phone);
  if (!phoneCheck.valid) {
    throw new Error(phoneCheck.message);
  }

  const method = payment_method || phoneCheck.detectedMethod;
  const reference_id = generateReferenceId(method);

  // 3. Insert or update payment record
  // Check if a pending payment already exists
  let payment = db.prepare('SELECT * FROM payments WHERE delivery_id = ? AND payment_status = ?').get(delivery_id, 'Pending');

  if (payment) {
    // Update existing pending payment
    db.prepare(`
      UPDATE payments 
      SET payment_method = ?, customer_phone = ?, reference_id = ?, amount = ?
      WHERE id = ?
    `).run(method, phoneCheck.formattedPhone, reference_id, delivery.delivery_fee, payment.id);
  } else {
    // Insert new payment record
    const result = db.prepare(`
      INSERT INTO payments (
        delivery_id, tracking_number, amount, currency, payment_method,
        customer_phone, reference_id, payment_status, provider_response
      ) VALUES (?, ?, ?, 'UGX', ?, ?, ?, 'Pending', ?)
    `).run(
      delivery.id,
      delivery.tracking_number,
      delivery.delivery_fee,
      method,
      phoneCheck.formattedPhone,
      reference_id,
      JSON.stringify({ status: 'PENDING_PROMPT', message: 'USSD push prompt sent to customer device' })
    );
  }

  return {
    success: true,
    reference_id,
    delivery_id: delivery.id,
    tracking_number: delivery.tracking_number,
    amount: delivery.delivery_fee,
    currency: 'UGX',
    payment_method: method,
    phone: phoneCheck.formattedPhone,
    ussd_prompt_message: `A payment request of UGX ${delivery.delivery_fee.toLocaleString()} has been pushed to ${phoneCheck.formattedPhone}. Please enter your ${method === PAYMENT_METHODS.MTN ? 'MTN MoMo' : 'Airtel Money'} PIN on your handset.`
  };
}

// Server-side payment verification
function verifyPayment({ reference_id, simulateFailure = false, isVerifiedGateway = false }) {
  const payment = db.prepare('SELECT * FROM payments WHERE reference_id = ?').get(reference_id);
  if (!payment) {
    throw new Error('Payment reference not found');
  }

  if (payment.payment_status === 'Successful') {
    return {
      status: 'Successful',
      reference_id: payment.reference_id,
      delivery_id: payment.delivery_id,
      tracking_number: payment.tracking_number,
      amount: payment.amount,
      already_confirmed: true
    };
  }

  // In production, unauthenticated client verification requests CANNOT confirm payments
  const isProduction = process.env.NODE_ENV === 'production';
  const allowMock = process.env.ENABLE_MOCK_PAYMENT === 'true' || process.env.ALLOW_DEMO_SEED === 'true' || process.env.DEMO_MODE === 'true';

  if (isProduction && !isVerifiedGateway && !allowMock) {
    return {
      status: payment.payment_status,
      reference_id: payment.reference_id,
      delivery_id: payment.delivery_id,
      tracking_number: payment.tracking_number,
      amount: payment.amount,
      already_confirmed: false,
      message: 'Payment verification pending carrier callback. Funds cannot be confirmed by client request alone.'
    };
  }

  if (simulateFailure) {
    db.prepare(`
      UPDATE payments 
      SET payment_status = 'Failed', provider_response = ?
      WHERE id = ?
    `).run(JSON.stringify({ status: 'FAILED', reason: 'Insufficient funds or cancelled by user' }), payment.id);

    return {
      status: 'Failed',
      reference_id: payment.reference_id,
      reason: 'Transaction cancelled or failed on mobile money handset'
    };
  }

  // Transaction verified successfully (simulation in development / test environments)
  const providerTxnId = (payment.payment_method.includes('MTN') ? 'MTN-' : 'AIR-') + Math.floor(100000 + Math.random() * 900000);

  const providerResponse = JSON.stringify({
    status: 'SUCCESSFUL',
    providerTxnId,
    verified_at: new Date().toISOString(),
    network: payment.payment_method,
    verification_mode: isVerifiedGateway ? 'VERIFIED_GATEWAY' : 'DEVELOPMENT_SIMULATION'
  });

  const updateTxn = db.transaction(() => {
    // 1. Update payment record
    db.prepare(`
      UPDATE payments
      SET payment_status = 'Successful',
          provider_response = ?,
          confirmed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(providerResponse, payment.id);

    // 2. Transition delivery status to 'Payment Confirmed'
    db.prepare(`
      UPDATE deliveries
      SET status = 'Payment Confirmed'
      WHERE id = ?
    `).run(payment.delivery_id);

    // 3. Log to history
    db.prepare(`
      INSERT INTO delivery_status_history (delivery_id, status, note, updated_by)
      VALUES (?, 'Payment Confirmed', ?, 'Payment Gateway')
    `).run(
      payment.delivery_id,
      `${payment.payment_method} verified: UGX ${payment.amount.toLocaleString()} received (Ref: ${payment.reference_id}, Txn: ${providerTxnId})`
    );
  });

  updateTxn();

  // Broadcast payment confirmed in real-time
  realtimeService.broadcastDeliveryUpdate(payment.delivery_id, { status: 'Payment Confirmed' });

  return {
    status: 'Successful',
    reference_id: payment.reference_id,
    provider_txn_id: providerTxnId,
    delivery_id: payment.delivery_id,
    tracking_number: payment.tracking_number,
    amount: payment.amount,
    currency: payment.currency,
    confirmed_at: new Date().toISOString()
  };
}

// Authenticated carrier callback processor
function processProviderCallback({
  reference_id,
  amount,
  currency,
  status,
  provider_txn_id,
  raw_payload
}) {
  const payment = db.prepare('SELECT * FROM payments WHERE reference_id = ?').get(reference_id);
  if (!payment) {
    throw new Error('Payment reference not found');
  }

  // Idempotency: Prevent duplicate callbacks and repeated processing
  if (payment.payment_status === 'Successful') {
    return {
      status: 'Successful',
      reference_id: payment.reference_id,
      delivery_id: payment.delivery_id,
      tracking_number: payment.tracking_number,
      amount: payment.amount,
      already_confirmed: true,
      duplicate_callback: true
    };
  }

  // Financial validation: verify amount and currency
  const expectedAmount = Number(payment.amount);
  const receivedAmount = Number(amount);
  if (receivedAmount !== expectedAmount) {
    db.prepare(`
      UPDATE payments
      SET payment_status = 'Failed', provider_response = ?
      WHERE id = ?
    `).run(JSON.stringify({ status: 'AMOUNT_MISMATCH', expected: expectedAmount, received: receivedAmount, raw: raw_payload }), payment.id);

    throw new Error(`Amount mismatch: expected ${expectedAmount} UGX, received ${receivedAmount}`);
  }

  const expectedCurrency = (payment.currency || 'UGX').toUpperCase();
  const receivedCurrency = (currency || 'UGX').toUpperCase();
  if (receivedCurrency !== expectedCurrency) {
    throw new Error(`Currency mismatch: expected ${expectedCurrency}, received ${receivedCurrency}`);
  }

  // Provider transaction status check
  const isSuccess = ['SUCCESSFUL', 'SUCCESS', 'COMPLETED', 'CONFIRMED'].includes(String(status).toUpperCase());

  if (!isSuccess) {
    db.prepare(`
      UPDATE payments
      SET payment_status = 'Failed', provider_response = ?
      WHERE id = ?
    `).run(JSON.stringify({ status: 'FAILED', raw: raw_payload }), payment.id);

    return {
      status: 'Failed',
      reference_id: payment.reference_id,
      reason: 'Provider reported transaction failure'
    };
  }

  const finalProviderTxn = provider_txn_id || (payment.payment_method.includes('MTN') ? 'MTN-' : 'AIR-') + Math.floor(100000 + Math.random() * 900000);

  const providerResponse = JSON.stringify({
    status: 'SUCCESSFUL',
    providerTxnId: finalProviderTxn,
    verified_at: new Date().toISOString(),
    network: payment.payment_method,
    verified_via: 'CARRIER_WEBHOOK_CALLBACK'
  });

  const updateTxn = db.transaction(() => {
    db.prepare(`
      UPDATE payments
      SET payment_status = 'Successful',
          provider_response = ?,
          confirmed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(providerResponse, payment.id);

    db.prepare(`
      UPDATE deliveries
      SET status = 'Payment Confirmed'
      WHERE id = ?
    `).run(payment.delivery_id);

    db.prepare(`
      INSERT INTO delivery_status_history (delivery_id, status, note, updated_by)
      VALUES (?, 'Payment Confirmed', ?, 'Carrier Webhook')
    `).run(
      payment.delivery_id,
      `${payment.payment_method} verified: UGX ${payment.amount.toLocaleString()} received via authenticated carrier callback (Ref: ${payment.reference_id}, Txn: ${finalProviderTxn})`
    );
  });

  updateTxn();

  realtimeService.broadcastDeliveryUpdate(payment.delivery_id, { status: 'Payment Confirmed' });

  return {
    status: 'Successful',
    reference_id: payment.reference_id,
    provider_txn_id: finalProviderTxn,
    delivery_id: payment.delivery_id,
    tracking_number: payment.tracking_number,
    amount: payment.amount,
    currency: payment.currency,
    confirmed_at: new Date().toISOString()
  };
}

module.exports = {
  PAYMENT_METHODS,
  sanitizeAndValidateUgandaPhone,
  generateReferenceId,
  initiatePayment,
  verifyPayment,
  processProviderCallback
};

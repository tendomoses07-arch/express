const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { calculateDeliveryQuote, calculateLiveDeliveryQuote } = require('../pricing');
const { searchAddressSuggestions, geocodeAddress } = require('../services/mapService');
const { sanitizeAndValidateUgandaPhone } = require('../paymentGateway');
const realtimeService = require('../services/realtimeService');
const jwt = require('jsonwebtoken');
const { authenticateToken, JWT_SECRET } = require('./auth');

// Helper to optionally parse user token if present
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token) {
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (!err) req.user = user;
      next();
    });
  } else {
    next();
  }
}

// Generate unique tracking number e.g. KOLA-20261005-123456
function generateTrackingNumber() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `KOLA-${year}${month}${day}-${rand}`;
}

// Generate secure 4-digit recipient verification delivery PIN
function generateDeliveryPin() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// 0. Live Address Autocomplete Suggestions (Public endpoint for real-time address typing)
router.get('/suggestions', async (req, res) => {
  try {
    const q = req.query.q;
    if (!q || typeof q !== 'string' || q.trim().length < 2) {
      return res.json({ suggestions: [] });
    }
    const suggestions = await searchAddressSuggestions(q.trim());
    res.json({ suggestions });
  } catch (err) {
    res.json({ suggestions: [] });
  }
});

// 0b. Live Map Provider & Config Endpoint
router.get('/map-config', (req, res) => {
  res.json({
    provider: 'osrm',
    service: 'OpenStreetMap & OSRM Driving Engine',
    region: 'Uganda',
    token_required: false,
    status: 'active'
  });
});

// 0c. Live Delivery Realtime SSE Stream (Authenticated & Security-Isolated)
router.get('/stream', (req, res) => {
  realtimeService.handleSseConnection(req, res);
});

// 0d. Active Delivery for Authenticated User Dashboard
router.get('/active', authenticateToken, (req, res) => {
  try {
    const active = realtimeService.getActiveDeliveryForUser(req.user);
    if (!active) {
      return res.json({ active: false, delivery: null });
    }
    res.json({ active: true, ...active });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 1. Calculate Delivery Quote (Public endpoint for live geocoding, road distance, ETA & rate preview)
router.post('/quote', async (req, res) => {
  try {
    const {
      pickup_location,
      delivery_location,
      item_category,
      is_urgent,
      pickup_coords,
      delivery_coords
    } = req.body;

    if (!pickup_location || !delivery_location) {
      return res.status(400).json({ error: 'Pickup and delivery locations are required' });
    }

    const quote = await calculateLiveDeliveryQuote({
      pickup: pickup_location.trim(),
      destination: delivery_location.trim(),
      category: item_category || 'small_parcel',
      is_urgent: !!is_urgent,
      pickup_coords: pickup_coords || null,
      delivery_coords: delivery_coords || null
    });

    // Check for ambiguity
    if (quote.ambiguous) {
      return res.json({
        ambiguous: true,
        ambiguous_field: quote.ambiguous_field,
        field_label: quote.field_label,
        query: quote.query,
        message: quote.message,
        candidates: quote.candidates,
        provider: 'openstreetmap'
      });
    }

    if (quote.error) {
      return res.status(422).json({
        error: quote.message,
        field: quote.field,
        routing_error: !!quote.routing_error,
        not_found: !!quote.not_found,
        provider: 'osrm'
      });
    }

    res.json(quote);
  } catch (err) {
    console.error('[Route Quote Error]:', err.message);
    res.status(400).json({ error: 'Route calculation failed: ' + err.message, provider: 'osrm' });
  }
});

// 2. Create Delivery Request (Requires registered / authenticated user)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      sender_name,
      sender_phone,
      pickup_location,
      pickup_directions,
      pickup_notes,
      pickup_coords,
      recipient_name,
      recipient_phone,
      delivery_location,
      delivery_directions,
      delivery_notes,
      delivery_coords,
      item_description,
      item_category = 'small_parcel',
      special_instructions,
      is_urgent = false
    } = req.body;

    // Strict Validations
    if (!sender_name || !sender_name.trim()) {
      return res.status(400).json({ error: 'Sender full name is required' });
    }
    const senderPhoneCheck = sanitizeAndValidateUgandaPhone(sender_phone);
    if (!senderPhoneCheck.valid) {
      return res.status(400).json({ error: 'Sender: ' + senderPhoneCheck.message });
    }
    if (!pickup_location || !pickup_location.trim()) {
      return res.status(400).json({ error: 'Pickup location is required' });
    }

    if (!recipient_name || !recipient_name.trim()) {
      return res.status(400).json({ error: 'Recipient full name is required' });
    }
    const recipientPhoneCheck = sanitizeAndValidateUgandaPhone(recipient_phone);
    if (!recipientPhoneCheck.valid) {
      return res.status(400).json({ error: 'Recipient: ' + recipientPhoneCheck.message });
    }
    if (!delivery_location || !delivery_location.trim()) {
      return res.status(400).json({ error: 'Delivery destination location is required' });
    }

    if (!item_description || !item_description.trim()) {
      return res.status(400).json({ error: 'Item description is required' });
    }

    // Server-side calculated live quote (enforces correct road distance, ETA & fee calculation)
    const quote = await calculateLiveDeliveryQuote({
      pickup: pickup_location.trim(),
      destination: delivery_location.trim(),
      category: item_category,
      is_urgent: !!is_urgent,
      pickup_coords: pickup_coords || null,
      delivery_coords: delivery_coords || null
    });

    if (quote.ambiguous) {
      return res.status(400).json({
        error: `Address is ambiguous. Please clarify your ${quote.field_label || 'location'}.`,
        ambiguous: true,
        ambiguous_field: quote.ambiguous_field,
        candidates: quote.candidates
      });
    }

    if (quote.error) {
      return res.status(400).json({
        error: quote.message || 'Unable to resolve or route the provided address.',
        routing_error: !!quote.routing_error,
        field: quote.field,
        provider: 'osrm'
      });
    }

    const tracking_number = generateTrackingNumber();
    const delivery_pin = generateDeliveryPin();
    
    // Resolve & persist customer profile so order history is NEVER lost
    let customer_id = req.user ? req.user.id : null;
    const cleanSenderPhone = senderPhoneCheck.formattedPhone;

    if (!customer_id) {
      const existingUser = db.prepare('SELECT id FROM users WHERE phone = ?').get(cleanSenderPhone);
      if (existingUser) {
        customer_id = existingUser.id;
      } else {
        const bcrypt = require('bcryptjs');
        const defaultCustPass = bcrypt.hashSync('customer123', 10);
        const ins = db.prepare(`
          INSERT INTO users (full_name, phone, password_hash, role)
          VALUES (?, ?, ?, 'customer')
        `).run(sender_name.trim(), cleanSenderPhone, defaultCustPass);
        customer_id = ins.lastInsertRowid;
      }
    }

    const pLat = quote.origin?.lat || null;
    const pLng = quote.origin?.lng || null;
    const dLat = quote.destination?.lat || null;
    const dLng = quote.destination?.lng || null;
    const etaMins = quote.duration_minutes || null;

    const baseFee = quote.base_fee || 4000;
    const distanceFee = quote.distance_fee || 0;
    const surcharges = quote.urgent_fee || (is_urgent ? 3000 : 0);
    const discounts = 0;
    const finalFee = quote.total_fee || (baseFee + distanceFee + surcharges);
    const routingProvider = quote.map_provider || 'osrm';
    const routeRef = quote.route_type || 'OSRM Live Driving Route';

    let deliveryId;
    const createTxn = db.transaction(() => {
      const stmt = db.prepare(`
        INSERT INTO deliveries (
          tracking_number, customer_id, sender_name, sender_phone,
          pickup_location, pickup_directions, pickup_notes,
          recipient_name, recipient_phone, delivery_location,
          delivery_directions, delivery_notes, item_description,
          item_category, special_instructions, is_urgent,
          distance_km, delivery_fee, status, delivery_pin,
          pickup_lat, pickup_lng, delivery_lat, delivery_lng, eta_minutes,
          pickup_address, pickup_latitude, pickup_longitude,
          dropoff_address, dropoff_latitude, dropoff_longitude,
          road_distance, estimated_travel_time,
          base_delivery_fee, distance_fee, surcharges, discounts,
          final_delivery_fee, pricing_version, routing_provider,
          route_reference, pricing_calculation_timestamp
        ) VALUES (
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, 'Awaiting Payment', ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?,
          ?, ?, ?, ?,
          ?, 'v1.0', ?,
          ?, CURRENT_TIMESTAMP
        )
      `);

      const result = stmt.run(
        tracking_number,
        customer_id,
        sender_name.trim(),
        senderPhoneCheck.formattedPhone,
        pickup_location.trim(),
        pickup_directions ? pickup_directions.trim() : null,
        pickup_notes ? pickup_notes.trim() : null,
        recipient_name.trim(),
        recipientPhoneCheck.formattedPhone,
        delivery_location.trim(),
        delivery_directions ? delivery_directions.trim() : null,
        delivery_notes ? delivery_notes.trim() : null,
        item_description.trim(),
        item_category,
        special_instructions ? special_instructions.trim() : null,
        is_urgent ? 1 : 0,
        quote.distance_km,
        finalFee,
        delivery_pin,
        pLat,
        pLng,
        dLat,
        dLng,
        etaMins,
        pickup_location.trim(),
        pLat,
        pLng,
        delivery_location.trim(),
        dLat,
        dLng,
        quote.distance_km,
        etaMins,
        baseFee,
        distanceFee,
        surcharges,
        discounts,
        finalFee,
        routingProvider,
        routeRef
      );

      deliveryId = result.lastInsertRowid;

      // Log initial history record
      db.prepare(`
        INSERT INTO delivery_status_history (delivery_id, status, note, updated_by)
        VALUES (?, 'Request Created', ?, 'Customer')
      `).run(deliveryId, `Delivery request created via live road route (${quote.distance_km} km, ETA: ${quote.eta_text || 'approx. 30 mins'})`);

      db.prepare(`
        INSERT INTO delivery_status_history (delivery_id, status, note, updated_by)
        VALUES (?, 'Delivery PIN Generated', ?, 'System')
      `).run(deliveryId, `Special recipient delivery confirmation PIN generated: ${delivery_pin}. Provide this PIN to recipient to read to courier on arrival.`);

      db.prepare(`
        INSERT INTO delivery_status_history (delivery_id, status, note, updated_by)
        VALUES (?, 'Awaiting Payment', ?, 'System')
      `).run(deliveryId, `Awaiting cashless Mobile Money payment of UGX ${quote.total_fee.toLocaleString()}`);
    });

    createTxn();

    // Broadcast new delivery request event in real-time
    realtimeService.broadcastDeliveryUpdate(deliveryId, { status: 'Awaiting Payment' });

    const delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(deliveryId);

    res.status(201).json({
      message: 'Delivery request created successfully',
      delivery,
      quote
    });
  } catch (err) {
    console.error('Create delivery error:', err);
    res.status(500).json({ error: 'Failed to create delivery: ' + err.message });
  }
});

// Helper to generate unique handover confirmation ID e.g. KOLA-HO-20261005-123456
function generateHandoverId() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `KOLA-HO-${year}${month}${day}-${rand}`;
}

// 3. Sender Confirms Physical Package Handover (Strict Backend Authorization)
router.post('/:id/confirm-handover', authenticateToken, (req, res) => {
  try {
    const deliveryId = Number(req.params.id);
    if (!deliveryId) {
      return res.status(400).json({ error: 'Valid delivery ID is required' });
    }

    const delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(deliveryId);
    if (!delivery) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    const user = req.user;

    // RULE 1: Verify the delivery belongs to the sender
    const isSender = (
      user && (
        user.role === 'admin' ||
        delivery.customer_id === user.id ||
        (user.phone && delivery.sender_phone === user.phone) ||
        (user.full_name && delivery.sender_name.toLowerCase().trim() === user.full_name.toLowerCase().trim())
      )
    );

    if (!isSender) {
      return res.status(403).json({
        error: 'Security Authorization Failed: Only the verified sender of this delivery can confirm physical package handover.'
      });
    }

    // RULE 2: Verify courier is assigned
    if (!delivery.courier_id) {
      return res.status(400).json({
        error: 'No courier has been assigned to this delivery yet.'
      });
    }

    // RULE 3: Verify courier has marked arrival (status is Awaiting Sender Confirmation)
    if (delivery.status !== 'Awaiting Sender Confirmation') {
      if (['Package Picked Up', 'Item Picked Up', 'In Transit', 'Near Destination', 'Delivered'].includes(delivery.status)) {
        return res.status(400).json({
          error: 'Package handover has already been confirmed for this delivery.'
        });
      }
      return res.status(400).json({
        error: `Cannot confirm handover: Courier has not yet marked arrival at the pickup point. Current status: ${delivery.status}`
      });
    }

    // RULE 4: Verify request has not already been confirmed or cancelled
    if (delivery.handover_confirmed_at || delivery.handover_confirmation_id) {
      return res.status(400).json({
        error: 'Package handover has already been confirmed. Handover ID: ' + delivery.handover_confirmation_id
      });
    }

    if (delivery.status === 'Cancelled') {
      return res.status(400).json({
        error: 'Cannot confirm handover for a cancelled delivery.'
      });
    }

    const courier = db.prepare('SELECT * FROM couriers WHERE id = ?').get(delivery.courier_id);
    const courierName = courier ? courier.full_name : 'Courier';
    const courierPhone = courier ? courier.phone : '';

    const handoverId = generateHandoverId();
    const senderName = user.full_name || delivery.sender_name;
    const senderPhone = user.phone || delivery.sender_phone;

    const confirmTxn = db.transaction(() => {
      // 1. Update delivery table
      db.prepare(`
        UPDATE deliveries
        SET status = 'Package Picked Up',
            picked_up_at = CURRENT_TIMESTAMP,
            handover_confirmed_at = CURRENT_TIMESTAMP,
            handover_confirmation_id = ?,
            handover_sender_id = ?,
            handover_status = 'confirmed',
            handover_notes = ?
        WHERE id = ?
      `).run(
        handoverId,
        user.id || null,
        `Handover confirmed physically by sender ${senderName}`,
        deliveryId
      );

      // 2. Insert into permanent handover_confirmations audit table
      db.prepare(`
        INSERT INTO handover_confirmations (
          handover_id, delivery_id, tracking_number,
          sender_id, sender_name, sender_phone,
          courier_id, courier_name, courier_phone,
          courier_arrived_at, confirmed_at,
          previous_status, new_status, confirmation_type, status, notes
        ) VALUES (
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, CURRENT_TIMESTAMP,
          'Awaiting Sender Confirmation', 'Package Picked Up', 'sender_digital_handover', 'confirmed', ?
        )
      `).run(
        handoverId, deliveryId, delivery.tracking_number,
        user.id || null, senderName, senderPhone,
        delivery.courier_id, courierName, courierPhone,
        delivery.courier_arrived_at, `Sender confirmed physical package handover at ${delivery.pickup_location}`
      );

      // 3. Insert into delivery_status_history
      db.prepare(`
        INSERT INTO delivery_status_history (delivery_id, status, note, updated_by)
        VALUES (?, 'Sender Confirmed Package Handover', ?, ?)
      `).run(
        deliveryId,
        `Sender ${senderName} physically confirmed package handover to courier ${courierName} (Handover ID: ${handoverId})`,
        `Sender (${senderName})`
      );

      db.prepare(`
        INSERT INTO delivery_status_history (delivery_id, status, note, updated_by)
        VALUES (?, 'Package Picked Up', ?, ?)
      `).run(
        deliveryId,
        `Package securely collected by courier ${courierName}. Ready for transit dispatch.`,
        'Kola System'
      );
    });

    confirmTxn();

    // Broadcast package handover confirmed event in real-time
    realtimeService.broadcastDeliveryUpdate(deliveryId, { status: 'Package Picked Up' });

    const updated = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(deliveryId);
    const handoverRecord = db.prepare('SELECT * FROM handover_confirmations WHERE handover_id = ?').get(handoverId);

    res.json({
      success: true,
      message: 'Package Handover Confirmed — Your package has been handed over to the courier and is now being processed for delivery.',
      handover_confirmation_id: handoverId,
      confirmed_at: updated.handover_confirmed_at,
      delivery: updated,
      handover: handoverRecord
    });
  } catch (err) {
    console.error('Confirm handover error:', err);
    res.status(500).json({ error: 'Failed to confirm package handover: ' + err.message });
  }
});

// 4. Sender Indicates Package Has NOT Been Handed Over
router.post('/:id/dispute-handover', authenticateToken, (req, res) => {
  try {
    const deliveryId = Number(req.params.id);
    const delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(deliveryId);
    if (!delivery) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    const user = req.user;
    const isSender = (
      user && (
        user.role === 'admin' ||
        delivery.customer_id === user.id ||
        (user.phone && delivery.sender_phone === user.phone) ||
        (user.full_name && delivery.sender_name.toLowerCase().trim() === user.full_name.toLowerCase().trim())
      )
    );

    if (!isSender) {
      return res.status(403).json({ error: 'Only the sender associated with this delivery can report handover issues.' });
    }

    if (delivery.status !== 'Awaiting Sender Confirmation') {
      return res.status(400).json({ error: 'Delivery is not currently awaiting sender confirmation.' });
    }

    const disputeTxn = db.transaction(() => {
      db.prepare(`
        UPDATE deliveries
        SET handover_status = 'disputed',
            handover_notes = ?
        WHERE id = ?
      `).run(
        'Sender indicated package has NOT yet been handed over to courier',
        deliveryId
      );

      db.prepare(`
        INSERT INTO delivery_status_history (delivery_id, status, note, updated_by)
        VALUES (?, 'Awaiting Sender Confirmation', ?, ?)
      `).run(
        deliveryId,
        'Sender reported: I HAVE NOT HANDED OVER THE PACKAGE. Delivery remains waiting at pickup point.',
        `Sender (${user.full_name || delivery.sender_name})`
      );
    });

    disputeTxn();

    // Broadcast handover dispute notice in real-time
    realtimeService.broadcastDeliveryUpdate(deliveryId, { status: 'Awaiting Sender Confirmation' });

    const updated = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(deliveryId);

    res.json({
      success: true,
      message: 'Notice recorded. The delivery remains Awaiting Sender Confirmation. The courier has been notified not to proceed until physical handover is confirmed.',
      delivery: updated
    });
  } catch (err) {
    console.error('Dispute handover error:', err);
    res.status(500).json({ error: 'Failed to record handover notice: ' + err.message });
  }
});

// 5. Get Handover Confirmation Audit Details
router.get('/:id/handover', (req, res) => {
  try {
    const deliveryId = Number(req.params.id);
    const handover = db.prepare(`
      SELECT * FROM handover_confirmations WHERE delivery_id = ? ORDER BY id DESC LIMIT 1
    `).get(deliveryId);

    if (!handover) {
      return res.status(404).json({ error: 'No handover confirmation record found for this delivery.' });
    }

    res.json(handover);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Track / Get Delivery by Tracking Number or ID
router.get('/:trackingOrId', optionalAuth, (req, res) => {
  try {
    const { trackingOrId } = req.params;
    let delivery;

    if (trackingOrId.startsWith('KOLA-')) {
      delivery = db.prepare('SELECT * FROM deliveries WHERE tracking_number = ?').get(trackingOrId.trim());
    } else {
      delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(trackingOrId);
    }

    if (!delivery) {
      return res.status(404).json({ error: 'Delivery not found. Please verify the tracking number (e.g., KOLA-20261005-000123).' });
    }

    // Get courier details if assigned
    let courier = null;
    if (delivery.courier_id) {
      courier = db.prepare(`
        SELECT id, full_name, phone, vehicle_type, plate_number, rating, total_trips
        FROM couriers WHERE id = ?
      `).get(delivery.courier_id);
    }

    // Get status history
    const history = db.prepare(`
      SELECT status, note, updated_by, timestamp
      FROM delivery_status_history
      WHERE delivery_id = ?
      ORDER BY id ASC
    `).all(delivery.id);

    // Get payment details
    const payment = db.prepare(`
      SELECT payment_method, amount, currency, reference_id, payment_status, confirmed_at, created_at
      FROM payments
      WHERE delivery_id = ?
      ORDER BY id DESC LIMIT 1
    `).get(delivery.id);

    // Get handover confirmation record if exists
    const handover = db.prepare(`
      SELECT * FROM handover_confirmations WHERE delivery_id = ? ORDER BY id DESC LIMIT 1
    `).get(delivery.id);

    // SECURITY: The Special Delivery PIN must NEVER be exposed to couriers!
    // Couriers must receive the PIN directly from the recipient at the door.
    const deliveryPayload = { ...delivery };
    if (req.user && req.user.role === 'courier') {
      delete deliveryPayload.delivery_pin;
    }

    res.json({
      delivery: deliveryPayload,
      courier,
      history,
      payment,
      handover: handover || null
    });
  } catch (err) {
    console.error('Fetch delivery error:', err);
    res.status(500).json({ error: 'Failed to fetch delivery: ' + err.message });
  }
});

// 4. List deliveries for logged in user or query phone
router.get('/', optionalAuth, (req, res) => {
  try {
    const { phone } = req.query;

    let deliveries = [];
    if (req.user) {
      const dbUser = db.prepare('SELECT id, phone, email FROM users WHERE id = ?').get(req.user.id);
      const userPhone = dbUser?.phone || req.user.phone || '';
      deliveries = db.prepare(`
        SELECT d.*, c.full_name as courier_name, c.phone as courier_phone, c.plate_number as courier_plate
        FROM deliveries d
        LEFT JOIN couriers c ON d.courier_id = c.id
        WHERE d.customer_id = ? 
           OR (d.sender_phone = ? AND ? != '')
        ORDER BY d.id DESC
      `).all(req.user.id, userPhone, userPhone);
    } else if (phone) {
      const pCheck = sanitizeAndValidateUgandaPhone(phone);
      const cleanPhone = pCheck.valid ? pCheck.formattedPhone : phone;
      deliveries = db.prepare(`
        SELECT d.*, c.full_name as courier_name, c.phone as courier_phone, c.plate_number as courier_plate
        FROM deliveries d
        LEFT JOIN couriers c ON d.courier_id = c.id
        WHERE d.sender_phone = ? OR d.recipient_phone = ?
        ORDER BY d.id DESC
      `).all(cleanPhone, cleanPhone);
    } else {
      return res.status(400).json({ error: 'Authentication or phone query parameter required' });
    }

    // Ensure frontend compatibility attributes are present
    const formatted = deliveries.map(d => ({
      ...d,
      dropoff_location: d.delivery_location,
      price: d.delivery_fee,
      delivery_status: d.status
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch deliveries: ' + err.message });
  }
});

module.exports = router;

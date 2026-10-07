const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticateToken, requireCourier } = require('./auth');
const realtimeService = require('../services/realtimeService');

// Public listing of active couriers (for dispatcher/assignment dropdown)
router.get('/', (req, res) => {
  try {
    const couriers = db.prepare(`
      SELECT id, full_name, phone, vehicle_type, plate_number, status, rating, total_trips
      FROM couriers
      ORDER BY status = 'active' DESC, rating DESC
    `).all();
    res.json(couriers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Courier gets their assigned tasks
router.get('/my-deliveries', authenticateToken, requireCourier, (req, res) => {
  try {
    let courierId = req.user.courier_id;
    if (!courierId) {
      const courier = db.prepare('SELECT id FROM couriers WHERE user_id = ? OR phone = ?').get(req.user.id, req.user.phone);
      if (courier) courierId = courier.id;
    }

    if (!courierId) {
      return res.status(404).json({ error: 'Courier profile not associated with this user' });
    }

    const deliveries = db.prepare(`
      SELECT * FROM deliveries
      WHERE courier_id = ?
      ORDER BY 
        CASE 
          WHEN status IN ('Courier Assigned', 'Courier En Route to Pickup', 'Awaiting Sender Confirmation', 'Package Picked Up', 'Item Picked Up', 'In Transit', 'Near Destination') THEN 1
          ELSE 2 
        END,
        id DESC
    `).all(courierId);

    // SECURITY: Strip delivery_pin so courier cannot inspect it via network or console
    deliveries.forEach(d => {
      delete d.delivery_pin;
    });

    res.json(deliveries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Courier marks "I've Arrived" at pickup location
router.post('/deliveries/:id/arrive', authenticateToken, requireCourier, (req, res) => {
  try {
    const deliveryId = Number(req.params.id);
    const { note } = req.body;

    const delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(deliveryId);
    if (!delivery) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    // Verify courier assignment (unless admin)
    if (req.user.role !== 'admin' && req.user.courier_id && delivery.courier_id !== req.user.courier_id) {
      return res.status(403).json({ error: 'You are not assigned to this delivery' });
    }

    const courier = db.prepare('SELECT * FROM couriers WHERE id = ?').get(delivery.courier_id);
    const courierName = courier ? courier.full_name : (req.user.full_name || 'Courier');

    const arriveTxn = db.transaction(() => {
      db.prepare(`
        UPDATE deliveries
        SET status = 'Awaiting Sender Confirmation',
            courier_arrived_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(deliveryId);

      db.prepare(`
        INSERT INTO delivery_status_history (delivery_id, status, note, updated_by)
        VALUES (?, 'Courier Arrived at Pickup', ?, ?)
      `).run(
        deliveryId,
        `Courier ${courierName} arrived at pickup location (${delivery.pickup_location}).`,
        courierName
      );

      db.prepare(`
        INSERT INTO delivery_status_history (delivery_id, status, note, updated_by)
        VALUES (?, 'Awaiting Sender Confirmation', ?, ?)
      `).run(
        deliveryId,
        note ? note.trim() : `Awaiting sender ${delivery.sender_name} physical package handover confirmation.`,
        'Kola System'
      );
    });

    arriveTxn();

    // Broadcast courier arrival at pickup location in real-time
    realtimeService.broadcastDeliveryUpdate(deliveryId, { status: 'Awaiting Sender Confirmation' });

    const updated = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(deliveryId);
    res.json({
      message: 'Arrival recorded. Awaiting sender package handover confirmation.',
      delivery: updated
    });
  } catch (err) {
    console.error('Courier arrival error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Courier confirms physical receipt of package from sender ("YES — I have been handed over the package")
router.post('/deliveries/:id/confirm-receipt', authenticateToken, requireCourier, (req, res) => {
  try {
    const deliveryId = Number(req.params.id);
    const delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(deliveryId);
    if (!delivery) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    if (req.user.role !== 'admin' && req.user.courier_id && delivery.courier_id !== req.user.courier_id) {
      return res.status(403).json({ error: 'You are not assigned to this delivery' });
    }

    if (!delivery.courier_arrived_at && delivery.status !== 'Awaiting Sender Confirmation') {
      return res.status(400).json({ error: 'You must first select "I\'ve Arrived" before confirming package receipt.' });
    }

    const courier = db.prepare('SELECT * FROM couriers WHERE id = ?').get(delivery.courier_id);
    const courierName = courier ? courier.full_name : (req.user.full_name || 'Courier');

    const receiptTxn = db.transaction(() => {
      db.prepare(`
        UPDATE deliveries
        SET courier_confirmed_at = CURRENT_TIMESTAMP,
            courier_confirmed_received = 1
        WHERE id = ?
      `).run(deliveryId);

      db.prepare(`
        INSERT INTO delivery_status_history (delivery_id, status, note, updated_by)
        VALUES (?, 'Courier Confirmed Handover Receipt', ?, ?)
      `).run(
        deliveryId,
        `Courier ${courierName} confirmed physical receipt: 'Package was handed over to me by sender ${delivery.sender_name}.'`,
        courierName
      );
    });

    receiptTxn();

    const updated = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(deliveryId);
    const senderAlsoConfirmed = !!updated.handover_confirmed_at;

    // Broadcast courier receipt confirmation in real-time
    realtimeService.broadcastDeliveryUpdate(deliveryId, { status: updated.status });

    res.json({
      message: senderAlsoConfirmed 
        ? 'Package handover verified by both sender and courier! Ready to start transit.'
        : `Package receipt confirmed. Waiting for sender ${delivery.sender_name} to confirm handover on their phone before transit begins.`,
      delivery: updated,
      sender_confirmed: senderAlsoConfirmed
    });
  } catch (err) {
    console.error('Courier confirm receipt error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Courier reports package has not yet been received from sender ("NO — Not Yet Received")
router.post('/deliveries/:id/report-not-received', authenticateToken, requireCourier, (req, res) => {
  try {
    const deliveryId = Number(req.params.id);
    const delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(deliveryId);
    if (!delivery) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    const courier = db.prepare('SELECT * FROM couriers WHERE id = ?').get(delivery.courier_id);
    const courierName = courier ? courier.full_name : (req.user.full_name || 'Courier');

    db.prepare(`
      INSERT INTO delivery_status_history (delivery_id, status, note, updated_by)
      VALUES (?, 'Awaiting Sender Confirmation', ?, ?)
    `).run(
      deliveryId,
      `Courier ${courierName} reported: 'Waiting for sender ${delivery.sender_name} to hand over the physical package.'`,
      courierName
    );

    // Broadcast report in real-time
    realtimeService.broadcastDeliveryUpdate(deliveryId, { status: 'Awaiting Sender Confirmation' });

    res.json({
      message: `Status recorded: Waiting to receive package from sender ${delivery.sender_name}.`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Courier updates delivery status with STRICT state transitions
router.post('/deliveries/:id/status', authenticateToken, requireCourier, (req, res) => {
  try {
    const deliveryId = Number(req.params.id);
    const { status, note } = req.body;

    // SECURITY RULE: Couriers cannot mark package as Picked Up
    if (status === 'Item Picked Up' || status === 'Package Picked Up') {
      return res.status(403).json({
        error: 'Security Rule Violation: Couriers cannot mark packages as picked up. The sender must physically confirm package handover on their phone.'
      });
    }

    const ALLOWED_COURIER_STATUSES = [
      'Courier En Route to Pickup',
      'Awaiting Sender Confirmation',
      'In Transit',
      'Near Destination',
      'Delivered'
    ];

    if (!ALLOWED_COURIER_STATUSES.includes(status)) {
      return res.status(400).json({
        error: `Invalid status update. Allowed: ${ALLOWED_COURIER_STATUSES.join(', ')}`
      });
    }

    const delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(deliveryId);
    if (!delivery) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    // Verify this courier owns the delivery (unless admin)
    if (req.user.role !== 'admin' && req.user.courier_id && delivery.courier_id !== req.user.courier_id) {
      return res.status(403).json({ error: 'You are not assigned to this delivery' });
    }

    // Strict state transition validation
    if (status === 'Courier En Route to Pickup' && delivery.status !== 'Courier Assigned') {
      return res.status(400).json({ error: `Cannot set En Route from status '${delivery.status}'` });
    }

    if (status === 'Awaiting Sender Confirmation') {
      if (delivery.status !== 'Courier En Route to Pickup' && delivery.status !== 'Courier Assigned') {
        return res.status(400).json({ error: `Cannot mark arrival from status '${delivery.status}'` });
      }
    }

    if (status === 'In Transit') {
      if (delivery.status !== 'Package Picked Up' && delivery.status !== 'Item Picked Up') {
        return res.status(400).json({
          error: `Cannot start transit: Package handover has not yet been confirmed by the sender. Current status: ${delivery.status}`
        });
      }
    }

    if (status === 'Near Destination' && delivery.status !== 'In Transit') {
      return res.status(400).json({ error: `Cannot mark Near Destination from status '${delivery.status}'` });
    }

    if (status === 'Delivered') {
      if (delivery.status !== 'Near Destination' && delivery.status !== 'In Transit') {
        return res.status(400).json({ error: `Cannot mark Delivered from status '${delivery.status}'` });
      }

      // Security check: Recipient PIN is required to confirm delivery to rightful owner
      const { pin } = req.body;
      if (!pin || pin.toString().trim() !== (delivery.delivery_pin || '').toString().trim()) {
        return res.status(400).json({
          error: `Recipient Verification Required: To confirm delivery, please ask recipient ${delivery.recipient_name} for the 4-digit PIN given to them by sender ${delivery.sender_name}.`
        });
      }
    }

    const courier = db.prepare('SELECT * FROM couriers WHERE id = ?').get(delivery.courier_id);
    const courierName = courier ? courier.full_name : (req.user.full_name || 'Courier');

    const updateTxn = db.transaction(() => {
      let extraUpdate = '';
      if (status === 'Awaiting Sender Confirmation') {
        extraUpdate = ', courier_arrived_at = CURRENT_TIMESTAMP';
      } else if (status === 'Delivered') {
        extraUpdate = ', delivered_at = CURRENT_TIMESTAMP, pin_verified_at = CURRENT_TIMESTAMP, delivery_confirmed_by_pin = 1';
        if (delivery.courier_id) {
          db.prepare('UPDATE couriers SET total_trips = total_trips + 1 WHERE id = ?').run(delivery.courier_id);
        }
      }

      db.prepare(`
        UPDATE deliveries
        SET status = ? ${extraUpdate}
        WHERE id = ?
      `).run(status, deliveryId);

      const statusNote = note ? note.trim() : (
        status === 'Delivered'
          ? `Delivered to rightful owner: Recipient ${delivery.recipient_name} confirmed identity by reading Special Delivery PIN. Verified by courier ${courierName}.`
          : `Status updated to ${status} by ${courierName}`
      );

      db.prepare(`
        INSERT INTO delivery_status_history (delivery_id, status, note, updated_by)
        VALUES (?, ?, ?, ?)
      `).run(deliveryId, status, statusNote, courierName);
    });

    updateTxn();

    // Broadcast status update in real-time
    realtimeService.broadcastDeliveryUpdate(deliveryId, { status });

    const updated = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(deliveryId);
    delete updated.delivery_pin;
    res.json({ message: 'Delivery status updated successfully', delivery: updated });
  } catch (err) {
    console.error('Courier status update error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Dedicated endpoint: Courier verifies Special PIN read by recipient and marks Delivered
router.post('/deliveries/:id/verify-pin-and-deliver', authenticateToken, requireCourier, (req, res) => {
  try {
    const deliveryId = Number(req.params.id);
    const { pin } = req.body;

    if (!pin || !pin.toString().trim()) {
      return res.status(400).json({
        error: 'Please enter the 4-digit PIN read to you by the recipient.'
      });
    }

    const delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(deliveryId);
    if (!delivery) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    // Verify courier assignment (unless admin)
    if (req.user.role !== 'admin' && req.user.courier_id && delivery.courier_id !== req.user.courier_id) {
      return res.status(403).json({ error: 'You are not assigned to this delivery' });
    }

    if (!['In Transit', 'Near Destination'].includes(delivery.status)) {
      if (delivery.status === 'Delivered') {
        return res.status(400).json({ error: 'This package has already been marked as Delivered.' });
      }
      return res.status(400).json({
        error: `Cannot complete delivery from status '${delivery.status}'. Package must be In Transit or Near Destination.`
      });
    }

    const enteredPin = pin.toString().trim();
    const actualPin = (delivery.delivery_pin || '').toString().trim();

    if (enteredPin !== actualPin) {
      return res.status(400).json({
        error: `Incorrect Delivery PIN! Please ask recipient ${delivery.recipient_name} to read the 4-digit PIN provided to them by sender ${delivery.sender_name}.`
      });
    }

    const courier = db.prepare('SELECT * FROM couriers WHERE id = ?').get(delivery.courier_id);
    const courierName = courier ? courier.full_name : (req.user.full_name || 'Courier');

    const deliverTxn = db.transaction(() => {
      db.prepare(`
        UPDATE deliveries
        SET status = 'Delivered',
            delivered_at = CURRENT_TIMESTAMP,
            pin_verified_at = CURRENT_TIMESTAMP,
            delivery_confirmed_by_pin = 1
        WHERE id = ?
      `).run(deliveryId);

      if (delivery.courier_id) {
        db.prepare('UPDATE couriers SET total_trips = total_trips + 1 WHERE id = ?').run(delivery.courier_id);
      }

      db.prepare(`
        INSERT INTO delivery_status_history (delivery_id, status, note, updated_by)
        VALUES (?, 'Delivered', ?, ?)
      `).run(
        deliveryId,
        `Delivered to rightful owner: Recipient ${delivery.recipient_name} confirmed identity by reading Special Delivery PIN. Verified by courier ${courierName}.`,
        courierName
      );
    });

    deliverTxn();

    // Broadcast successful delivery in real-time
    realtimeService.broadcastDeliveryUpdate(deliveryId, { status: 'Delivered' });

    const updated = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(deliveryId);
    delete updated.delivery_pin;

    res.json({
      success: true,
      message: `✓ PIN Verified! Package successfully handed over and confirmed delivered to rightful recipient ${delivery.recipient_name}.`,
      delivery: updated
    });
  } catch (err) {
    console.error('Verify PIN delivery error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

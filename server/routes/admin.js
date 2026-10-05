const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { getActivePricingRules, updatePricingRules } = require('../pricing');
const {
  authenticateToken,
  requireAdmin,
  requireSuperAdmin,
  requireOpsOrSuperAdmin,
  requireFinanceOrSuperAdmin
} = require('./auth');

// All endpoints in this router require valid Admin authorization
router.use(authenticateToken, requireAdmin);

// Structured Admin Audit Logger Helper
function logAdminAction(adminUser, action, resource, resourceId, details) {
  try {
    db.prepare(`
      INSERT INTO admin_logs (admin_id, admin_name, admin_role, action, resource, resource_id, details)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      adminUser.id || null,
      adminUser.full_name || 'Admin',
      adminUser.admin_role || 'super_admin',
      action,
      resource,
      String(resourceId || ''),
      details
    );
  } catch (err) {
    console.warn('Admin log error:', err.message);
  }
}

// 0. Current Admin User Profile & Permissions
router.get('/me', (req, res) => {
  res.json({
    user: req.user,
    role: req.user.admin_role || 'super_admin',
    permissions: {
      can_manage_deliveries: ['super_admin', 'operations_admin'].includes(req.user.admin_role || 'super_admin'),
      can_manage_couriers: ['super_admin', 'operations_admin'].includes(req.user.admin_role || 'super_admin'),
      can_view_finance: ['super_admin', 'finance_admin'].includes(req.user.admin_role || 'super_admin'),
      can_view_reports: ['super_admin', 'finance_admin'].includes(req.user.admin_role || 'super_admin'),
      can_manage_pricing: (req.user.admin_role || 'super_admin') === 'super_admin',
      can_manage_admins: (req.user.admin_role || 'super_admin') === 'super_admin',
      can_view_audit_logs: (req.user.admin_role || 'super_admin') === 'super_admin'
    }
  });
});

// 1. Dashboard Real-Time Statistics (From Actual Database)
router.get('/stats', (req, res) => {
  try {
    const totalDeliveries = db.prepare('SELECT COUNT(*) as count FROM deliveries').get().count;
    const pendingPayment = db.prepare("SELECT COUNT(*) as count FROM deliveries WHERE status = 'Awaiting Payment'").get().count;
    const readyForCourier = db.prepare("SELECT COUNT(*) as count FROM deliveries WHERE status = 'Payment Confirmed'").get().count;
    const awaitingHandover = db.prepare("SELECT COUNT(*) as count FROM deliveries WHERE status = 'Awaiting Sender Confirmation'").get().count;
    
    const activeDeliveries = db.prepare(`
      SELECT COUNT(*) as count FROM deliveries 
      WHERE status IN ('Courier Assigned', 'Courier En Route to Pickup', 'Awaiting Sender Confirmation', 'Package Picked Up', 'Item Picked Up', 'In Transit', 'Near Destination')
    `).get().count;

    const completedDeliveries = db.prepare("SELECT COUNT(*) as count FROM deliveries WHERE status = 'Delivered'").get().count;
    const cancelledDeliveries = db.prepare("SELECT COUNT(*) as count FROM deliveries WHERE status = 'Cancelled'").get().count;

    const unassignedDeliveries = db.prepare(`
      SELECT COUNT(*) as count FROM deliveries 
      WHERE courier_id IS NULL AND status IN ('Payment Confirmed', 'Request Created')
    `).get().count;

    const todayDeliveries = db.prepare(`
      SELECT COUNT(*) as count FROM deliveries WHERE date(created_at) = date('now')
    `).get().count;

    const totalRevenue = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE payment_status = 'Successful'
    `).get().total;

    const todayRevenue = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM payments 
      WHERE payment_status = 'Successful' AND date(confirmed_at) = date('now')
    `).get().total;

    const pendingRevenue = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE payment_status = 'Pending'
    `).get().total;

    const activeCouriersCount = db.prepare("SELECT COUNT(*) as count FROM couriers WHERE status = 'active'").get().count;
    const totalCouriersCount = db.prepare("SELECT COUNT(*) as count FROM couriers").get().count;
    const totalCustomersCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'customer'").get().count;

    res.json({
      totalDeliveries,
      total_deliveries: totalDeliveries,
      pendingPayment,
      pending_payment: pendingPayment,
      readyForCourier,
      ready_for_courier: readyForCourier,
      awaitingHandover,
      awaiting_handover: awaitingHandover,
      activeDeliveries,
      active_deliveries: activeDeliveries,
      completedDeliveries,
      completed_deliveries: completedDeliveries,
      cancelledDeliveries,
      cancelled_deliveries: cancelledDeliveries,
      unassignedDeliveries,
      unassigned_deliveries: unassignedDeliveries,
      todayDeliveries,
      today_deliveries: todayDeliveries,
      totalRevenue,
      total_revenue: totalRevenue,
      todayRevenue,
      today_revenue: todayRevenue,
      pendingRevenue,
      pending_revenue: pendingRevenue,
      activeCouriersCount,
      active_couriers: activeCouriersCount,
      totalCouriersCount,
      total_couriers: totalCouriersCount,
      totalCustomersCount,
      total_customers: totalCustomersCount
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. Real-Time Activity Feed & Events Stream
router.get('/events', (req, res) => {
  try {
    const historyEvents = db.prepare(`
      SELECT h.id, h.delivery_id, d.tracking_number, h.status, h.note, h.updated_by, h.timestamp,
             'delivery' as event_type
      FROM delivery_status_history h
      JOIN deliveries d ON h.delivery_id = d.id
      ORDER BY h.id DESC
      LIMIT 30
    `).all();

    res.json(historyEvents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Deliveries Management
router.get('/deliveries', (req, res) => {
  try {
    const { status, search } = req.query;

    let query = `
      SELECT d.*, c.full_name as courier_name, c.phone as courier_phone, c.plate_number as courier_plate
      FROM deliveries d
      LEFT JOIN couriers c ON d.courier_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (status && status !== 'all') {
      query += ' AND d.status = ?';
      params.push(status);
    }

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      query += ` AND (
        d.tracking_number LIKE ? OR
        d.sender_name LIKE ? OR
        d.sender_phone LIKE ? OR
        d.recipient_name LIKE ? OR
        d.recipient_phone LIKE ? OR
        d.pickup_location LIKE ? OR
        d.delivery_location LIKE ?
      )`;
      params.push(q, q, q, q, q, q, q);
    }

    query += ' ORDER BY d.id DESC LIMIT 150';

    const deliveries = db.prepare(query).all(...params);
    res.json(deliveries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3b. Single Delivery Detailed Inspector
router.get('/deliveries/:id', (req, res) => {
  try {
    const deliveryId = Number(req.params.id);
    const delivery = db.prepare(`
      SELECT d.*, c.full_name as courier_name, c.phone as courier_phone, c.plate_number as courier_plate,
             c.vehicle_type as courier_vehicle, c.rating as courier_rating, c.total_trips as courier_trips
      FROM deliveries d
      LEFT JOIN couriers c ON d.courier_id = c.id
      WHERE d.id = ?
    `).get(deliveryId);

    if (!delivery) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    const history = db.prepare(`
      SELECT * FROM delivery_status_history WHERE delivery_id = ? ORDER BY id ASC
    `).all(deliveryId);

    const payment = db.prepare(`
      SELECT * FROM payments WHERE delivery_id = ? ORDER BY id DESC LIMIT 1
    `).get(deliveryId);

    const handover = db.prepare(`
      SELECT * FROM handover_confirmations WHERE delivery_id = ? ORDER BY id DESC LIMIT 1
    `).get(deliveryId);

    res.json({
      ...delivery,
      delivery,
      history,
      payment: payment || null,
      handover: handover || null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Assign / Reassign Courier (Operations or Super Admin)
router.post('/deliveries/:id/assign', requireOpsOrSuperAdmin, (req, res) => {
  try {
    const deliveryId = Number(req.params.id);
    const { courier_id } = req.body;

    if (!courier_id) {
      return res.status(400).json({ error: 'courier_id is required' });
    }

    const delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(deliveryId);
    if (!delivery) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    const courier = db.prepare('SELECT * FROM couriers WHERE id = ?').get(courier_id);
    if (!courier) {
      return res.status(404).json({ error: 'Courier not found' });
    }

    const previousCourierId = delivery.courier_id;
    const isReassign = !!previousCourierId && previousCourierId !== courier_id;

    const assignTxn = db.transaction(() => {
      db.prepare(`
        UPDATE deliveries
        SET courier_id = ?, status = 'Courier Assigned', courier_assigned_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(courier_id, deliveryId);

      const noteText = isReassign
        ? `Reassigned to courier ${courier.full_name} (${courier.plate_number}, ${courier.phone}) by ${req.user.full_name || 'Admin'}`
        : `Assigned to courier ${courier.full_name} (${courier.plate_number}, ${courier.phone}) by ${req.user.full_name || 'Admin'}`;

      db.prepare(`
        INSERT INTO delivery_status_history (delivery_id, status, note, updated_by)
        VALUES (?, 'Courier Assigned', ?, ?)
      `).run(deliveryId, noteText, req.user.full_name || 'Admin');

      logAdminAction(
        req.user,
        isReassign ? 'REASSIGN_COURIER' : 'ASSIGN_COURIER',
        'delivery',
        delivery.tracking_number,
        `${isReassign ? 'Reassigned' : 'Assigned'} courier ${courier.full_name} (${courier.plate_number}) to ${delivery.tracking_number}`
      );
    });

    assignTxn();

    const updated = db.prepare(`
      SELECT d.*, c.full_name as courier_name, c.phone as courier_phone, c.plate_number as courier_plate
      FROM deliveries d
      LEFT JOIN couriers c ON d.courier_id = c.id
      WHERE d.id = ?
    `).get(deliveryId);

    res.json({ message: isReassign ? 'Courier reassigned successfully' : 'Courier assigned successfully', delivery: updated });
  } catch (err) {
    console.error('Assign courier error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 5. Cancel Delivery (Operations or Super Admin)
router.post('/deliveries/:id/cancel', requireOpsOrSuperAdmin, (req, res) => {
  try {
    const deliveryId = Number(req.params.id);
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'A cancellation reason is required.' });
    }

    const delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(deliveryId);
    if (!delivery) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    if (delivery.status === 'Delivered') {
      return res.status(400).json({ error: 'Cannot cancel a package that has already been delivered to the recipient.' });
    }

    const cancelTxn = db.transaction(() => {
      db.prepare("UPDATE deliveries SET status = 'Cancelled' WHERE id = ?").run(deliveryId);

      db.prepare(`
        INSERT INTO delivery_status_history (delivery_id, status, note, updated_by)
        VALUES (?, 'Cancelled', ?, ?)
      `).run(
        deliveryId,
        `Cancelled by ${req.user.full_name || 'Admin'}. Reason: ${reason.trim()}`,
        req.user.full_name || 'Admin'
      );

      logAdminAction(
        req.user,
        'CANCEL_DELIVERY',
        'delivery',
        delivery.tracking_number,
        `Delivery ${delivery.tracking_number} cancelled by ${req.user.full_name}. Reason: ${reason.trim()}`
      );
    });

    cancelTxn();

    res.json({ message: 'Delivery cancelled successfully', status: 'Cancelled' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Admin Override Status (Operations or Super Admin)
router.post('/deliveries/:id/status', requireOpsOrSuperAdmin, (req, res) => {
  try {
    const deliveryId = Number(req.params.id);
    const { status, note } = req.body;

    const delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(deliveryId);
    if (!delivery) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    const statusNote = note ? note.trim() : `Status changed to ${status} by administrator`;

    const updateTxn = db.transaction(() => {
      db.prepare('UPDATE deliveries SET status = ? WHERE id = ?').run(status, deliveryId);
      db.prepare(`
        INSERT INTO delivery_status_history (delivery_id, status, note, updated_by)
        VALUES (?, ?, ?, ?)
      `).run(deliveryId, status, statusNote, req.user.full_name || 'Admin');

      logAdminAction(
        req.user,
        'UPDATE_DELIVERY_STATUS',
        'delivery',
        delivery.tracking_number,
        `Status of ${delivery.tracking_number} manually updated from '${delivery.status}' to '${status}'`
      );
    });

    updateTxn();

    res.json({ message: 'Status updated successfully', status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Complete Handover Audit Trail for a Delivery
router.get('/deliveries/:id/handover-audit', (req, res) => {
  try {
    const deliveryId = Number(req.params.id);
    const delivery = db.prepare(`
      SELECT d.*, c.full_name as courier_name, c.phone as courier_phone, c.plate_number as courier_plate
      FROM deliveries d
      LEFT JOIN couriers c ON d.courier_id = c.id
      WHERE d.id = ?
    `).get(deliveryId);

    if (!delivery) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    const handover = db.prepare(`
      SELECT * FROM handover_confirmations WHERE delivery_id = ? ORDER BY id DESC LIMIT 1
    `).get(deliveryId);

    const history = db.prepare(`
      SELECT * FROM delivery_status_history WHERE delivery_id = ? ORDER BY id ASC
    `).all(deliveryId);

    const auditLogs = db.prepare(`
      SELECT * FROM admin_logs WHERE details LIKE ? OR resource_id = ? ORDER BY id DESC
    `).all(`%${delivery.tracking_number}%`, delivery.tracking_number);

    res.json({
      delivery,
      handover: handover || null,
      history,
      audit_steps: history,
      auditLogs,
      auditTrail: {
        courier_arrived: {
          timestamp: delivery.courier_arrived_at,
          courier: delivery.courier_name || 'N/A'
        },
        sender_confirmed: {
          timestamp: delivery.handover_confirmed_at,
          sender: delivery.sender_name,
          confirmation_id: delivery.handover_confirmation_id || (handover ? handover.handover_id : null)
        },
        package_picked_up: {
          timestamp: delivery.picked_up_at
        },
        recipient_pin_delivery: {
          pin: delivery.delivery_pin,
          verified: !!delivery.delivery_confirmed_by_pin,
          verified_at: delivery.pin_verified_at,
          recipient_name: delivery.recipient_name,
          recipient_phone: delivery.recipient_phone
        }
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Admin Authorized Handover Correction (Operations or Super Admin)
router.post('/deliveries/:id/correct-handover', requireOpsOrSuperAdmin, (req, res) => {
  try {
    const deliveryId = Number(req.params.id);
    const { action, reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'A justified reason is required for administrative handover corrections.' });
    }

    const delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(deliveryId);
    if (!delivery) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    const adminName = req.user.full_name || 'Admin';

    const correctionTxn = db.transaction(() => {
      if (action === 'revert_to_awaiting') {
        db.prepare(`
          UPDATE deliveries
          SET status = 'Awaiting Sender Confirmation',
              handover_status = 'admin_reverted',
              handover_notes = ?
          WHERE id = ?
        `).run(`Admin Reverted: ${reason.trim()}`, deliveryId);

        db.prepare(`
          INSERT INTO delivery_status_history (delivery_id, status, note, updated_by)
          VALUES (?, 'Awaiting Sender Confirmation', ?, ?)
        `).run(
          deliveryId,
          `ADMIN CORRECTION: Reverted from '${delivery.status}' to 'Awaiting Sender Confirmation'. Reason: ${reason.trim()}`,
          `Admin (${adminName})`
        );
      } else {
        const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const confirmationId = `KOLA-HO-${todayStr}-${String(deliveryId).padStart(6, '0')}-ADMIN`;

        db.prepare(`
          UPDATE deliveries
          SET status = 'Package Picked Up',
              handover_confirmed_at = CURRENT_TIMESTAMP,
              handover_confirmation_id = ?,
              handover_status = 'admin_confirmed',
              picked_up_at = CURRENT_TIMESTAMP,
              handover_notes = ?
          WHERE id = ?
        `).run(confirmationId, `Admin Override: ${reason.trim()}`, deliveryId);

        db.prepare(`
          INSERT INTO handover_confirmations (
            handover_id, delivery_id, tracking_number, sender_name, sender_phone,
            courier_id, courier_name, courier_phone, confirmed_at,
            previous_status, new_status, confirmation_type, status, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, 'Package Picked Up', 'admin_override', 'confirmed', ?)
        `).run(
          confirmationId,
          deliveryId,
          delivery.tracking_number,
          delivery.sender_name,
          delivery.sender_phone,
          delivery.courier_id || 1,
          'Assigned Courier',
          'N/A',
          delivery.status,
          `Admin Override: ${reason.trim()} by ${adminName}`
        );

        db.prepare(`
          INSERT INTO delivery_status_history (delivery_id, status, note, updated_by)
          VALUES (?, 'Package Picked Up', ?, ?)
        `).run(
          deliveryId,
          `ADMIN CORRECTION: Handover verified by administrator. Reason: ${reason.trim()} [ID: ${confirmationId}]`,
          `Admin (${adminName})`
        );
      }

      logAdminAction(
        req.user,
        'HANDOVER_CORRECTION',
        'delivery',
        delivery.tracking_number,
        `Handover correction on delivery ${delivery.tracking_number} (Action: ${action}). Reason: ${reason.trim()}`
      );
    });

    correctionTxn();

    const updated = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(deliveryId);
    res.json({
      message: 'Administrative handover correction applied and logged.',
      delivery: updated
    });
  } catch (err) {
    console.error('Admin handover correction error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 9. Courier Fleet Management
router.get('/couriers', (req, res) => {
  try {
    const couriers = db.prepare(`
      SELECT c.*, 
        (SELECT COUNT(*) FROM deliveries WHERE courier_id = c.id AND status IN ('Courier Assigned', 'Courier En Route to Pickup', 'Awaiting Sender Confirmation', 'Package Picked Up', 'Item Picked Up', 'In Transit', 'Near Destination')) as active_tasks,
        (SELECT COUNT(*) FROM deliveries WHERE courier_id = c.id AND status = 'Delivered') as completed_deliveries
      FROM couriers c
      ORDER BY c.status = 'active' DESC, c.rating DESC
    `).all();
    res.json(couriers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/couriers', requireOpsOrSuperAdmin, (req, res) => {
  try {
    const { full_name, phone, vehicle_type, plate_number, password } = req.body;

    if (!full_name || !phone || !plate_number) {
      return res.status(400).json({ error: 'Full name, phone, and plate number are required' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
    let userId;

    if (existing) {
      userId = existing.id;
    } else {
      const pass = password ? bcrypt.hashSync(password, 10) : bcrypt.hashSync('courier123', 10);
      const userRes = db.prepare(`
        INSERT INTO users (full_name, phone, password_hash, role)
        VALUES (?, ?, ?, 'courier')
      `).run(full_name.trim(), phone.trim(), pass);
      userId = userRes.lastInsertRowid;
    }

    const courierRes = db.prepare(`
      INSERT INTO couriers (user_id, full_name, phone, vehicle_type, plate_number, status)
      VALUES (?, ?, ?, ?, ?, 'active')
    `).run(userId, full_name.trim(), phone.trim(), vehicle_type || 'Boda Boda (Motorcycle)', plate_number.trim());

    logAdminAction(
      req.user,
      'ADD_COURIER',
      'courier',
      courierRes.lastInsertRowid,
      `Registered courier ${full_name} (${plate_number})`
    );

    const courier = db.prepare('SELECT * FROM couriers WHERE id = ?').get(courierRes.lastInsertRowid);
    res.status(201).json({ message: 'Courier added successfully', courier });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/couriers/:id/toggle', requireOpsOrSuperAdmin, (req, res) => {
  try {
    const courierId = Number(req.params.id);
    const courier = db.prepare('SELECT * FROM couriers WHERE id = ?').get(courierId);
    if (!courier) {
      return res.status(404).json({ error: 'Courier not found' });
    }

    const newStatus = courier.status === 'active' ? 'offline' : 'active';
    db.prepare('UPDATE couriers SET status = ? WHERE id = ?').run(newStatus, courierId);

    logAdminAction(
      req.user,
      'TOGGLE_COURIER_STATUS',
      'courier',
      courier.full_name,
      `Status of courier ${courier.full_name} changed to ${newStatus}`
    );

    res.json({ message: `Courier is now ${newStatus}`, status: newStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 10. Customer Management (Real Database Records)
router.get('/customers', (req, res) => {
  try {
    const { search } = req.query;
    let query = `
      SELECT u.id, u.full_name, u.phone, u.email, u.created_at,
        (SELECT COUNT(*) FROM deliveries WHERE customer_id = u.id OR sender_phone = u.phone) as total_orders,
        (SELECT COUNT(*) FROM deliveries WHERE (customer_id = u.id OR sender_phone = u.phone) AND status NOT IN ('Delivered', 'Cancelled')) as active_orders,
        (SELECT COALESCE(SUM(delivery_fee), 0) FROM deliveries WHERE (customer_id = u.id OR sender_phone = u.phone) AND status != 'Cancelled') as total_spend
      FROM users u
      WHERE u.role = 'customer'
    `;
    const params = [];

    if (search && search.trim()) {
      query += ` AND (u.full_name LIKE ? OR u.phone LIKE ? OR u.email LIKE ?)`;
      const q = `%${search.trim()}%`;
      params.push(q, q, q);
    }

    query += ' ORDER BY total_orders DESC, u.id DESC LIMIT 100';

    const customers = db.prepare(query).all(...params);
    res.json(customers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 10b. Customer Details & Order History Drawer
router.get('/customers/:id', (req, res) => {
  try {
    const customerId = Number(req.params.id);
    const customer = db.prepare(`
      SELECT id, full_name, phone, email, created_at FROM users WHERE id = ? AND role = 'customer'
    `).get(customerId);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const deliveries = db.prepare(`
      SELECT d.*, c.full_name as courier_name
      FROM deliveries d
      LEFT JOIN couriers c ON d.courier_id = c.id
      WHERE d.customer_id = ? OR d.sender_phone = ?
      ORDER BY d.id DESC
    `).all(customerId, customer.phone);

    res.json({
      customer,
      deliveries
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 11. Payments & Finance Ledger (Finance Admin or Super Admin)
router.get('/payments', requireFinanceOrSuperAdmin, (req, res) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT p.*, d.sender_name, d.recipient_name, d.delivery_fee, d.status as delivery_status
      FROM payments p
      JOIN deliveries d ON p.delivery_id = d.id
      WHERE 1=1
    `;
    const params = [];

    if (status && status !== 'all') {
      query += ' AND p.payment_status = ?';
      params.push(status);
    }

    query += ' ORDER BY p.id DESC LIMIT 150';

    const payments = db.prepare(query).all(...params);
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 12. Reports & Analytics (Finance Admin or Super Admin)
router.get('/reports', requireFinanceOrSuperAdmin, (req, res) => {
  try {
    // Deliveries by day (last 14 days)
    const dailyVolume = db.prepare(`
      SELECT date(created_at) as date, COUNT(*) as count, 
             SUM(CASE WHEN status = 'Delivered' THEN 1 ELSE 0 END) as delivered,
             SUM(CASE WHEN status = 'Cancelled' THEN 1 ELSE 0 END) as cancelled
      FROM deliveries
      WHERE created_at >= date('now', '-14 days')
      GROUP BY date(created_at)
      ORDER BY date(created_at) ASC
    `).all();

    // Revenue by day (last 14 days)
    const dailyRevenue = db.prepare(`
      SELECT date(confirmed_at) as date, SUM(amount) as revenue, COUNT(*) as tx_count
      FROM payments
      WHERE payment_status = 'Successful' AND confirmed_at >= date('now', '-14 days')
      GROUP BY date(confirmed_at)
      ORDER BY date(confirmed_at) ASC
    `).all();

    // Status distribution
    const statusDistribution = db.prepare(`
      SELECT status, COUNT(*) as count
      FROM deliveries
      GROUP BY status
    `).all();

    // Payment methods breakdown
    const paymentMethods = db.prepare(`
      SELECT payment_method, COUNT(*) as count, SUM(amount) as total_volume
      FROM payments
      WHERE payment_status = 'Successful'
      GROUP BY payment_method
    `).all();

    // Top Couriers by completed trips
    const courierRankings = db.prepare(`
      SELECT full_name, vehicle_type, plate_number, total_trips, rating, status
      FROM couriers
      ORDER BY total_trips DESC, rating DESC
      LIMIT 10
    `).all();

    res.json({
      dailyVolume,
      dailyRevenue,
      statusDistribution,
      paymentMethods,
      courierRankings
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 13. Pricing Configuration (Super Admin Only)
router.get('/pricing', (req, res) => {
  try {
    const rules = getActivePricingRules();
    res.json(rules);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/pricing', requireSuperAdmin, (req, res) => {
  try {
    const { 
      base_fee, base_fare, 
      per_km_rate, per_km, 
      min_fee, minimum_fare, 
      urgent_surcharge, rush_hour_surcharge_percent, 
      category_surcharges 
    } = req.body;

    const finalBase = base_fee ?? base_fare;
    const finalPerKm = per_km_rate ?? per_km;
    const finalMin = min_fee ?? minimum_fare;
    const finalUrgent = urgent_surcharge ?? rush_hour_surcharge_percent;

    if (finalBase == null || finalPerKm == null || finalMin == null) {
      return res.status(400).json({ error: 'Base fee, per km rate, and min fee are required' });
    }

    const defaultCategories = {
      document: 0,
      small_parcel: 500,
      medium_box: 1500,
      large_package: 3000,
      groceries: 1000,
      fragile: 2000
    };

    const mergedCategories = {
      ...defaultCategories,
      ...(category_surcharges || {})
    };

    const updated = updatePricingRules({
      base_fee: Number(finalBase),
      per_km_rate: Number(finalPerKm),
      min_fee: Number(finalMin),
      urgent_surcharge: Number(finalUrgent ?? 3000),
      category_surcharges: mergedCategories
    });

    logAdminAction(
      req.user,
      'UPDATE_PRICING',
      'pricing_rules',
      'current',
      `Updated pricing rules: Base UGX ${finalBase}, Rate/km UGX ${finalPerKm}, Min UGX ${finalMin}, Categories: ${JSON.stringify(mergedCategories)}`
    );

    res.json({ message: 'Pricing rules updated successfully', rules: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 14. Admin Audit Logs (Super Admin Only)
router.get('/logs', requireSuperAdmin, (req, res) => {
  try {
    const logs = db.prepare('SELECT * FROM admin_logs ORDER BY id DESC LIMIT 100').all();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 15. Admin Staff Management (Super Admin Only)
router.get('/users', requireSuperAdmin, (req, res) => {
  try {
    const admins = db.prepare(`
      SELECT id, full_name, email, phone, role, admin_role, is_active, created_at
      FROM users
      WHERE role = 'admin'
      ORDER BY id ASC
    `).all();
    res.json(admins);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/users', requireSuperAdmin, (req, res) => {
  try {
    const { full_name, email, phone, password, admin_role } = req.body;

    if (!full_name || !email || !password) {
      return res.status(400).json({ error: 'Full name, email, and password are required' });
    }

    const allowedRoles = ['super_admin', 'operations_admin', 'finance_admin'];
    const assignedRole = allowedRoles.includes(admin_role) ? admin_role : 'operations_admin';

    const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(email.trim());
    if (existing) {
      return res.status(400).json({ error: 'An account with this email address already exists.' });
    }

    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare(`
      INSERT INTO users (full_name, phone, email, password_hash, role, admin_role, is_active)
      VALUES (?, ?, ?, ?, 'admin', ?, 1)
    `).run(full_name.trim(), phone ? phone.trim() : null, email.trim().toLowerCase(), hash, assignedRole);

    logAdminAction(
      req.user,
      'CREATE_ADMIN_USER',
      'users',
      result.lastInsertRowid,
      `Created admin user ${full_name} (${email}) with role ${assignedRole}`
    );

    res.status(201).json({
      message: `Admin user created successfully with role: ${assignedRole}`,
      admin: {
        id: result.lastInsertRowid,
        full_name: full_name.trim(),
        email: email.trim().toLowerCase(),
        admin_role: assignedRole
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/users/:id/toggle', requireSuperAdmin, (req, res) => {
  try {
    const adminId = Number(req.params.id);
    if (adminId === req.user.id) {
      return res.status(400).json({ error: 'You cannot deactivate your own admin account.' });
    }

    const targetUser = db.prepare('SELECT id, full_name, email, is_active FROM users WHERE id = ? AND role = "admin"').get(adminId);
    if (!targetUser) {
      return res.status(404).json({ error: 'Admin user not found' });
    }

    const newActiveState = targetUser.is_active === 1 ? 0 : 1;
    db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(newActiveState, adminId);

    logAdminAction(
      req.user,
      'TOGGLE_ADMIN_STATUS',
      'users',
      targetUser.email,
      `${newActiveState ? 'Activated' : 'Deactivated'} admin account ${targetUser.full_name} (${targetUser.email})`
    );

    res.json({
      message: `Admin account is now ${newActiveState ? 'Active' : 'Deactivated'}`,
      is_active: newActiveState
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

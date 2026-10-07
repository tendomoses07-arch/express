const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../db');
const { sanitizeAndValidateUgandaPhone } = require('../paymentGateway');

const JWT_SECRET = process.env.JWT_SECRET || 'kola_express_secret_jwt_key_2026';

// Middleware for authenticating requests
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    
    // Check if the user exists in database and enrich req.user
    if (user && user.id) {
      const dbUser = db.prepare('SELECT id, full_name, phone, email, role, admin_role, is_active FROM users WHERE id = ?').get(user.id);
      if (dbUser) {
        req.user = { ...user, ...dbUser };
        return next();
      }
    }

    // If ID from token not found in SQLite (e.g. reseeded DB), try matching by phone or email
    if (user && (user.phone || user.email)) {
      let dbUser = null;
      if (user.phone) {
        dbUser = db.prepare('SELECT id, full_name, phone, email, role, admin_role, is_active FROM users WHERE phone = ?').get(user.phone);
      }
      if (!dbUser && user.email) {
        dbUser = db.prepare('SELECT id, full_name, phone, email, role, admin_role, is_active FROM users WHERE LOWER(email) = LOWER(?)').get(user.email);
      }
      if (dbUser) {
        req.user = { ...user, ...dbUser };
        return next();
      }
    }

    req.user = user;
    next();
  });
}

// Middleware for Admin only (any administrative role)
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Administrative authorization required' });
  }
  next();
}

// Middleware for Super Admin only (full access)
function requireSuperAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin' || (req.user.admin_role && req.user.admin_role !== 'super_admin')) {
    return res.status(403).json({ error: 'Access Denied: Super Admin permission required for this action' });
  }
  next();
}

// Middleware for Operations Admin or Super Admin
function requireOpsOrSuperAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Administrative authorization required' });
  }
  const allowed = ['super_admin', 'operations_admin'];
  if (req.user.admin_role && !allowed.includes(req.user.admin_role)) {
    return res.status(403).json({ error: 'Access Denied: Operations Admin or Super Admin permission required' });
  }
  next();
}

// Middleware for Finance Admin or Super Admin
function requireFinanceOrSuperAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Administrative authorization required' });
  }
  const allowed = ['super_admin', 'finance_admin'];
  if (req.user.admin_role && !allowed.includes(req.user.admin_role)) {
    return res.status(403).json({ error: 'Access Denied: Finance Admin or Super Admin permission required' });
  }
  next();
}

// Middleware for Courier only
function requireCourier(req, res, next) {
  if (!req.user || (req.user.role !== 'courier' && req.user.role !== 'admin')) {
    return res.status(403).json({ error: 'Courier access required' });
  }
  next();
}

// Register Customer (Email or Phone Number required)
router.post('/register', (req, res) => {
  try {
    const { full_name, phone, email, identifier, password } = req.body;

    if (!full_name || !full_name.trim()) {
      return res.status(400).json({ error: 'Full name is required' });
    }

    if (!password || password.length < 4) {
      return res.status(400).json({ error: 'Password is required (minimum 4 characters)' });
    }

    let contactPhone = (phone || '').trim();
    let contactEmail = (email || '').trim();
    const contactIdentifier = (identifier || '').trim();

    // If identifier was provided instead of separate fields, determine whether it's an email or a phone
    if (!contactPhone && !contactEmail && contactIdentifier) {
      if (contactIdentifier.includes('@')) {
        contactEmail = contactIdentifier;
      } else {
        contactPhone = contactIdentifier;
      }
    }

    if (!contactPhone && !contactEmail) {
      return res.status(400).json({ error: 'Please provide either an email address or a phone number to register' });
    }

    let validatedPhone = null;
    if (contactPhone) {
      const phoneCheck = sanitizeAndValidateUgandaPhone(contactPhone);
      if (!phoneCheck.valid) {
        return res.status(400).json({ error: phoneCheck.message });
      }
      validatedPhone = phoneCheck.formattedPhone;

      const existingPhone = db.prepare('SELECT id FROM users WHERE phone = ?').get(validatedPhone);
      if (existingPhone) {
        return res.status(400).json({ error: 'An account with this phone number already exists. Please log in.' });
      }
    }

    let validatedEmail = null;
    if (contactEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(contactEmail)) {
        return res.status(400).json({ error: 'Please enter a valid email address (e.g. name@example.com)' });
      }
      validatedEmail = contactEmail.toLowerCase();

      const existingEmail = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(validatedEmail);
      if (existingEmail) {
        return res.status(400).json({ error: 'An account with this email address already exists. Please log in.' });
      }
    }

    const password_hash = bcrypt.hashSync(password, 10);
    const result = db.prepare(`
      INSERT INTO users (full_name, phone, email, password_hash, role)
      VALUES (?, ?, ?, ?, 'customer')
    `).run(full_name.trim(), validatedPhone, validatedEmail, password_hash);

    const user = {
      id: result.lastInsertRowid,
      full_name: full_name.trim(),
      phone: validatedPhone,
      email: validatedEmail,
      role: 'customer'
    };

    // Immediately link all past deliveries associated with this customer phone so order history is preserved
    if (validatedPhone) {
      db.prepare(`
        UPDATE deliveries
        SET customer_id = ?
        WHERE sender_phone = ? AND (customer_id IS NULL OR customer_id != ?)
      `).run(user.id, validatedPhone, user.id);
    }

    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ user, token });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Failed to create account: ' + err.message });
  }
});

// Login (Customer, Courier, or Admin)
router.post('/login', (req, res) => {
  try {
    const { identifier, phone, email, password } = req.body;
    const loginTarget = (identifier || phone || email || '').trim();

    if (!loginTarget || !password) {
      return res.status(400).json({ error: 'Phone/Email and password are required' });
    }

    // Try finding by phone or email
    let user = db.prepare('SELECT * FROM users WHERE phone = ? OR LOWER(email) = LOWER(?)').get(loginTarget, loginTarget);

    // Also support formatted Uganda phone if applicable
    if (!user) {
      const pCheck = sanitizeAndValidateUgandaPhone(loginTarget);
      if (pCheck.valid) {
        user = db.prepare('SELECT * FROM users WHERE phone = ?').get(pCheck.formattedPhone);
      }
    }

    // Also support admin username / role lookup (admin, super_admin, ops, finance, full names)
    if (!user) {
      const lower = loginTarget.toLowerCase();
      let roleTarget = null;
      if (['admin', 'superadmin', 'super_admin', 'super admin', 'administrator', 'kola administrator'].includes(lower)) {
        roleTarget = 'super_admin';
      } else if (['ops', 'operations', 'operations_admin', 'operations admin', 'operations director'].includes(lower)) {
        roleTarget = 'operations_admin';
      } else if (['finance', 'finance_admin', 'finance admin', 'finance officer'].includes(lower)) {
        roleTarget = 'finance_admin';
      }

      if (roleTarget) {
        user = db.prepare("SELECT * FROM users WHERE admin_role = ? AND role = 'admin' ORDER BY id ASC LIMIT 1").get(roleTarget);
      } else {
        user = db.prepare("SELECT * FROM users WHERE LOWER(full_name) = LOWER(?) AND role = 'admin' LIMIT 1").get(loginTarget);
      }
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials. Please check your phone/email/username.' });
    }

    const cleanPassword = typeof password === 'string' ? password : String(password);
    const valid = bcrypt.compareSync(cleanPassword, user.password_hash) || 
                  bcrypt.compareSync(cleanPassword.trim(), user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials. Password does not match.' });
    }

    if (user.is_active === 0) {
      return res.status(403).json({ error: 'This account has been deactivated. Please contact support.' });
    }

    // If courier, fetch courier profile info
    let courierInfo = null;
    if (user.role === 'courier') {
      courierInfo = db.prepare('SELECT * FROM couriers WHERE user_id = ?').get(user.id);
    }

    const payload = {
      id: user.id,
      full_name: user.full_name,
      phone: user.phone,
      email: user.email,
      role: user.role,
      admin_role: user.admin_role || (user.role === 'admin' ? 'super_admin' : null),
      courier_id: courierInfo ? courierInfo.id : null
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
    res.json({
      user: payload,
      courier: courierInfo,
      token
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed: ' + err.message });
  }
});

// Current User Me
router.get('/me', authenticateToken, (req, res) => {
  try {
    const user = db.prepare('SELECT id, full_name, phone, email, role, admin_role, is_active, created_at FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let courier = null;
    if (user.role === 'courier') {
      courier = db.prepare('SELECT * FROM couriers WHERE user_id = ?').get(user.id);
    }

    res.json({ user, courier });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve profile' });
  }
});

module.exports = {
  router,
  authenticateToken,
  requireAdmin,
  requireSuperAdmin,
  requireOpsOrSuperAdmin,
  requireFinanceOrSuperAdmin,
  requireCourier,
  JWT_SECRET
};

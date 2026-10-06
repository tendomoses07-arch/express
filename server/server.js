require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDatabase } = require('./db');
const { getActivePricingRules } = require('./pricing');

// Initialize database
initDatabase();

const PORT = process.env.PORT || 3000;
const ADMIN_PORT = process.env.ADMIN_PORT || 3001;

// Common API Router
const apiRouter = express.Router();
apiRouter.use(cors());
apiRouter.use(express.json());
apiRouter.use(express.urlencoded({ extended: true }));

// Public pricing info endpoint
apiRouter.get('/pricing', (req, res) => {
  try {
    const rules = getActivePricingRules();
    res.json(rules);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mount modular API routes
apiRouter.use('/auth', require('./routes/auth').router);
apiRouter.use('/deliveries', require('./routes/deliveries'));
apiRouter.use('/payments', require('./routes/payments'));
apiRouter.use('/couriers', require('./routes/couriers'));
apiRouter.use('/courier', require('./routes/couriers'));
apiRouter.use('/admin', require('./routes/admin'));

// =================================================================
// 1. MAIN PUBLIC APP (Port 3000 — Customer Website)
// =================================================================
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mount API routes
app.use('/api', apiRouter);

// Subdomain routing check: if accessed via admin.kolaexpress.com or admin.localhost
app.use((req, res, next) => {
  const host = req.headers.host || '';
  if (host.startsWith('admin.')) {
    return express.static(path.join(__dirname, '../admin'))(req, res, () => {
      res.sendFile(path.join(__dirname, '../admin/index.html'));
    });
  }
  next();
});

// Admin static route and SPA fallback on main domain (e.g. /admin)
app.use('/admin', express.static(path.join(__dirname, '../admin')));
app.use('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../admin/index.html'));
});

// Public Customer Website static assets
app.use(express.static(path.join(__dirname, '../public')));

// Fallback to public index.html for customer SPA routing
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// =================================================================
// 2. INDEPENDENT ADMIN APP (Port 3001 — Standalone Admin Portal)
// =================================================================
const adminApp = express();
adminApp.use(cors());
adminApp.use(express.json());
adminApp.use(express.urlencoded({ extended: true }));

// Mount identical API endpoints so admin client can talk directly
adminApp.use('/api', apiRouter);

// Serve Admin static frontend
adminApp.use(express.static(path.join(__dirname, '../admin')));

// Fallback for Admin SPA
adminApp.use((req, res) => {
  res.sendFile(path.join(__dirname, '../admin/index.html'));
});

// Start Servers
const server = app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 KOLA EXPRESS Delivery Service is running!`);
  console.log(`📍 Public Customer Web App: http://localhost:${PORT}`);
  console.log(`📍 Environment: Kampala, Uganda (EAT)`);
  console.log(`💳 Cashless Engine: MTN MoMo & Airtel Money`);
  console.log(`===============================================`);
});

let adminServer = null;
try {
  adminServer = adminApp.listen(ADMIN_PORT, () => {
    console.log(`===============================================`);
    console.log(`⚡ KOLA EXPRESS Admin Console is running!`);
    console.log(`📍 Independent Admin Portal: http://localhost:${ADMIN_PORT}`);
    console.log(`🛡️ Access Control: Super, Operations & Finance RBAC`);
    console.log(`===============================================`);
  });
  adminServer.on('error', (err) => {
    console.warn(`[Hostinger / Cloud Info] Standalone admin port ${ADMIN_PORT} not bound (${err.message}). Admin portal is fully accessible at /admin on main port.`);
  });
} catch (err) {
  console.warn(`[Hostinger / Cloud Info] Standalone admin port ${ADMIN_PORT} not bound. Admin portal is fully accessible at /admin on main port.`);
}

module.exports = { app, adminApp, server, adminServer };

// End-to-End Verification Test for Independent Admin Panel & RBAC
const http = require('http');

function post(url, data, token = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = JSON.stringify(data);
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    }, (res) => {
      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(d) });
        } catch (e) {
          resolve({ status: res.statusCode, text: d });
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function get(url, token = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: 'GET',
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    }, (res) => {
      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(d) });
        } catch (e) {
          resolve({ status: res.statusCode, text: d });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 RUNNING KOLA EXPRESS INDEPENDENT ADMIN SUITE');
  console.log('====================================================');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // 1. Check Customer Website on Port 3000
    console.log('\n--- 1. PUBLIC WEBSITE PRESERVATION (PORT 3000) ---');
    const pubRes = await get('http://localhost:3000/');
    assert(pubRes.status === 200, 'Public customer website serves HTTP 200 on Port 3000');
    assert(pubRes.text && pubRes.text.includes('Kola Express'), 'Public site contains Kola Express brand');
    assert(!pubRes.text.includes('Internal Dispatch & Operations Management'), 'Public site is NOT replaced by Admin Panel');

    // 2. Check Dedicated Independent Admin App on Port 3001
    console.log('\n--- 2. INDEPENDENT ADMIN APP ISOLATION (PORT 3001) ---');
    const adminRes = await get('http://localhost:3001/');
    assert(adminRes.status === 200, 'Admin Panel serves HTTP 200 on Port 3001');
    assert(adminRes.text && adminRes.text.includes('Kola Express Admin'), 'Admin Panel index.html contains Admin title');
    assert(adminRes.text.includes('id="adminLoginPortal"'), 'Admin Panel includes dedicated Login Portal');

    const cssRes = await get('http://localhost:3001/css/admin.css');
    assert(cssRes.status === 200 && cssRes.text.includes('--bg-app'), 'Admin CSS stylesheet loaded on Port 3001');

    const jsApiRes = await get('http://localhost:3001/js/admin-api.js');
    assert(jsApiRes.status === 200 && jsApiRes.text.includes('adminApi'), 'Admin API client loaded on Port 3001');

    const jsAppRes = await get('http://localhost:3001/js/admin-app.js');
    assert(jsAppRes.status === 200 && jsAppRes.text.includes('AdminApp'), 'Admin SPA App controller loaded on Port 3001');

    // 3. Admin Authentication & RBAC Verification
    console.log('\n--- 3. AUTHENTICATION & RBAC PERMISSION CHECKS ---');
    
    // Super Admin login
    const superLogin = await post('http://localhost:3001/api/auth/login', {
      identifier: 'admin@kolaexpress.ug',
      password: 'admin123'
    });
    assert(superLogin.status === 200, 'Super Admin login successful');
    assert(superLogin.data.user.admin_role === 'super_admin', 'User has super_admin role');
    const superToken = superLogin.data.token;

    // Ops Admin login
    const opsLogin = await post('http://localhost:3001/api/auth/login', {
      identifier: 'ops@kolaexpress.ug',
      password: 'ops123'
    });
    assert(opsLogin.status === 200, 'Operations Admin login successful');
    assert(opsLogin.data.user.admin_role === 'operations_admin', 'User has operations_admin role');
    const opsToken = opsLogin.data.token;

    // Finance Admin login
    const finLogin = await post('http://localhost:3001/api/auth/login', {
      identifier: 'finance@kolaexpress.ug',
      password: 'finance123'
    });
    assert(finLogin.status === 200, 'Finance Admin login successful');
    assert(finLogin.data.user.admin_role === 'finance_admin', 'User has finance_admin role');
    const finToken = finLogin.data.token;

    // Customer login
    const custLogin = await post('http://localhost:3000/api/auth/login', {
      identifier: '0775123456',
      password: 'customer123'
    });
    assert(custLogin.status === 200, 'Customer Sarah login successful');
    const custToken = custLogin.data.token;

    // 4. Test RBAC Authorization Constraints
    console.log('\n--- 4. STRICT BACKEND AUTHORIZATION ENFORCEMENT ---');

    // Super Admin tests (should access everything)
    const superStats = await get('http://localhost:3001/api/admin/stats', superToken);
    assert(superStats.status === 200 && superStats.data.total_deliveries !== undefined, 'Super Admin can access /api/admin/stats');

    const superDeliveries = await get('http://localhost:3001/api/admin/deliveries', superToken);
    assert(superDeliveries.status === 200 && Array.isArray(superDeliveries.data), 'Super Admin can access /api/admin/deliveries');

    const superPayments = await get('http://localhost:3001/api/admin/payments', superToken);
    assert(superPayments.status === 200 && Array.isArray(superPayments.data), 'Super Admin can access /api/admin/payments');

    const superLogs = await get('http://localhost:3001/api/admin/logs', superToken);
    assert(superLogs.status === 200 && Array.isArray(superLogs.data), 'Super Admin can access /api/admin/logs');

    // Operations Admin tests
    const opsDeliveries = await get('http://localhost:3001/api/admin/deliveries', opsToken);
    assert(opsDeliveries.status === 200, 'Operations Admin CAN access deliveries');

    const opsCouriers = await get('http://localhost:3001/api/admin/couriers', opsToken);
    assert(opsCouriers.status === 200, 'Operations Admin CAN access couriers');

    const opsPayments = await get('http://localhost:3001/api/admin/payments', opsToken);
    assert(opsPayments.status === 403, 'Operations Admin is FORBIDDEN on payments (HTTP 403)');

    const opsLogs = await get('http://localhost:3001/api/admin/logs', opsToken);
    assert(opsLogs.status === 403, 'Operations Admin is FORBIDDEN on audit logs (HTTP 403)');

    const opsUsers = await get('http://localhost:3001/api/admin/users', opsToken);
    assert(opsUsers.status === 403, 'Operations Admin is FORBIDDEN on staff administration (HTTP 403)');

    // Finance Admin tests
    const finPayments = await get('http://localhost:3001/api/admin/payments', finToken);
    assert(finPayments.status === 200, 'Finance Admin CAN access payments ledger');

    const finReports = await get('http://localhost:3001/api/admin/reports', finToken);
    assert(finReports.status === 200, 'Finance Admin CAN access financial reports');

    const finCouriers = await post('http://localhost:3001/api/admin/couriers', { name: 'Fake', phone: '0770000000' }, finToken);
    assert(finCouriers.status === 403, 'Finance Admin is FORBIDDEN from registering couriers (HTTP 403)');

    const finCancel = await post('http://localhost:3001/api/admin/deliveries/1/cancel', { reason: 'Unauthorized' }, finToken);
    assert(finCancel.status === 403, 'Finance Admin is FORBIDDEN from cancelling deliveries (HTTP 403)');

    // Regular Customer trying to access Admin API
    const custAdminAttempt = await get('http://localhost:3001/api/admin/stats', custToken);
    assert(custAdminAttempt.status === 403, 'Regular Customer is FORBIDDEN from Admin API (HTTP 403)');

    // 5. Test Real Data Synchronization
    console.log('\n--- 5. REAL-TIME DATA SYNCHRONIZATION WITH DB ---');
    // Create a delivery as customer on Port 3000
    const newDeliveryRes = await post('http://localhost:3000/api/deliveries', {
      sender_name: 'Sarah Nakato',
      sender_phone: '0775123456',
      pickup_location: 'Kololo Airstrip, Kampala',
      delivery_location: 'Acacia Mall, Kisementi',
      item_description: 'Electronics & Test Documents',
      item_category: 'small_parcel',
      recipient_name: 'David Ochieng',
      recipient_phone: '0782999888'
    }, custToken);

    assert(newDeliveryRes.status === 201 && newDeliveryRes.data && newDeliveryRes.data.delivery, 'Customer successfully created delivery on Port 3000');
    const createdDelivery = newDeliveryRes.data.delivery;

    // Check that Admin Panel sees this exact delivery in real DB
    const adminDeliveryRes = await get(`http://localhost:3001/api/admin/deliveries/${createdDelivery.id}`, superToken);
    assert(adminDeliveryRes.status === 200, 'Admin can query the created delivery by ID');
    assert(adminDeliveryRes.data.pickup_location === 'Kololo Airstrip, Kampala', 'Admin sees exact pickup location from DB');
    assert(adminDeliveryRes.data.recipient_name === 'David Ochieng', 'Admin sees exact recipient from DB');

    // Initiate and verify cashless payment
    const initPayRes = await post('http://localhost:3000/api/payments/initiate', {
      delivery_id: createdDelivery.id,
      customer_phone: '0775123456',
      payment_method: 'MTN Mobile Money'
    }, custToken);
    assert(initPayRes.status === 200 && initPayRes.data.reference_id, 'Payment initiated via Cashless MoMo gateway');

    const verifyPayRes = await post('http://localhost:3000/api/payments/verify', {
      reference_id: initPayRes.data.reference_id
    }, custToken);
    assert(verifyPayRes.status === 200 && verifyPayRes.data.status === 'Successful', 'Payment verified and confirmed in cashless engine');

    // Assign courier via Operations Admin
    const assignRes = await post(`http://localhost:3001/api/admin/deliveries/${createdDelivery.id}/assign`, {
      courier_id: 1 // Musa
    }, opsToken);
    assert(assignRes.status === 200, 'Operations Admin assigned courier via Admin API');

    // Check Handover Audit Endpoint
    const auditRes = await get(`http://localhost:3001/api/admin/deliveries/${createdDelivery.id}/handover-audit`, opsToken);
    assert(auditRes.status === 200, 'Handover audit retrieved successfully');
    assert(auditRes.data.audit_steps !== undefined, 'Handover audit contains milestone steps');

    // Check Audit Log recorded the assignment
    const logsRes = await get('http://localhost:3001/api/admin/logs', superToken);
    assert(logsRes.status === 200 && logsRes.data.length > 0, 'Audit logs recorded operational actions');
    const assignmentLog = logsRes.data.find(l => l.action.includes('COURIER') && (
      String(l.resource_id) === String(createdDelivery.id) || 
      String(l.resource_id) === String(createdDelivery.tracking_number) || 
      (l.details && l.details.includes(createdDelivery.tracking_number))
    ));
    assert(!!assignmentLog, 'Found specific ASSIGN_COURIER audit log with resource_id and admin details');

    console.log('\n====================================================');
    console.log(`🏁 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================');
    process.exit(failed > 0 ? 1 : 0);

  } catch (err) {
    console.error('Test script crashed:', err);
    process.exit(1);
  }
}

runTests();

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

async function testPricingEngine() {
  console.log('======================================================');
  console.log('🧪 TESTING CATEGORY SURCHARGES IN ADMIN PRICING ENGINE');
  console.log('======================================================');

  // 1. Verify HTML inputs in Admin Portal (Port 3001)
  const adminHtmlRes = await get('http://localhost:3001/');
  console.log('1. Checking Admin Portal HTML on Port 3001...');
  if (adminHtmlRes.status === 200 && adminHtmlRes.text.includes('Category Surcharges (UGX)')) {
    console.log('  ✅ PASS: "Category Surcharges (UGX)" section exists in Admin Portal');
  } else {
    console.error('  ❌ FAIL: Missing "Category Surcharges (UGX)" in Admin Portal HTML');
    process.exit(1);
  }

  const expectedInputs = [
    'pricingCatDocument',
    'pricingCatSmallParcel',
    'pricingCatMediumBox',
    'pricingCatLargePackage',
    'pricingCatGroceries',
    'pricingCatFragile',
    'savePricingRulesBtn'
  ];

  for (const inputId of expectedInputs) {
    if (adminHtmlRes.text.includes(`id="${inputId}"`)) {
      console.log(`  ✅ PASS: Found input/button with id="${inputId}"`);
    } else {
      console.error(`  ❌ FAIL: Missing element with id="${inputId}"`);
      process.exit(1);
    }
  }

  // 2. Super Admin Login
  console.log('\n2. Logging in as Super Admin...');
  const loginRes = await post('http://localhost:3001/api/auth/login', {
    identifier: 'admin@kolaexpress.ug',
    password: 'admin123'
  });
  if (loginRes.status !== 200) {
    console.error('  ❌ FAIL: Super admin login failed');
    process.exit(1);
  }
  const token = loginRes.data.token;
  console.log('  ✅ PASS: Super admin logged in successfully');

  // 3. GET /api/admin/pricing
  console.log('\n3. Fetching active pricing rules from Admin API...');
  const pricingRes = await get('http://localhost:3001/api/admin/pricing', token);
  if (pricingRes.status === 200) {
    console.log('  ✅ PASS: GET /api/admin/pricing returned HTTP 200');
    console.log('  Active Category Surcharges:', pricingRes.data.category_surcharges);
  } else {
    console.error('  ❌ FAIL: GET /api/admin/pricing returned', pricingRes.status);
    process.exit(1);
  }

  // 4. Save Pricing Rules with exact requested Category Surcharges
  console.log('\n4. Saving Pricing Rules with exact requested Category Surcharges...');
  const updatePayload = {
    base_fee: 4000,
    per_km_rate: 800,
    min_fee: 3500,
    urgent_surcharge: 3000,
    category_surcharges: {
      document: 0,
      small_parcel: 500,
      medium_box: 1500,
      large_package: 3000,
      groceries: 1000,
      fragile: 2000
    }
  };

  const updateRes = await post('http://localhost:3001/api/admin/pricing', updatePayload, token);
  if (updateRes.status === 200 && updateRes.data.rules) {
    console.log('  ✅ PASS: POST /api/admin/pricing returned HTTP 200');
    console.log('  Updated Category Surcharges in DB:', updateRes.data.rules.category_surcharges);
  } else {
    console.error('  ❌ FAIL: Failed to update pricing rules:', updateRes);
    process.exit(1);
  }

  // 5. Test Live Calculation with Category Surcharges on Customer Site
  console.log('\n5. Verifying live quote calculation reflects category surcharges...');
  const quoteFragile = await post('http://localhost:3000/api/deliveries/quote', {
    pickup_location: 'Kololo, Kampala',
    delivery_location: 'Ntinda, Kampala',
    item_category: 'fragile'
  });
  if (quoteFragile.status === 200 && quoteFragile.data.category_fee === 2000) {
    console.log('  ✅ PASS: Fragile category surcharge is UGX 2,000 in delivery quote');
  } else {
    console.error('  ❌ FAIL: Unexpected fragile fee in quote:', quoteFragile.data);
    process.exit(1);
  }

  const quoteDoc = await post('http://localhost:3000/api/deliveries/quote', {
    pickup_location: 'Kololo, Kampala',
    delivery_location: 'Ntinda, Kampala',
    item_category: 'document'
  });
  if (quoteDoc.status === 200 && quoteDoc.data.category_fee === 0) {
    console.log('  ✅ PASS: Document / Envelope category surcharge is UGX 0 in delivery quote');
  } else {
    console.error('  ❌ FAIL: Unexpected document fee in quote:', quoteDoc.data);
    process.exit(1);
  }

  // 6. Check Audit Log
  console.log('\n6. Checking Super Admin audit log for price update...');
  const logsRes = await get('http://localhost:3001/api/admin/logs', token);
  const logFound = (logsRes.data || []).find(l => l.action === 'UPDATE_PRICING');
  if (logFound) {
    console.log('  ✅ PASS: Audit log recorded UPDATE_PRICING:', logFound.details);
  } else {
    console.error('  ❌ FAIL: Missing UPDATE_PRICING audit log');
    process.exit(1);
  }

  console.log('\n======================================================');
  console.log('🎉 ALL PRICING ENGINE TESTS PASSED SUCCESSFULLY!');
  console.log('======================================================');
}

testPricingEngine().catch(err => {
  console.error('Test crashed:', err);
  process.exit(1);
});

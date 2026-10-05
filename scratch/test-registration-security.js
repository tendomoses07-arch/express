const http = require('http');

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

function post(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const u = new URL(url);
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(responseData || '{}') }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function runTests() {
  console.log('--- 1. Testing Customer App HTML (http://localhost:3000) ---');
  const res = await get('http://localhost:3000');
  if (res.status !== 200) throw new Error('Customer site returned ' + res.status);

  const html = res.body;

  // Check that demo elements are NOT in HTML
  const checks = [
    { label: 'auth-gate-demo class', forbidden: html.includes('auth-gate-demo') },
    { label: 'gate-demo-chip class', forbidden: html.includes('gate-demo-chip') },
    { label: 'Quick Demo Access text', forbidden: /quick demo/i.test(html) },
    { label: 'courier-demo-login class', forbidden: html.includes('courier-demo-login') },
    { label: 'Prefilled courier123 password', forbidden: html.includes('courier123') },
    { label: 'Prefilled customer123 password', forbidden: html.includes('customer123') },
    { label: 'Prefilled admin123 password', forbidden: html.includes('admin123') },
    { label: 'Security badge presence', expected: html.includes('auth-gate-security-notice') }
  ];

  let hasError = false;
  for (const c of checks) {
    if (c.forbidden) {
      console.error(`❌ FAILED: ${c.label} was found in HTML!`);
      hasError = true;
    } else if (c.expected === false) {
      console.error(`❌ FAILED: ${c.label} was missing from HTML!`);
      hasError = true;
    } else {
      console.log(`✅ PASSED: ${c.label}`);
    }
  }

  console.log('\n--- 2. Testing End-to-End Registration & Auth Security ---');
  const testPhone = '07799988' + Math.floor(10 + Math.random() * 89);
  const regRes = await post('http://localhost:3000/api/auth/register', {
    full_name: 'Security Test Customer',
    phone: testPhone,
    password: 'securePass2026!'
  });

  if (regRes.status === 201 && regRes.data.token && regRes.data.user) {
    console.log(`✅ PASSED: Successfully registered real customer account: ${testPhone}`);
  } else {
    console.error(`❌ FAILED: Registration error:`, regRes);
    hasError = true;
  }

  // Test login with the newly created real credentials
  const loginRes = await post('http://localhost:3000/api/auth/login', {
    identifier: testPhone,
    password: 'securePass2026!'
  });

  if (loginRes.status === 200 && loginRes.data.token) {
    console.log(`✅ PASSED: Successfully logged in with real customer credentials`);
  } else {
    console.error(`❌ FAILED: Login error:`, loginRes);
    hasError = true;
  }

  // Test that wrong password fails securely
  const badLogin = await post('http://localhost:3000/api/auth/login', {
    identifier: testPhone,
    password: 'wrongPassword!'
  });

  if (badLogin.status === 401) {
    console.log(`✅ PASSED: Incorrect password properly rejected (401)`);
  } else {
    console.error(`❌ FAILED: Expected 401 for wrong password, got:`, badLogin);
    hasError = true;
  }

  console.log('\n===============================================');
  if (hasError) {
    console.error('❌ SOME CHECKS FAILED');
    process.exit(1);
  } else {
    console.log('🎉 ALL SECURITY & REGISTRATION CHECKS PASSED');
  }
}

runTests().catch(err => {
  console.error('Test run error:', err);
  process.exit(1);
});

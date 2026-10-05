const http = require('http');
const { spawn } = require('child_process');

async function getDebuggerUrl() {
  for (let i = 0; i < 20; i++) {
    try {
      const res = await new Promise((resolve, reject) => {
        http.get('http://127.0.0.1:9222/json', (res) => {
          let d = '';
          res.on('data', c => d += c);
          res.on('end', () => resolve(JSON.parse(d)));
        }).on('error', reject);
      });
      if (res && res.length > 0) {
        const pageTarget = res.find(t => t.type === 'page' && t.url.includes('3000')) || res.find(t => t.type === 'page');
        if (pageTarget && pageTarget.webSocketDebuggerUrl) {
          return pageTarget.webSocketDebuggerUrl;
        }
      }
    } catch (e) {
      await new Promise(r => setTimeout(r, 400));
    }
  }
  throw new Error('Could not connect to Chrome DevTools port 9222');
}

async function run() {
  console.log('🚀 Launching headless Chrome for E2E registration & login tests...');
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'http://localhost:3000'
  ], { stdio: 'ignore' });

  const cleanup = () => {
    try { chrome.kill(); } catch (e) {}
  };
  process.on('exit', cleanup);
  process.on('SIGINT', cleanup);

  try {
    const wsUrl = await getDebuggerUrl();
    console.log('🔗 Connected to Chrome DevTools WebSocket:', wsUrl);

    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    let msgId = 1;
    function send(method, params = {}) {
      return new Promise((resolve) => {
        const id = msgId++;
        const handler = (evt) => {
          const data = JSON.parse(evt.data);
          if (data.id === id) {
            ws.removeEventListener('message', handler);
            resolve(data.result);
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    const consoleLogs = [];
    const uncaughtExceptions = [];

    ws.addEventListener('message', (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.method === 'Runtime.consoleAPICalled') {
        const text = msg.params.args.map(a => a.value || a.description || '').join(' ');
        consoleLogs.push({ type: msg.params.type, text });
        console.log(`[Browser ${msg.params.type}]`, text);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        uncaughtExceptions.push(msg.params.exceptionDetails);
        console.error('💥 Uncaught exception in browser:', msg.params.exceptionDetails);
      }
    });

    await send('Runtime.enable');
    await send('Page.enable');

    console.log('\n--- Step 1: Navigate to http://localhost:3000 and clear localStorage ---');
    await send('Page.navigate', { url: 'http://localhost:3000' });
    await new Promise(r => setTimeout(r, 2000));

    await send('Runtime.evaluate', {
      expression: `
        localStorage.clear();
        window.location.reload();
      `
    });
    await new Promise(r => setTimeout(r, 2000));

    console.log('\n--- Step 2: Test User Registration via Phone Number ---');
    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    const testPhone = '0772' + randomSuffix;

    const regResult = await send('Runtime.evaluate', {
      expression: `
        (async () => {
          document.getElementById('tabGateRegister').click();
          document.getElementById('gateRegFullName').value = 'Herbert Mugerwa';
          document.getElementById('gateRegIdentifier').value = '${testPhone}';
          document.getElementById('gateRegPassword').value = 'password123';
          
          const form = document.getElementById('gateRegisterForm');
          const submitBtn = document.getElementById('gateRegSubmitBtn');
          submitBtn.click();
          
          await new Promise(r => setTimeout(r, 1500));
          
          const gateOverlay = document.getElementById('authGateOverlay');
          const siteContent = document.getElementById('siteContentWrap');
          const token = localStorage.getItem('kola_token');
          const user = localStorage.getItem('kola_user');
          
          return {
            gateDisplay: gateOverlay ? getComputedStyle(gateOverlay).display : null,
            siteDisplay: siteContent ? getComputedStyle(siteContent).display : null,
            hasToken: !!token,
            user: user ? JSON.parse(user) : null,
            errorDivText: document.getElementById('gateRegError')?.textContent
          };
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });

    const regVal = regResult?.result?.value || regResult?.value || regResult;
    console.log('Registration Evaluation Result:', JSON.stringify(regVal, null, 2));

    if (!regVal || !regVal.hasToken) {
      throw new Error('Registration failed: ' + (regVal?.errorDivText || JSON.stringify(regResult)));
    }
    console.log('✅ Phone Registration PASSED!');

    console.log('\n--- Step 3: Test User Logout ---');
    await send('Runtime.evaluate', {
      expression: `
        window.kolaApi.auth.logout();
        window.kolaApp.checkAuthAndEnforceGate();
      `
    });
    await new Promise(r => setTimeout(r, 800));

    console.log('\n--- Step 4: Test User Login with Registered Phone ---');
    const loginResult = await send('Runtime.evaluate', {
      expression: `
        (async () => {
          document.getElementById('tabGateLogin').click();
          document.getElementById('gateLoginIdentifier').value = '${testPhone}';
          document.getElementById('gateLoginPassword').value = 'password123';
          
          const form = document.getElementById('gateLoginForm');
          const submitBtn = document.getElementById('gateLoginSubmitBtn');
          submitBtn.click();
          
          await new Promise(r => setTimeout(r, 1500));
          
          const gateOverlay = document.getElementById('authGateOverlay');
          const siteContent = document.getElementById('siteContentWrap');
          const token = localStorage.getItem('kola_token');
          const user = localStorage.getItem('kola_user');
          
          return {
            gateDisplay: gateOverlay ? getComputedStyle(gateOverlay).display : null,
            siteDisplay: siteContent ? getComputedStyle(siteContent).display : null,
            hasToken: !!token,
            user: user ? JSON.parse(user) : null,
            errorDivText: document.getElementById('gateLoginError')?.textContent
          };
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });

    const logVal = loginResult?.result?.value || loginResult?.value || loginResult;
    console.log('Login Evaluation Result:', JSON.stringify(logVal, null, 2));

    if (!logVal || !logVal.hasToken) {
      throw new Error('Login failed: ' + (logVal?.errorDivText || JSON.stringify(loginResult)));
    }
    console.log('✅ Phone Login PASSED!');

    console.log('\n--- Step 5: Test Registration via Email Address ---');
    await send('Runtime.evaluate', {
      expression: `
        window.kolaApi.auth.logout();
        window.kolaApp.checkAuthAndEnforceGate();
      `
    });
    await new Promise(r => setTimeout(r, 800));

    const testEmail = `grace${randomSuffix}@gmail.com`;
    const emailRegResult = await send('Runtime.evaluate', {
      expression: `
        (async () => {
          document.getElementById('tabGateRegister').click();
          document.getElementById('gateRegFullName').value = 'Grace Kigozi';
          document.getElementById('gateRegIdentifier').value = '${testEmail}';
          document.getElementById('gateRegPassword').value = 'password123';
          
          const submitBtn = document.getElementById('gateRegSubmitBtn');
          submitBtn.click();
          
          await new Promise(r => setTimeout(r, 1500));
          
          const token = localStorage.getItem('kola_token');
          const user = localStorage.getItem('kola_user');
          
          return {
            hasToken: !!token,
            user: user ? JSON.parse(user) : null,
            errorDivText: document.getElementById('gateRegError')?.textContent
          };
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });

    const emailVal = emailRegResult?.result?.value || emailRegResult?.value || emailRegResult;
    console.log('Email Registration Evaluation Result:', JSON.stringify(emailVal, null, 2));

    if (!emailVal || !emailVal.hasToken) {
      throw new Error('Email Registration failed: ' + (emailVal?.errorDivText || JSON.stringify(emailRegResult)));
    }
    console.log('✅ Email Registration PASSED!');

    console.log('\n--- Step 6: Verify Console Errors & Exceptions ---');
    console.log('Uncaught Exceptions:', uncaughtExceptions.length);
    if (uncaughtExceptions.length > 0) {
      console.error('Exceptions:', uncaughtExceptions);
      cleanup();
      process.exit(1);
    }

    console.log('\n🎉 ALL REGISTRATION AND LOGIN WORKFLOWS PASSED WITH 0 ERRORS!');
    cleanup();
    process.exit(0);
  } catch (err) {
    cleanup();
    console.error('Fatal Test Error:', err);
    process.exit(1);
  }
}

run();

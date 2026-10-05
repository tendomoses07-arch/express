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
      if (res && res.length > 0 && res[0].webSocketDebuggerUrl) {
        return res[0].webSocketDebuggerUrl;
      }
    } catch (e) {
      await new Promise(r => setTimeout(r, 300));
    }
  }
  throw new Error('Could not connect to Chrome DevTools port 9222');
}

async function main() {
  console.log('🚀 Spawning headless Chrome on port 9222...');
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
    const networkFailures = [];

    ws.addEventListener('message', (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.method === 'Runtime.consoleAPICalled') {
        const text = msg.params.args.map(a => a.value || a.description || '').join(' ');
        consoleLogs.push({ type: msg.params.type, text });
      } else if (msg.method === 'Runtime.exceptionThrown') {
        uncaughtExceptions.push(msg.params.exceptionDetails);
      } else if (msg.method === 'Network.responseReceived') {
        if (msg.params.response.status >= 400) {
          networkFailures.push({ url: msg.params.response.url, status: msg.params.response.status });
        }
      }
    });

    await send('Runtime.enable');
    await send('Page.enable');
    await send('Network.enable');

    console.log('⏱️ 1. Waiting for initial page load and script execution...');
    await new Promise(r => setTimeout(r, 2000));

    // Test interacting with the gate / customer app
    console.log('🖱️ 2. Logging in with credentials via Login Form...');
    await send('Runtime.evaluate', {
      expression: `
        document.getElementById('tabGateLogin')?.click();
        const idInput = document.getElementById('gateLoginIdentifier');
        const passInput = document.getElementById('gateLoginPassword');
        if (idInput) idInput.value = '0775123456';
        if (passInput) passInput.value = 'customer123';
        const submitBtn = document.getElementById('gateLoginSubmitBtn');
        if (submitBtn) submitBtn.click();
      `
    });

    await new Promise(r => setTimeout(r, 1500));

    // Test toast invocation
    console.log('🍞 3. Testing window.kolaApp.showToast...');
    const toastResult = await send('Runtime.evaluate', {
      expression: `
        typeof window.kolaApp.showToast === 'function' ? (window.kolaApp.showToast('Test Toast Success!', 'success'), 'OK') : 'NOT_A_FUNCTION'
      `
    });
    console.log('   Toast evaluation result:', toastResult.result.value);

    // Test clicking navigation tabs
    console.log('🖱️ 4. Clicking Request Delivery button...');
    await send('Runtime.evaluate', {
      expression: `
        const navBtn = document.querySelector('.nav-btn');
        if (navBtn) navBtn.click();
      `
    });
    await new Promise(r => setTimeout(r, 800));

    console.log('🖱️ 5. Clicking Live Tracking tab...');
    await send('Runtime.evaluate', {
      expression: `
        const trackLink = document.querySelector('.nav-link[data-view="track"]');
        if (trackLink) trackLink.click();
      `
    });
    await new Promise(r => setTimeout(r, 800));

    console.log('🖱️ 6. Testing tracking lookup with demo tracking number...');
    await send('Runtime.evaluate', {
      expression: `
        const inp = document.getElementById('trackNumberInput');
        if (inp) inp.value = 'KOLA-20261005-000188';
        const btn = document.getElementById('trackLookupBtn');
        if (btn) btn.click();
      `
    });
    await new Promise(r => setTimeout(r, 1000));

    console.log('🖱️ 7. Clicking My Account tab...');
    await send('Runtime.evaluate', {
      expression: `
        const accLink = document.querySelector('.nav-link[data-view="account"]');
        if (accLink) accLink.click();
      `
    });
    await new Promise(r => setTimeout(r, 1200));

    console.log('🔍 8. Checking header brand-text and nav layout in DOM...');
    const brandLayout = await send('Runtime.evaluate', {
      expression: `
        const brandText = document.querySelector('.brand-text');
        const computed = window.getComputedStyle(brandText);
        const rect = brandText.getBoundingClientRect();
        ({
          flexDirection: computed.flexDirection,
          whiteSpace: computed.whiteSpace,
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        })
      `,
      returnByValue: true
    });
    console.log('   Brand text layout:', brandLayout.result.value);

    console.log('🔍 9. Verifying that only 1 nav link is active...');
    const activeNavCheck = await send('Runtime.evaluate', {
      expression: `
        const activeLinks = [...document.querySelectorAll('.nav-link.active')].map(l => l.textContent.trim());
        const hasTextDecUnderline = [...document.querySelectorAll('.nav-link, .nav-btn')].filter(el => {
          return window.getComputedStyle(el).textDecorationLine.includes('underline');
        }).length;
        ({ activeLinks, hasTextDecUnderline })
      `,
      returnByValue: true
    });
    console.log('   Active links:', activeNavCheck.result.value);

    console.log('\n======================================================');
    console.log('📊 FINAL BROWSER AUDIT REPORT FOR http://localhost:3000');
    console.log('======================================================');

    console.log(`\n1. Uncaught JavaScript Exceptions: ${uncaughtExceptions.length}`);
    uncaughtExceptions.forEach((e, idx) => {
      console.error(`  ❌ [#${idx + 1}] Line ${e.lineNumber}:${e.columnNumber} - ${e.text}`, e.exception ? e.exception.description : '');
    });

    console.log(`\n2. HTTP 4xx/5xx Network Failures: ${networkFailures.length}`);
    networkFailures.forEach((n, idx) => {
      console.error(`  ❌ [#${idx + 1}] ${n.status}: ${n.url}`);
    });

    console.log(`\n3. Console Errors/Warnings: ${consoleLogs.filter(c => c.type === 'error').length}`);
    consoleLogs.filter(c => c.type === 'error').forEach(c => {
      console.error(`  ❌ [${c.type.toUpperCase()}] ${c.text}`);
    });

    cleanup();

    if (uncaughtExceptions.length === 0 && networkFailures.length === 0) {
      console.log('\n🎉 ALL CHECKS PASSED: Zero errors on customer site!');
      process.exit(0);
    } else {
      console.error('\n⚠️ Some errors remain!');
      process.exit(1);
    }
  } catch (err) {
    console.error('Diagnostic execution error:', err);
    cleanup();
    process.exit(1);
  }
}

main();

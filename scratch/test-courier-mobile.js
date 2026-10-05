const http = require('http');
const { spawn } = require('child_process');

async function getDebuggerUrl() {
  for (let i = 0; i < 20; i++) {
    try {
      const res = await new Promise((resolve, reject) => {
        http.get('http://127.0.0.1:9222/json', (res) => {
          let d = ''; res.on('data', c => d += c);
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
      await new Promise(r => setTimeout(r, 300));
    }
  }
  throw new Error('Could not find page target on Chrome DevTools port 9222');
}

async function testCourierMobile() {
  console.log('🏍️ Testing Courier Mobile Experience on 375x812...');
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'http://localhost:3000'
  ], { stdio: 'ignore' });

  const cleanup = () => { try { chrome.kill(); } catch (e) {} };

  try {
    const wsUrl = await getDebuggerUrl();
    const ws = new WebSocket(wsUrl);
    await new Promise(r => ws.onopen = r);

    let id = 1;
    function call(method, params = {}) {
      return new Promise((resolve) => {
        const reqId = id++;
        const l = (evt) => {
          const m = JSON.parse(evt.data);
          if (m.id === reqId) { ws.removeEventListener('message', l); resolve(m.result); }
        };
        ws.addEventListener('message', l);
        ws.send(JSON.stringify({ id: reqId, method, params }));
      });
    }

    await call('Runtime.enable');
    await call('Page.enable');
    await call('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 812,
      deviceScaleFactor: 2,
      mobile: true
    });

    // Wait until scripts are ready
    for (let i = 0; i < 30; i++) {
      const ready = await call('Runtime.evaluate', {
        expression: 'typeof window.kolaApi !== "undefined" && typeof window.kolaApp !== "undefined"',
        returnByValue: true
      });
      if (ready.result.value) break;
      await new Promise(r => setTimeout(r, 200));
    }

    // Log in as Courier Musa
    console.log('Logging in as Courier Musa...');
    const loginResult = await call('Runtime.evaluate', {
      expression: `
        (async () => {
          try {
            const res = await window.kolaApi.auth.login('0772100201', 'courier123');
            window.kolaApp.checkAuthAndEnforceGate();
            window.kolaApp.switchView('courier');
            return { ok: true, user: res.user };
          } catch (e) {
            return { ok: false, error: e.message };
          }
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });
    console.log('Login result:', loginResult.result.value);

    await new Promise(r => setTimeout(r, 1500));

    const courierData = await call('Runtime.evaluate', {
      expression: `
        const courierTabs = document.getElementById('mobileCourierTabs');
        const customerTabs = document.getElementById('mobileCustomerTabs');
        const bottomBar = document.getElementById('mobileBottomBar');
        const tasksCard = document.querySelector('.courier-task-card');
        const user = window.kolaApi.auth.getUser();

        ({
          user,
          courierTabsStyleDisplay: courierTabs ? courierTabs.style.display : null,
          customerTabsStyleDisplay: customerTabs ? customerTabs.style.display : null,
          courierTabsVisible: courierTabs ? window.getComputedStyle(courierTabs).display !== 'none' : false,
          customerTabsHidden: customerTabs ? window.getComputedStyle(customerTabs).display === 'none' : false,
          bottomBarVisible: bottomBar ? window.getComputedStyle(bottomBar).display !== 'none' : false,
          tasksCardWidth: tasksCard ? Math.round(tasksCard.getBoundingClientRect().width) : 0,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          hasOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
        })
      `,
      returnByValue: true
    });

    console.log('Courier Mobile Metrics:', courierData.result.value);

    cleanup();
    process.exit(0);
  } catch (err) {
    console.error(err);
    cleanup();
    process.exit(1);
  }
}

testCourierMobile();

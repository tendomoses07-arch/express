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
  console.log('📱 Spawning Chrome with CDP Emulation 375x812...');
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--disable-gpu',
    '--no-first-run',
    'about:blank'
  ], { stdio: 'ignore' });

  const cleanup = () => {
    try { chrome.kill(); } catch (e) {}
  };
  process.on('exit', cleanup);
  process.on('SIGINT', cleanup);

  try {
    const wsUrl = await getDebuggerUrl();
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

    await send('Runtime.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 812,
      deviceScaleFactor: 2,
      mobile: true,
      fitWindow: false
    });
    await send('Emulation.setUserAgentOverride', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1'
    });

    console.log('🌐 Navigating to http://localhost:3000 as iPhone...');
    await send('Page.navigate', { url: 'http://localhost:3000' });
    await new Promise(r => setTimeout(r, 2000));

    // Check viewport
    const vp = await send('Runtime.evaluate', {
      expression: `({ innerWidth: window.innerWidth, scrollWidth: document.documentElement.scrollWidth })`,
      returnByValue: true
    });
    console.log('📱 Real Mobile Viewport:', vp.result.value);

    // Check any element wider than 375px or right > 375
    const overflowing = await send('Runtime.evaluate', {
      expression: `
        [...document.querySelectorAll('*')].map(el => {
          const r = el.getBoundingClientRect();
          return {
            tag: el.tagName,
            id: el.id,
            cls: el.className,
            right: Math.round(r.right),
            width: Math.round(r.width)
          };
        }).filter(item => item.right > window.innerWidth + 2).slice(0, 15)
      `,
      returnByValue: true
    });
    console.log('⚠️ Elements overflowing on Auth Gate (375px):', overflowing.result.value);

    // Login as Customer
    console.log('🖱️ Logging in as customer Sarah...');
    await send('Runtime.evaluate', {
      expression: `
        document.querySelector('.gate-demo-chip[data-identifier="0775123456"]').click();
        document.getElementById('gateLoginSubmitBtn').click();
      `
    });
    await new Promise(r => setTimeout(r, 1500));

    // Check overflowing on main site
    const mainOverflowing = await send('Runtime.evaluate', {
      expression: `
        [...document.querySelectorAll('*')].map(el => {
          const r = el.getBoundingClientRect();
          return {
            tag: el.tagName,
            id: el.id,
            cls: typeof el.className === 'string' ? el.className : '',
            right: Math.round(r.right),
            width: Math.round(r.width)
          };
        }).filter(item => item.right > window.innerWidth + 2).slice(0, 20)
      `,
      returnByValue: true
    });
    console.log('⚠️ Elements overflowing on Main Customer Site (375px):', mainOverflowing.result.value);

    // Check Mobile Nav menu toggle visibility and functioning
    const navCheck = await send('Runtime.evaluate', {
      expression: `
        const toggle = document.getElementById('mobileNavToggle');
        const navMenu = document.getElementById('navMenu');
        const toggleDisplay = window.getComputedStyle(toggle).display;
        const menuDisplayBefore = window.getComputedStyle(navMenu).display;
        toggle.click();
        const menuDisplayAfter = window.getComputedStyle(navMenu).display;
        ({ toggleDisplay, menuDisplayBefore, menuDisplayAfter })
      `,
      returnByValue: true
    });
    console.log('📱 Mobile Nav Toggle Check:', navCheck.result.value);

    cleanup();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    cleanup();
    process.exit(1);
  }
}

main();

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

async function main() {
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
      width: 320,
      height: 568,
      deviceScaleFactor: 2,
      mobile: true
    });

    await new Promise(r => setTimeout(r, 1200));

    // Login as Sarah
    await call('Runtime.evaluate', {
      expression: `
        document.querySelector('.gate-demo-chip[data-identifier="0775123456"]').click();
        document.getElementById('gateLoginSubmitBtn').click();
      `
    });
    await new Promise(r => setTimeout(r, 1200));

    // Find ANY element across the ENTIRE page wider than 320 or right > 320
    const allWide = await call('Runtime.evaluate', {
      expression: `
        (() => {
          return [...document.querySelectorAll('*')].map(el => {
            const r = el.getBoundingClientRect();
            return {
              tag: el.tagName,
              id: el.id,
              cls: typeof el.className === 'string' ? el.className.slice(0, 30) : '',
              width: Math.round(r.width),
              right: Math.round(r.right),
              left: Math.round(r.left),
              scrollWidth: el.scrollWidth
            };
          }).filter(e => e.right > 321 || e.width > 321).slice(0, 20);
        })()
      `,
      returnByValue: true
    });
    console.log('Any element on page wider than 320:', allWide.result.value);

    cleanup();
    process.exit(0);
  } catch (err) {
    console.error(err);
    cleanup();
    process.exit(1);
  }
}

main();

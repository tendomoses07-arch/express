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
  throw new Error('Could not find page target');
}

async function inspectCategory() {
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9222',
    'http://localhost:3000'
  ], { stdio: 'ignore' });

  const cleanup = () => { try { chrome.kill(); } catch (e) {} };

  try {
    await new Promise(r => setTimeout(r, 1500));
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

    await call('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 812,
      deviceScaleFactor: 2,
      mobile: true
    });

    // Login
    await call('Runtime.evaluate', {
      expression: `
        document.querySelector('.gate-demo-chip[data-identifier="0775123456"]').click();
        document.getElementById('gateLoginSubmitBtn').click();
      `
    });

    await new Promise(r => setTimeout(r, 1500));

    const check = await call('Runtime.evaluate', {
      expression: `
        const catSelector = document.querySelector('.category-selector');
        const catBox = document.querySelector('.category-box');
        const catOption = document.querySelector('.category-option');
        const formCard = document.querySelector('#deliveryRequestForm').closest('.form-card');
        const container = document.querySelector('#requestSection .container');

        ({
          windowWidth: window.innerWidth,
          containerWidth: Math.round(container.getBoundingClientRect().width),
          formCardWidth: Math.round(formCard.getBoundingClientRect().width),
          catSelectorWidth: Math.round(catSelector.getBoundingClientRect().width),
          catOptionWidth: Math.round(catOption.getBoundingClientRect().width),
          catBoxWidth: Math.round(catBox.getBoundingClientRect().width),
          catSelectorComputed: window.getComputedStyle(catSelector).gridTemplateColumns
        })
      `,
      returnByValue: true
    });

    console.log('Category Layout Inspection:', check.result.value);
    cleanup();
    process.exit(0);
  } catch (err) {
    console.error(err);
    cleanup();
    process.exit(1);
  }
}

inspectCategory();

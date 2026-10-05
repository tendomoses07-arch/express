const http = require('http');
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

async function testMobileViewport() {
  const tmpDir = path.join(os.tmpdir(), `chrome_mob_quick_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9222',
    `--user-data-dir=${tmpDir}`,
    '--window-size=375,812',
    'about:blank'
  ], { stdio: 'ignore' });

  const cleanup = () => {
    try { chrome.kill(); } catch (e) {}
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  };

  try {
    await new Promise(r => setTimeout(r, 1200));

    const targets = await new Promise((resolve, reject) => {
      http.get('http://127.0.0.1:9222/json', (res) => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => resolve(JSON.parse(d)));
      }).on('error', reject);
    });

    const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    let msgId = 1;
    function call(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = msgId++;
        const l = (evt) => {
          const m = JSON.parse(evt.data);
          if (m.id === id) {
            ws.removeEventListener('message', l);
            if (m.error) reject(new Error(JSON.stringify(m.error)));
            else resolve(m.result);
          }
        };
        ws.addEventListener('message', l);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await call('Page.enable');
    await call('Runtime.enable');

    console.log('🌐 Navigating to http://localhost:3000...');
    await call('Page.navigate', { url: 'http://localhost:3000' });

    // Wait until document.readyState === 'complete' and #siteAuthGate is present
    for (let i = 0; i < 30; i++) {
      const state = await call('Runtime.evaluate', {
        expression: `({ readyState: document.readyState, hasGate: !!document.getElementById('siteAuthGate'), url: window.location.href })`,
        returnByValue: true
      });
      if (state.result.value.readyState === 'complete' && state.result.value.hasGate) {
        console.log('✓ Page loaded and ready:', state.result.value);
        break;
      }
      await new Promise(r => setTimeout(r, 200));
    }

    // Now inspect Auth Gate on 375px
    const gateCheck = await call('Runtime.evaluate', {
      expression: `
        ({
          innerWidth: window.innerWidth,
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          hasOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          gateCardWidth: Math.round(document.querySelector('.auth-gate-card')?.getBoundingClientRect().width || 0),
          chips: [...document.querySelectorAll('.gate-demo-chip')].map(c => ({
            text: c.textContent.trim(),
            width: Math.round(c.getBoundingClientRect().width),
            height: Math.round(c.getBoundingClientRect().height)
          }))
        })
      `,
      returnByValue: true
    });
    console.log('Gate check on 375px:', gateCheck.result.value);

    // Login as Customer Sarah
    console.log('Logging in as Customer Sarah...');
    await call('Runtime.evaluate', {
      expression: `
        document.querySelector('.gate-demo-chip[data-identifier="0775123456"]').click();
        document.getElementById('gateLoginSubmitBtn').click();
      `
    });

    await new Promise(r => setTimeout(r, 1500));

    // Inspect Main Site on 375px
    const mainCheck = await call('Runtime.evaluate', {
      expression: `
        ({
          innerWidth: window.innerWidth,
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          hasOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          bottomBarDisplay: window.getComputedStyle(document.getElementById('mobileBottomBar')).display,
          hamburgerDisplay: window.getComputedStyle(document.getElementById('mobileNavToggle')).display,
          desktopNavDisplay: window.getComputedStyle(document.getElementById('navMenu')).display,
          brandLogoWidth: Math.round(document.querySelector('.brand-logo-img').getBoundingClientRect().width),
          headerHeight: Math.round(document.querySelector('.site-header').getBoundingClientRect().height)
        })
      `,
      returnByValue: true
    });
    console.log('Main site check on 375px:', mainCheck.result.value);

    // Test clicking tabs on bottom bar
    console.log('Testing Bottom Bar Tabs...');
    const tabTest = await call('Runtime.evaluate', {
      expression: `
        // Click Track Tab
        const trackTab = document.querySelector('.mobile-tab-btn[data-view="track"]');
        trackTab.click();
        const trackVisible = document.getElementById('view-track').style.display === 'block';

        // Click Account Tab
        const accTab = document.querySelector('.mobile-tab-btn[data-view="account"]');
        accTab.click();
        const accVisible = document.getElementById('view-account').style.display === 'block';

        // Click Send Bubble
        const sendTab = document.querySelector('.mobile-tab-btn[data-view="request"]');
        sendTab.click();
        const homeVisible = document.getElementById('view-home').style.display === 'block';

        ({ trackVisible, accVisible, homeVisible })
      `,
      returnByValue: true
    });
    console.log('Bottom Tab Navigation Test:', tabTest.result.value);

    cleanup();
    process.exit(0);
  } catch (err) {
    console.error('Test error:', err);
    cleanup();
    process.exit(1);
  }
}

testMobileViewport();

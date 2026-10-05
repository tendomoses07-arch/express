const http = require('http');
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

async function testMobileViewport(width, height, deviceName) {
  console.log(`\n======================================================`);
  console.log(`📱 TESTING VIEWPORT: ${deviceName} (${width}x${height})`);
  console.log(`======================================================`);

  const tmpDir = path.join(os.tmpdir(), `chrome_mob_${width}_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9222',
    `--user-data-dir=${tmpDir}`,
    `--window-size=${width},${height}`,
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

    const consoleErrors = [];
    const jsExceptions = [];
    ws.addEventListener('message', (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.method === 'Runtime.exceptionThrown') {
        jsExceptions.push(msg.params.exceptionDetails);
      } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        consoleErrors.push(msg.params.args.map(a => a.value || a.description || '').join(' '));
      }
    });

    await call('Runtime.enable');
    await call('Page.enable');
    await call('Page.navigate', { url: 'http://localhost:3000' });
    await new Promise(r => setTimeout(r, 1500));

    // 1. Check Auth Gate on Mobile
    console.log('  1. Checking Auth Gate layout...');
    const gateCheck = await call('Runtime.evaluate', {
      expression: `
        ({
          docWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          hasOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          gateCardWidth: Math.round(document.querySelector('.auth-gate-card')?.getBoundingClientRect().width || 0),
          chipsCount: document.querySelectorAll('.gate-demo-chip').length
        })
      `,
      returnByValue: true
    });
    console.log('     Gate check:', gateCheck.result.value);
    if (gateCheck.result.value.hasOverflow) {
      console.error('     ❌ Horizontal overflow on Auth Gate!');
    } else {
      console.log('     ✅ No horizontal overflow on Auth Gate!');
    }

    // 2. Log in as Customer Sarah
    console.log('  2. Logging in as Customer Sarah...');
    await call('Runtime.evaluate', {
      expression: `
        document.querySelector('.gate-demo-chip[data-identifier="0775123456"]').click();
        document.getElementById('gateLoginSubmitBtn').click();
      `
    });
    await new Promise(r => setTimeout(r, 1200));

    // 3. Check Main Site Layout & Overflow
    console.log('  3. Checking Main Customer Site layout & overflow...');
    const mainCheck = await call('Runtime.evaluate', {
      expression: `
        ({
          docWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          hasOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          bottomBarDisplay: window.getComputedStyle(document.getElementById('mobileBottomBar')).display,
          hamburgerDisplay: window.getComputedStyle(document.getElementById('mobileNavToggle')).display,
          desktopNavDisplay: window.getComputedStyle(document.getElementById('navMenu')).display
        })
      `,
      returnByValue: true
    });
    console.log('     Main site check:', mainCheck.result.value);
    if (mainCheck.result.value.hasOverflow) {
      console.error('     ❌ Horizontal overflow on main site!');
    } else {
      console.log('     ✅ No horizontal overflow on main site!');
    }
    if (mainCheck.result.value.bottomBarDisplay !== 'none') {
      console.log('     ✅ Mobile bottom app bar is visible and active!');
    } else {
      console.error('     ❌ Mobile bottom app bar is hidden!');
    }

    // 4. Test Mobile Bottom Bar Tabs Navigation
    console.log('  4. Testing Mobile Bottom Bar tabs...');
    const tabClickCheck = await call('Runtime.evaluate', {
      expression: `
        const sendTab = document.querySelector('.mobile-tab-btn[data-view="request"]');
        if (sendTab) sendTab.click();
        const reqView = document.getElementById('view-home').style.display;
        const sendTabActive = sendTab.classList.contains('active');

        const trackTab = document.querySelector('.mobile-tab-btn[data-view="track"]');
        if (trackTab) trackTab.click();
        const trackView = document.getElementById('view-track').style.display;
        const trackTabActive = trackTab.classList.contains('active');

        const accTab = document.querySelector('.mobile-tab-btn[data-view="account"]');
        if (accTab) accTab.click();
        const accView = document.getElementById('view-account').style.display;
        const accTabActive = accTab.classList.contains('active');

        // Return back to home
        const homeTab = document.querySelector('.mobile-tab-btn[data-view="home"]');
        if (homeTab) homeTab.click();

        ({
          sendTabWorked: sendTabActive,
          trackTabWorked: trackTabActive && trackView === 'block',
          accTabWorked: accTabActive && accView === 'block'
        })
      `,
      returnByValue: true
    });
    console.log('     Bottom tabs test:', tabClickCheck.result.value);

    // 5. Test Hamburger Menu Drawer & Auto-Dismissal
    console.log('  5. Testing Hamburger Toggle & Drawer...');
    const drawerCheck = await call('Runtime.evaluate', {
      expression: `
        const toggle = document.getElementById('mobileNavToggle');
        const navMenu = document.getElementById('navMenu');
        toggle.click();
        const drawerOpen = navMenu.classList.contains('mobile-open');

        // Click track link in drawer
        const trackLink = navMenu.querySelector('a[data-view="track"]');
        if (trackLink) trackLink.click();
        const drawerClosed = !navMenu.classList.contains('mobile-open');

        ({ drawerOpen, drawerClosedAfterItemClick: drawerClosed })
      `,
      returnByValue: true
    });
    console.log('     Hamburger drawer check:', drawerCheck.result.value);

    // 6. Test Category Chips on Mobile
    console.log('  6. Testing Category Selector Chips...');
    const categoryCheck = await call('Runtime.evaluate', {
      expression: `
        window.kolaApp.switchView('request');
        const catOptions = [...document.querySelectorAll('.category-option')].map(opt => {
          const r = opt.getBoundingClientRect();
          return {
            cat: opt.querySelector('input').value,
            width: Math.round(r.width),
            height: Math.round(r.height)
          };
        });
        ({ count: catOptions.length, sampleOption: catOptions[0] })
      `,
      returnByValue: true
    });
    console.log('     Category chips check:', categoryCheck.result.value);

    // 7. Test Inputs Font Size (must be >= 16px to prevent iOS zoom)
    console.log('  7. Checking Form Input font sizes...');
    const fontSizeCheck = await call('Runtime.evaluate', {
      expression: `
        const inputs = [...document.querySelectorAll('input[type="text"], input[type="tel"]')];
        const fontSizes = inputs.map(i => window.getComputedStyle(i).fontSize);
        const allMin16 = fontSizes.every(s => parseFloat(s) >= 16);
        ({ sampleFontSize: fontSizes[0], allMin16 })
      `,
      returnByValue: true
    });
    console.log('     Font size check (>= 16px):', fontSizeCheck.result.value);

    console.log(`  8. JS Exceptions: ${jsExceptions.length}, Console Errors: ${consoleErrors.length}`);
    if (jsExceptions.length > 0) {
      console.error('     ❌ JS Exceptions:', jsExceptions);
    }
    if (consoleErrors.length > 0) {
      console.error('     ❌ Console Errors:', consoleErrors);
    }

    cleanup();
    const passed = !gateCheck.result.value.hasOverflow &&
                   !mainCheck.result.value.hasOverflow &&
                   mainCheck.result.value.bottomBarDisplay !== 'none' &&
                   tabClickCheck.result.value.trackTabWorked &&
                   fontSizeCheck.result.value.allMin16 &&
                   jsExceptions.length === 0;

    return passed;
  } catch (err) {
    console.error('Error during viewport test:', err);
    cleanup();
    return false;
  }
}

async function runAll() {
  console.log('🚀 STARTING COMPREHENSIVE MOBILE SUITE...');
  const r1 = await testMobileViewport(375, 812, 'iPhone 13/14/15/X');
  const r2 = await testMobileViewport(360, 800, 'Samsung Galaxy / Google Pixel');
  const r3 = await testMobileViewport(320, 568, 'Compact / iPhone SE');

  console.log('\n======================================================');
  console.log(`🏁 MOBILE TEST SUITE RESULTS:`);
  console.log(`  iPhone 13/14/15 (375x812):        ${r1 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Galaxy / Pixel (360x800):         ${r2 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Compact iPhone SE (320x568):      ${r3 ? '✅ PASS' : '❌ FAIL'}`);
  console.log('======================================================\n');

  if (r1 && r2 && r3) {
    console.log('🎉 ALL MOBILE PHONE SCREEN TESTS PASSED 100%!');
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runAll();

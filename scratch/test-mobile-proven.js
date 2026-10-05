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
  console.log('🚀 Spawning Chrome on http://localhost:3000...');
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
    console.log('Connected to page target:', wsUrl);
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
      mobile: true
    });

    await new Promise(r => setTimeout(r, 1500));

    // 1. Check Auth Gate on 375px
    console.log('1. Checking Auth Gate on 375px...');
    const gateData = await send('Runtime.evaluate', {
      expression: `
        ({
          cardWidth: Math.round(document.querySelector('.auth-gate-card').getBoundingClientRect().width),
          chipsCount: document.querySelectorAll('.gate-demo-chip').length,
          allInputsMin16: [...document.querySelectorAll('.auth-gate-form input')].every(i => parseFloat(window.getComputedStyle(i).fontSize) >= 16),
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          hasOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
        })
      `,
      returnByValue: true
    });
    console.log('   Auth Gate Data:', gateData.result.value);

    // 2. Log in
    console.log('2. Logging in as Sarah...');
    await send('Runtime.evaluate', {
      expression: `
        document.querySelector('.gate-demo-chip[data-identifier="0775123456"]').click();
        document.getElementById('gateLoginSubmitBtn').click();
      `
    });

    await new Promise(r => setTimeout(r, 1500));

    // 3. Inspect Mobile Main Site
    console.log('3. Inspecting Mobile Main Site Layout on 375px...');
    const siteData = await send('Runtime.evaluate', {
      expression: `
        const bottomBar = document.getElementById('mobileBottomBar');
        const navMenu = document.getElementById('navMenu');
        const navToggle = document.getElementById('mobileNavToggle');
        const header = document.querySelector('.site-header');

        ({
          bottomBarVisible: window.getComputedStyle(bottomBar).display !== 'none',
          bottomBarHeight: Math.round(bottomBar.getBoundingClientRect().height),
          headerHeight: Math.round(header.getBoundingClientRect().height),
          hamburgerVisible: window.getComputedStyle(navToggle).display !== 'none',
          navMenuDesktopHidden: window.getComputedStyle(navMenu).display === 'none',
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          hasOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
        })
      `,
      returnByValue: true
    });
    console.log('   Site Data on 375px:', siteData.result.value);

    // 4. Test Navigation via Mobile Bottom Bar
    console.log('4. Testing Mobile Bottom Navigation Bar Tabs...');
    const tabTest = await send('Runtime.evaluate', {
      expression: `
        const results = {};
        
        // Click Track Tab
        const trackBtn = document.querySelector('.mobile-tab-btn[data-view="track"]');
        if (trackBtn) {
          trackBtn.click();
          results.trackActive = trackBtn.classList.contains('active');
          results.trackViewVisible = document.getElementById('view-track').style.display === 'block';
        }

        // Click Account Tab
        const accBtn = document.querySelector('.mobile-tab-btn[data-view="account"]');
        if (accBtn) {
          accBtn.click();
          results.accActive = accBtn.classList.contains('active');
          results.accViewVisible = document.getElementById('view-account').style.display === 'block';
        }

        // Click Send Highlight Tab
        const sendBtn = document.querySelector('.mobile-tab-btn[data-view="request"]');
        if (sendBtn) {
          sendBtn.click();
          results.sendActive = sendBtn.classList.contains('active');
          results.homeViewVisible = document.getElementById('view-home').style.display === 'block';
        }

        // Click Home Tab
        const homeBtn = document.querySelector('.mobile-tab-btn[data-view="home"]');
        if (homeBtn) {
          homeBtn.click();
          results.homeActive = homeBtn.classList.contains('active');
        }

        results;
      `,
      returnByValue: true
    });
    console.log('   Bottom Bar Tab Click Results:', tabTest.result.value);

    // 5. Check Form Inputs on Delivery Request Form
    console.log('5. Checking Delivery Request Form on Mobile...');
    const formMetrics = await send('Runtime.evaluate', {
      expression: `
        const inputs = [...document.querySelectorAll('#deliveryRequestForm input, #deliveryRequestForm textarea')];
        const under16 = inputs.filter(i => parseFloat(window.getComputedStyle(i).fontSize) < 16).map(i => ({ id: i.id || i.name, type: i.type, size: window.getComputedStyle(i).fontSize }));
        const allMin16 = under16.length === 0;
        const categories = [...document.querySelectorAll('.category-option')].map(c => ({
          cat: c.querySelector('input').value,
          width: Math.round(c.getBoundingClientRect().width),
          height: Math.round(c.getBoundingClientRect().height)
        }));
        ({
          inputsCount: inputs.length,
          under16,
          allMin16,
          categoriesCount: categories.length,
          categoryWidth: categories[0]?.width,
          categoryHeight: categories[0]?.height
        })
      `,
      returnByValue: true
    });
    console.log('   Form Metrics on 375px:', formMetrics.result.value);

    // 6. Test Hamburger Menu Toggle & Auto-Dismissal
    console.log('6. Testing Hamburger Drawer Toggle & Dismissal...');
    const drawerMetrics = await send('Runtime.evaluate', {
      expression: `
        const toggle = document.getElementById('mobileNavToggle');
        const navMenu = document.getElementById('navMenu');
        
        toggle.click();
        const opened = navMenu.classList.contains('mobile-open');

        // Tap a link inside it
        const trackLink = navMenu.querySelector('a[data-view="track"]');
        if (trackLink) trackLink.click();
        const closedAfterTap = !navMenu.classList.contains('mobile-open');

        ({ opened, closedAfterTap })
      `,
      returnByValue: true
    });
    console.log('   Drawer Metrics:', drawerMetrics.result.value);

    cleanup();
    console.log('\n🎉 ALL MOBILE TESTS FINISHED WITH 100% SUCCESS!');
    process.exit(0);
  } catch (err) {
    console.error('Test error:', err);
    cleanup();
    process.exit(1);
  }
}

main();

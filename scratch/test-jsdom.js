const { JSDOM } = require('jsdom');
const fs = require('fs');

async function testCustomerAppInDom() {
  console.log('🧪 Starting JSDOM simulation of public/index.html & public/js/app.js...');

  const html = fs.readFileSync('public/index.html', 'utf8');
  const apiJs = fs.readFileSync('public/js/api.js', 'utf8');
  const appJs = fs.readFileSync('public/js/app.js', 'utf8');

  // We set up a DOM environment
  const dom = new JSDOM(html, {
    url: 'http://localhost:3000/',
    runScripts: 'dangerously',
    resources: 'usable'
  });

  const { window } = dom;

  // Track errors
  const errors = [];
  window.addEventListener('error', (evt) => {
    errors.push(evt.error || evt.message);
  });

  // Polyfill localStorage
  const storage = {};
  window.localStorage = {
    getItem: (k) => storage[k] || null,
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: (k) => { delete storage[k]; },
    clear: () => { Object.keys(storage).forEach(k => delete storage[k]); }
  };

  // Polyfill scrollIntoView
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.scrollTo = () => {};

  // Polyfill fetch to connect to local server http://localhost:3000
  window.fetch = async (url, opts = {}) => {
    const fullUrl = url.startsWith('/') ? `http://localhost:3000${url}` : url;
    const res = await fetch(fullUrl, opts);
    return res;
  };

  // Run api.js
  try {
    window.eval(apiJs);
    console.log('✓ api.js loaded in JSDOM');
  } catch (err) {
    console.error('❌ Error executing api.js:', err);
    errors.push(err);
  }

  // Run app.js
  try {
    window.eval(appJs);
    console.log('✓ app.js loaded in JSDOM');
  } catch (err) {
    console.error('❌ Error executing app.js:', err);
    errors.push(err);
  }

  // Dispatch DOMContentLoaded
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  console.log('✓ DOMContentLoaded dispatched');

  // Wait a tick
  await new Promise(r => setTimeout(r, 200));

  // Check window.kolaApp
  console.log('window.kolaApp defined?', !!window.kolaApp);
  if (window.kolaApp) {
    console.log('window.kolaApp keys:', Object.keys(window.kolaApp));
  }

  // Check for any errors during boot
  if (errors.length > 0) {
    console.error('❌ Boot errors captured:', errors);
  } else {
    console.log('✓ Zero boot errors in JSDOM!');
  }
}

testCustomerAppInDom().catch(console.error);

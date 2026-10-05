const http = require('http');
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

async function test() {
  const tmpDir = path.join(os.tmpdir(), 'chrome_mobi_' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9222',
    `--user-data-dir=${tmpDir}`,
    '--window-size=375,812',
    'about:blank'
  ], { stdio: 'ignore' });

  await new Promise(r => setTimeout(r, 1200));
  http.get('http://127.0.0.1:9222/json', (res) => {
    let d = ''; res.on('data', c => d += c);
    res.on('end', async () => {
      const targets = JSON.parse(d);
      const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
      ws.onopen = async () => {
        let id = 1;
        const call = (method, params = {}) => new Promise((resolve, reject) => {
          const reqId = id++;
          const l = (e) => {
            const m = JSON.parse(e.data);
            if (m.id === reqId) { ws.removeEventListener('message', l); if (m.error) reject(new Error(JSON.stringify(m.error))); else resolve(m.result); }
          };
          ws.addEventListener('message', l);
          ws.send(JSON.stringify({ id: reqId, method, params }));
        });

        await call('Page.navigate', { url: 'http://localhost:3000' });
        await new Promise(r => setTimeout(r, 1500));

        const res = await call('Runtime.evaluate', {
          expression: `({
            innerWidth: window.innerWidth,
            clientWidth: document.documentElement.clientWidth,
            matchMedia640: window.matchMedia('(max-width: 640px)').matches,
            matchMedia960: window.matchMedia('(max-width: 960px)').matches
          })`,
          returnByValue: true
        });
        console.log('Result with temp user-data-dir:', res.result.value);
        chrome.kill();
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
        process.exit(0);
      };
    });
  });
}
test();

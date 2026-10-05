const http = require('http');
const { spawn } = require('child_process');

async function test() {
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9222',
    'about:blank'
  ], { stdio: 'ignore' });

  await new Promise(r => setTimeout(r, 1000));
  http.get('http://127.0.0.1:9222/json', (res) => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', async () => {
      const targets = JSON.parse(d);
      const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
      ws.onopen = async () => {
        let id = 1;
        const call = (method, params = {}) => new Promise((resolve, reject) => {
          const reqId = id++;
          const l = (e) => {
            const m = JSON.parse(e.data);
            if (m.id === reqId) {
              ws.removeEventListener('message', l);
              if (m.error) reject(new Error(JSON.stringify(m.error)));
              else resolve(m.result);
            }
          };
          ws.addEventListener('message', l);
          ws.send(JSON.stringify({ id: reqId, method, params }));
        });

        await call('Page.enable');
        await call('Emulation.setDeviceMetricsOverride', {
          width: 375,
          height: 812,
          deviceScaleFactor: 2,
          mobile: true
        });
        await call('Page.navigate', { url: 'http://localhost:3000' });
        await new Promise(r => setTimeout(r, 2000));

        const res = await call('Runtime.evaluate', {
          expression: `({
            innerWidth: window.innerWidth,
            clientWidth: document.documentElement.clientWidth,
            matchMedia640: window.matchMedia('(max-width: 640px)').matches,
            matchMedia960: window.matchMedia('(max-width: 960px)').matches
          })`,
          returnByValue: true
        });
        console.log('Result with Page.enable first:', res.result.value);
        chrome.kill();
        process.exit(0);
      };
    });
  });
}
test();

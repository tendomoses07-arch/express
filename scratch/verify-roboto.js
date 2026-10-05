const http = require('http');

function check(url, expected) {
  return new Promise((resolve) => {
    http.get(url, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        const ok = d.includes(expected);
        console.log(ok ? '✅ PASS:' : '❌ FAIL:', url, 'contains', expected);
        resolve(ok);
      });
    }).on('error', (err) => {
      console.error('❌ Error fetching', url, err.message);
      resolve(false);
    });
  });
}

async function verify() {
  console.log('--- VERIFYING ROBOTO FONT ACROSS PUBLIC & ADMIN PORTALS ---');
  await check('http://localhost:3000/', 'family=Roboto');
  await check('http://localhost:3000/css/styles.css', 'family=Roboto');
  await check('http://localhost:3000/css/styles.css', "--font-body: 'Roboto'");
  await check('http://localhost:3000/css/styles.css', "--font-heading: 'Roboto'");
  await check('http://localhost:3001/', 'family=Roboto');
  await check('http://localhost:3001/css/admin.css', 'family=Roboto');
  await check('http://localhost:3001/css/admin.css', "--font-family: 'Roboto'");
  console.log('--- COMPLETED ---');
}

verify();

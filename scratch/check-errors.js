const fs = require('fs');

const html = fs.readFileSync('public/index.html', 'utf8');
const js = fs.readFileSync('public/js/app.js', 'utf8');

// Find all getElementById in js
const idRegex = /getElementById\(['"]([^'"]+)['"]\)/g;
const idsInJs = new Set();
let match;
while ((match = idRegex.exec(js)) !== null) {
  idsInJs.add(match[1]);
}

console.log('Total getElementById in app.js:', idsInJs.size);

const missingFromHtml = [];
for (const id of idsInJs) {
  const pattern1 = `id="${id}"`;
  const pattern2 = `id='${id}'`;
  if (!html.includes(pattern1) && !html.includes(pattern2)) {
    missingFromHtml.push(id);
  }
}
console.log('IDs in app.js missing from index.html:', missingFromHtml);

// Check onclick / inline handlers in html
const onclickRegex = /onclick="([^"]+)"/g;
const onclicks = [];
while ((match = onclickRegex.exec(html)) !== null) {
  onclicks.push(match[1]);
}
console.log('Inline onclicks in index.html:', onclicks);

// Check api.js references
const apiJs = fs.readFileSync('public/js/api.js', 'utf8');
const apiCalls = new Set();
const apiRegex = /window\.kolaApi\.([a-zA-Z0-9_.]+)/g;
while ((match = apiRegex.exec(js)) !== null) {
  apiCalls.add(match[1]);
}
console.log('window.kolaApi calls in app.js:', [...apiCalls]);

const fs = require('fs');

const html = fs.readFileSync('public/index.html', 'utf8');
const js = fs.readFileSync('public/js/app.js', 'utf8');

const regex = /document\.getElementById\(['"]([^'"]+)['"]\)/g;
let match;
const missing = new Set();
const found = new Set();

while ((match = regex.exec(js)) !== null) {
  const id = match[1];
  if (!html.includes('id="' + id + '"') && !html.includes("id='" + id + "'")) {
    missing.add(id);
  } else {
    found.add(id);
  }
}

console.log('Total IDs found in HTML:', found.size);
console.log('Missing element IDs referenced in app.js:', Array.from(missing));

// Also check querySelector with #
const qsRegex = /document\.querySelector\(['"]#([^'"]+)['"]\)/g;
while ((match = qsRegex.exec(js)) !== null) {
  const id = match[1];
  if (!html.includes('id="' + id + '"') && !html.includes("id='" + id + "'")) {
    missing.add(id);
  }
}

console.log('All missing IDs:', Array.from(missing));

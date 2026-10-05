const fs = require('fs');

const js = fs.readFileSync('public/js/app.js', 'utf8');
const html = fs.readFileSync('public/index.html', 'utf8');

// Find all document.getElementById('...').addEventListener
const getByIdAddEvent = /document\.getElementById\(['"]([^'"]+)['"]\)\.addEventListener/g;
let m;
const potentialCrashes = [];

while ((m = getByIdAddEvent.exec(js)) !== null) {
  const id = m[1];
  if (!html.includes('id="' + id + '"') && !html.includes("id='" + id + "'")) {
    potentialCrashes.push(id);
  }
}

console.log('Unchecked document.getElementById(...).addEventListener missing from HTML:', potentialCrashes);

// Find all const/let xxx = document.getElementById('...'); xxx.addEventListener
const varAssign = /(?:const|let|var)\s+(\w+)\s*=\s*document\.getElementById\(['"]([^'"]+)['"]\);/g;
const vars = {};
while ((m = varAssign.exec(js)) !== null) {
  vars[m[1]] = m[2];
}

const varAddEvent = /(\w+)\.addEventListener/g;
const varCrashes = [];
while ((m = varAddEvent.exec(js)) !== null) {
  const varName = m[1];
  if (vars[varName]) {
    const id = vars[varName];
    if (!html.includes('id="' + id + '"') && !html.includes("id='" + id + "'")) {
      varCrashes.push({ varName, id });
    }
  }
}
console.log('Var-based addEventListener crashes:', varCrashes);

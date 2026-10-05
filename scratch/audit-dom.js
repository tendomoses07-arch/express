const fs = require('fs');

const js = fs.readFileSync('public/js/app.js', 'utf8');
const html = fs.readFileSync('public/index.html', 'utf8');

// Find all document.getElementById
const idMatches = [...js.matchAll(/document\.getElementById\(['"]([^'"]+)['"]\)/g)].map(m => m[1]);

// Find all querySelector / querySelectorAll
const qsMatches = [...js.matchAll(/document\.querySelector(?:All)?\(['"]([^'"]+)['"]\)/g)].map(m => m[1]);

console.log('--- Checking all getElementById targets ---');
const missingIds = [];
idMatches.forEach(id => {
  if (!html.includes(`id="${id}"`) && !html.includes(`id='${id}'`)) {
    missingIds.push(id);
  }
});
console.log('Missing IDs:', [...new Set(missingIds)]);

console.log('\n--- Checking querySelector targets ---');
const missingSelectors = [];
qsMatches.forEach(sel => {
  if (sel.startsWith('#')) {
    const id = sel.slice(1);
    if (!html.includes(`id="${id}"`) && !html.includes(`id='${id}'`)) {
      missingSelectors.push(sel);
    }
  } else if (sel.startsWith('.')) {
    const cls = sel.slice(1).split(/[\s.:>+~[]/)[0];
    if (!html.includes(`class="`) || !html.includes(cls)) {
      missingSelectors.push(sel);
    }
  }
});
console.log('Missing selectors:', [...new Set(missingSelectors)]);

const fs = require('fs');
const apiJs = fs.readFileSync('public/js/api.js', 'utf8');

const requiredMethods = [
  'auth.getUser',
  'auth.getToken',
  'pricing.calculateQuote',
  'deliveries.create',
  'payments.initiate',
  'payments.verify',
  'deliveries.get',
  'deliveries.confirmHandover',
  'deliveries.disputeHandover',
  'auth.login',
  'courier.getMyDeliveries',
  'courier.updateStatus',
  'courier.markArrived',
  'courier.confirmReceipt',
  'courier.reportNotReceived',
  'courier.verifyPinAndDeliver',
  'auth.register',
  'deliveries.list',
  'auth.logout'
];

console.log('--- Checking api.js methods ---');
const missing = [];
for (const method of requiredMethods) {
  const [namespace, fn] = method.split('.');
  const regex = new RegExp(`${namespace}\\s*:\\s*\\{[^}]*\\b${fn}\\b`, 's');
  // Also check direct property assignment or shorthand
  if (!apiJs.includes(fn)) {
    missing.push(method);
  }
}
console.log('Missing api methods in api.js:', missing);

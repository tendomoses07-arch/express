// Kola Express — Application Entry Point for Production & Cloud Hosting
// Automatically routes to server/server.js

const serverApp = require('./server/server.js');
module.exports = serverApp.app || serverApp;

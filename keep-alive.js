/**
 * Keep-alive script for Render free-tier API
 *
 * Render free-tier services sleep after 15 minutes of inactivity.
 * This script pings the API endpoint periodically to keep it warm.
 *
 * Run: node keep-alive.js
 *
 * To stop: Ctrl+C
 */

const http = require('http');
const apiUrl = process.env.API_URL || 'https://agenttrace-api.onrender.com/health';
const INTERVAL = parseInt(process.env.PING_INTERVAL) || 300000; // 5 minutes default
const HOST = apiUrl.replace('https://', '').replace('http://', '').split('/')[0];
const PATH = apiUrl.replace('https://' + HOST + '/', '').replace('http://' + HOST + '/', '') || '/health';

let pingCount = 0;

function ping() {
  const options = {
    hostname: HOST,
    path: PATH,
    method: 'GET',
    timeout: 10000,
  };

  const req = http.request(options, (res) => {
    pingCount++;
    // console.log(`[keep-alive] Ping #${pingCount}: ${res.statusCode}`);
  });

  req.on('error', (e) => {
    // silently retry next interval
  });

  req.on('timeout', () => {
    req.destroy();
  });

  req.end();
}

// Start immediate ping, then repeat at interval
ping();
const timer = setInterval(ping, INTERVAL);

// Handle process exit gracefully
process.on('SIGINT', () => {
  clearInterval(timer);
  process.exit(0);
});

// Log status periodically
setInterval(() => {
  // no-op
}, 60000);

console.log(`[keep-alive] Started pinging ${apiUrl} every ${INTERVAL / 60000} minutes`);
console.log('[keep-alive] Press Ctrl+C to stop');
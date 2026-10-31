const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

const server = http.createServer((req, res) => {
  // Parse clean URL path
  let reqPath = decodeURI(req.url.split('?')[0]);
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

  const filePath = path.join(ROOT_DIR, reqPath);

  // Security check: prevent directory traversal
  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('403 Forbidden');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('404 Not Found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n===============================================================`);
  console.log(` 🦊 EVOFOX RONIN WIRELESS WEBHID STUDIO`);
  console.log(`===============================================================`);
  console.log(` Author:       Harsh Prajapati`);
  console.log(` Instagram:    https://www.instagram.com/harshprajapatiofficial/`);
  console.log(` Repository:   https://github.com/xaviermsd/evofox-ronin-configurator`);
  console.log(` Local Server: ${url}`);
  console.log(` WebHID API:   Enabled (Chrome / Edge / Opera / Brave)`);
  console.log(` Supported:    EvoFox Ronin Wired (0xA157) & 2.4G (0x8FF0)`);
  console.log(` Status:       Ready for WebHID hardware communication.`);
  console.log(`===============================================================\n`);

  // Auto-open in default browser on Windows
  if (process.platform === 'win32') {
    exec(`start ${url}`);
  }
});

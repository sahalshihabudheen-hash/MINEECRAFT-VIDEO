// Node-side harness: static server + headless Chromium (software WebGL via SwiftShader).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.glb': 'model/gltf-binary', '.mcmeta': 'application/json', '.css': 'text/css' };

export function findChrome() {
  const cands = [process.env.CHROME_PATH, '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
  for (const c of cands) if (c && fs.existsSync(c)) return c;
  throw new Error('No Chrome/Chromium found. Set CHROME_PATH.');
}

export function startServer() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const u = decodeURIComponent(req.url.split('?')[0]);
      const f = path.join(ROOT, u === '/' ? 'index.html' : u);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

export async function openPage({ width, height, query = '', page: pageName = 'index.html' }) {
  const { srv, port } = await startServer();
  const browser = await puppeteer.launch({
    executablePath: findChrome(), headless: 'new', protocolTimeout: 3600000,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--js-flags=--max-old-space-size=4096']
  });
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  page.on('console', (m) => { const t = m.text(); if (!t.startsWith('Failed to load resource')) console.log('[page]', t); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${port}/${pageName}?w=${width}&h=${height}${query}`);
  await page.waitForFunction('window.__ready===true||window.__error', { timeout: 1800000 });
  const err = await page.evaluate('window.__error||null');
  if (err) throw new Error('page init failed: ' + err);
  return { page, browser, close: async () => { await browser.close(); srv.close(); } };
}

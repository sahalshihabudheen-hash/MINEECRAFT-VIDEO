import fs from 'node:fs';
import { openPage } from '../src/render/harness.js';
const h = await openPage({ width: 1280, height: 720, page: 'debug-glb.html' });
const info = await h.page.evaluate('window.info');
console.log('size', info.size.map(x=>x.toFixed(1)), 'min', info.min.map(x=>x.toFixed(1)), 'max', info.max.map(x=>x.toFixed(1)));
for (const m of info.list) console.log(m.n.padEnd(30), String(m.tris).padStart(7), JSON.stringify(m.min), JSON.stringify(m.max), m.tr?'T':'', m.at, m.side);
const shots = JSON.parse(process.argv[2]||'[]');
let i=0;for (const s of shots) { const u = await h.page.evaluate((...a) => window.shot(...a), ...s);
  fs.writeFileSync(`previews/glb_${i++}.png`, Buffer.from(u.split(',')[1], 'base64')); }
await h.close();

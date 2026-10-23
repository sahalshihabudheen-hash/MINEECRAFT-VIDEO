import { openPage } from '../src/render/harness.js';
const h = await openPage({ width: 640, height: 360, page: 'debug-glb.html' });
const [x0,x1,z0,z1,st]=JSON.parse(process.argv[2]);
const rows = await h.page.evaluate((...a) => window.heights(...a), x0,x1,z0,z1,st);
console.log('     '+Array.from({length:rows[0].length},(_,i)=>String(x0+i*st).padStart(3)).join(' '));
rows.forEach((r,i)=>console.log(String(z0+i*st).padStart(4)+' '+r.map(v=>v<0?'  .':String(v).padStart(3)).join(' ')));
await h.close();

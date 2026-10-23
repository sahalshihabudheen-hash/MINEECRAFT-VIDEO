import { openPage } from '../src/render/harness.js';
const h = await openPage({ width: 1280, height: 720, page: 'debug-glb.html' });
const cam = JSON.parse(process.argv[2]); const pts = JSON.parse(process.argv[3]);
await h.page.evaluate((...a) => window.shot(...a), ...cam);
for (const [x, y] of pts) console.log(x, y, JSON.stringify(await h.page.evaluate((x, y) => window.pick(x, y), x, y)));
await h.close();

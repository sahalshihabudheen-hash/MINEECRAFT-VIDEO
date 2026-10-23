// Voxel world: lazy chunk generation, face-culled meshing with baked AO / sky / sun-shadow / block light, LOD terrain, water.
import * as THREE from 'three';
import { B, BLOCK_COUNT, OPAQUE, SOLID, EMIT, SELF_LIT, isSpecial } from './minecraft-blocks.js';
import { YMIN, YMAX, HEIGHT, SEA, Y0, SINK, SHAFT, shaftAxis, CAVERN, POOL, SUN_DIR } from './layout.js';
import { baseHeight, inCavern, inSinkhole, inAscentShaft, inDeepCave, strataBlock, floorBump, columnTop, sinkRadius } from './terrain.js';
import { hash2, hash3, noise2, fbm2, smoothstep, clamp } from '../core/util.js';
import { makeVoxelMaterial, makeWaterMaterial } from '../render/materials.js';

export const NSEC = HEIGHT / 16;
const CH = 16;
const ck = (cx, cz) => cx + ',' + cz;
const hyp = Math.hypot;

// grid heightmap (4-block cells) of footprint-aware column tops, for sky/sun queries
const GR = 4, GN = 360, GO = -GN * GR / 2;   // covers [-720,720)
let topGrid = null;
function buildTopGrid() {
  topGrid = new Int16Array(GN * GN);
  for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) topGrid[j * GN + i] = baseHeight(GO + i * GR + 2, GO + j * GR + 2);
}
export function topAt(x, z) {
  if (!topGrid) buildTopGrid();
  if (hyp(x - SINK.x, z - SINK.z) < sinkRadius(Y0 + 60) - 2) return Y0 + 2;
  const a = shaftAxis(60); if (hyp(x - a.x, z - a.z) < 5.5) return Y0 + 2;
  const fx = (x - GO) / GR - 0.5, fz = (z - GO) / GR - 0.5;
  const i = clamp(Math.floor(fx), 0, GN - 2), j = clamp(Math.floor(fz), 0, GN - 2), u = clamp(fx - i, 0, 1), v = clamp(fz - j, 0, 1);
  const g = (a, b) => topGrid[b * GN + a];
  return (g(i, j) * (1 - u) + g(i + 1, j) * u) * (1 - v) + (g(i, j + 1) * (1 - u) + g(i + 1, j + 1) * u) * v;
}

// ---- face tables (see derivation in notes): corners bl,br,tr,tl ; tangent right/up for AO ----
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], r: [0, 0, -1], u: [0, 1, 0], k: 2 },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], r: [0, 0, 1], u: [0, 1, 0], k: 2 },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], r: [1, 0, 0], u: [0, 0, -1], k: 0 },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], r: [1, 0, 0], u: [0, 0, 1], k: 1 },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], r: [1, 0, 0], u: [0, 1, 0], k: 2 },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], r: [-1, 0, 0], u: [0, 1, 0], k: 2 },
];
for (const F of FACES) { F.ra = F.r.findIndex((v) => v !== 0); F.ua = F.u.findIndex((v) => v !== 0); }

class GeoBuilder {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.L = []; this.A = []; this.idx = []; this.n = 0; }
  quad(p, n, uv, L, A, flip) {
    const b = this.n;
    for (let i = 0; i < 4; i++) { this.pos.push(p[i][0], p[i][1], p[i][2]); this.nor.push(n[0], n[1], n[2]); this.uv.push(uv[i][0], uv[i][1]);
      this.L.push(L[0], L[1], L[2], L[3]); this.A.push(A[i][0], A[i][1]); }
    if (flip) this.idx.push(b + 1, b + 2, b + 3, b + 1, b + 3, b); else this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    this.n += 4;
  }
  build(origin) {
    if (!this.n) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(this.nor.map((v) => Math.round(v * 127))), 3, true));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.uv), 2));
    g.setAttribute('aL', new THREE.BufferAttribute(new Uint8Array(this.L.map((v) => Math.round(clamp(v, 0, 1) * 255))), 4, true));
    g.setAttribute('aA', new THREE.BufferAttribute(new Uint8Array(this.A.map((v) => Math.round(clamp(v, 0, 1) * 255))), 2, true));
    g.setIndex(new THREE.BufferAttribute(this.n > 65000 ? new Uint32Array(this.idx) : new Uint16Array(this.idx), 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

export class World {
  constructor(atlas) {
    this.atlas = atlas; this.chunks = new Map(); this.pending = new Map(); this.emitCells = new Map(); this.sections = new Map();
    this.group = new THREE.Group(); this.voxMat = makeVoxelMaterial(atlas.texture); this.waterMat = makeWaterMaterial(atlas.texture);
    this.pad = new Uint8Array(18 * 18 * 18); this.stats = { gen: 0, mesh: 0 };
    this.structureBoxes = [];   // [x0,y0,z0,x1,y1,z1] regions that need full strata noise (structures/caves)
  }
  // ---------------- editing / structures ----------------
  set(x, y, z, id) {
    if (y < YMIN || y >= YMAX) return;
    const cx = Math.floor(x / CH), cz = Math.floor(z / CH), key = ck(cx, cz);
    const idx = (y - YMIN) * 256 + (z - cz * CH) * 16 + (x - cx * CH);
    const ch = this.chunks.get(key);
    if (ch) { ch.data[idx] = id; return; }
    let p = this.pending.get(key); if (!p) this.pending.set(key, (p = new Map())); p.set(idx, id);
  }
  addEmitter(x, y, z, warm, cool, radius) {
    const key = Math.floor(x / 16) + ',' + Math.floor(z / 16) + ',' + Math.floor(y / 16);
    let l = this.emitCells.get(key); if (!l) this.emitCells.set(key, (l = []));
    l.push([x + 0.5, y + 0.5, z + 0.5, warm, cool, radius]);
  }
  // ---------------- queries ----------------
  chunk(cx, cz) { const k = ck(cx, cz); let c = this.chunks.get(k); if (!c) c = this.genChunk(cx, cz); return c; }
  getBlock(x, y, z) {
    if (y < YMIN || y >= YMAX) return 0;
    const cx = Math.floor(x / CH), cz = Math.floor(z / CH); const c = this.chunk(cx, cz);
    return c.data[(y - YMIN) * 256 + (z - cz * CH) * 16 + (x - cx * CH)];
  }
  isSolid(x, y, z) { return SOLID[this.getBlock(Math.floor(x), Math.floor(y), Math.floor(z))] === 1; }
  isWater(x, y, z) { return this.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)) === B.WATER; }
  // highest solid y (+1) in a column, searching downward from yStart
  groundY(x, z, yStart = YMAX - 1) {
    x = Math.floor(x); z = Math.floor(z);
    for (let y = yStart; y > YMIN; y--) { if (SOLID[this.getBlock(x, y, z)]) return y + 1; } return YMIN;
  }
  // ---------------- generation ----------------
  genChunk(cx, cz) {
    const data = new Uint8Array(256 * HEIGHT); const ox = cx * CH, oz = cz * CH;
    const hts = new Int16Array(256);
    const nearCarve = (x, z) => {
      const r = hyp(x, z); if (r < CAVERN.r * 1.2) return true;
      if (hyp(x - SINK.x, z - SINK.z) < 70) return true;
      if (hyp(x - SHAFT.x, z - SHAFT.z) < 30) return true; return false;
    };
    for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) {
      const x = ox + lx, z = oz + lz; const h = baseHeight(x, z); hts[lz * 16 + lx] = h;
      const carveZone = nearCarve(x, z);
      const snowline = 134 + noise2(x / 30, z / 30, 3) * 8;
      const top = Math.max(h, SEA);
      const sandy = h <= SEA + 1;
      const rocky = h > 118 && !sandy;
      for (let y = YMIN; y <= top; y++) {
        let id;
        if (y > h) id = B.WATER;
        else {
          const depth = h - y;
          if (depth === 0) id = sandy ? B.SAND : (h > snowline ? B.SNOW : (rocky ? (hash2(x, z, 4) < 0.5 ? B.STONE : B.GRAVEL) : B.GRASS));
          else if (depth <= 3 && !rocky) id = sandy ? (depth <= 2 ? B.SAND : B.DIRT) : (h > snowline ? B.STONE : B.DIRT);
          else if (depth < 8 || carveZone || y < 6) id = strataBlock(B, x, y, z, depth);
          else id = y < 2 ? B.DEEPSLATE : B.STONE;
          if (id === B.SAND && y < SEA - 4) id = B.GRAVEL;
        }
        data[(y - YMIN) * 256 + lz * 16 + lx] = id;
      }
      if (carveZone) {
        const rr = hyp(x, z);
        for (let y = YMIN; y <= top; y++) {
          const idx = (y - YMIN) * 256 + lz * 16 + lx;
          if (data[idx] === 0 && y <= h) continue;
          let air = false;
          if (y <= Y0 + CAVERN.h + 14 && inCavern(x, y, z)) air = true;
          else if (y > Y0 + 18 && y < 140 && inSinkhole(x, y, z)) air = true;
          else if (y > Y0 + 28 && y < 130 && inAscentShaft(x, y, z)) air = true;
          else if (y > -30 && y < 2 && inDeepCave(x, y, z)) air = true;
          if (air) data[idx] = (y <= POOL.waterY ? B.WATER : 0);
        }
        // cavern floor dressing
        if (rr < CAVERN.r * 1.1 || hyp(x - POOL.x, z - POOL.z) < 30) {
          const fy = Y0 + floorBump(x, z) - 1;
          const i0 = (fy - YMIN) * 256 + lz * 16 + lx, i1 = (fy + 1 - YMIN) * 256 + lz * 16 + lx;
          if (data[i0] !== 0 && data[i0] !== B.WATER && data[i1] === 0) {
            const n = noise2(x / 11, z / 11, 9) + noise2(x / 4, z / 4, 10) * 0.35;
            const r2 = hash2(x, z, 12);
            if (hyp(x - POOL.x, z - POOL.z) < POOL.r + 1.5) data[i0] = B.GRAVEL;
            else if (n > 0.18) data[i0] = B.SCULK;
            else if (n < -0.35) data[i0] = B.COBBLED_DEEPSLATE;
            else data[i0] = r2 < 0.5 ? B.DEEPSLATE : B.POLISHED_DEEPSLATE;
            if (data[i0] === B.SCULK && r2 < 0.0016) data[i1] = B.SCULK_CATALYST;
          }
        }
      }
      // cave pocket floor (water pool + moss) handled by structures module
    }
    // trees + grass tufts (surface only)
    for (let x = ox - 3; x < ox + 19; x++) for (let z = oz - 3; z < oz + 19; z++) {
      const h = (x >= ox && x < ox + 16 && z >= oz && z < oz + 16) ? hts[(z - oz) * 16 + (x - ox)] : baseHeight(x, z);
      if (h <= SEA + 1 || h > 124) continue;
      const dd = hyp(x - SINK.x, z - SINK.z); if (dd < sinkRadius(70) + 6) continue;
      const a = shaftAxis(70); if (hyp(x - a.x, z - a.z) < 14) continue;
      const forest = clamp(0.35 + fbm2(x / 70, z / 70, 2, 3) * 1.4, 0, 1);
      const r = hash2(x, z, 7);
      if (r < 0.0045 + forest * forest * 0.034) {
        const th = 4 + Math.floor(hash2(x, z, 8) * 3);
        for (let dy = 1; dy <= th; dy++) this.cset(data, ox, oz, x, h + dy, z, B.LOG, true);
        for (let dy = th - 2; dy <= th + 1; dy++) {
          const rad = dy >= th ? (dy === th ? 1 : 1) : 2;
          for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
            if (Math.abs(dx) === rad && Math.abs(dz) === rad && (rad === 2 ? hash3(x + dx, dy, z + dz, 9) < 0.45 : dy === th + 1)) continue;
            if (dy === th + 1 && (Math.abs(dx) + Math.abs(dz)) > 1) continue;
            if (dx === 0 && dz === 0 && dy <= th) continue;
            this.cset(data, ox, oz, x + dx, h + dy, z + dz, B.LEAVES, false);
          }
        }
      } else if (r > 0.9 && r < 0.9 + 0.07 * (0.3 + forest) && x >= ox && x < ox + 16 && z >= oz && z < oz + 16) {
        const idx = (h + 1 - YMIN) * 256 + (z - oz) * 16 + (x - ox);
        if (data[(h - YMIN) * 256 + (z - oz) * 16 + (x - ox)] === B.GRASS && data[idx] === 0) data[idx] = B.SHORT_GRASS;
      }
    }
    // structure overlay
    const p = this.pending.get(ck(cx, cz)); if (p) { for (const [i, id] of p) data[i] = id; this.pending.delete(ck(cx, cz)); }
    // bookkeeping: per-section counts
    const secCount = new Int16Array(NSEC); const secEmpty = new Uint8Array(NSEC);
    for (let s = 0; s < NSEC; s++) { let c = 0; const b = s * 4096; for (let i = 0; i < 4096; i++) if (data[b + i]) c++; secCount[s] = c; }
    const ch = { data, secCount, cx, cz, hts }; this.chunks.set(ck(cx, cz), ch); this.stats.gen++;
    return ch;
  }
  cset(data, ox, oz, x, y, z, id, force) {
    if (x < ox || x >= ox + 16 || z < oz || z >= oz + 16 || y < YMIN || y >= YMAX) return;
    const idx = (y - YMIN) * 256 + (z - oz) * 16 + (x - ox);
    if (force || data[idx] === 0 || data[idx] === B.SHORT_GRASS) data[idx] = id;
  }

  // ---------------- lighting probes (baked into vertices) ----------------
  skyOpen(x, y, z) {
    let s = 0; const o = 3;
    for (const [dx, dz] of [[0, 0], [o, 0], [-o, 0], [0, o], [0, -o]]) { if (y > topAt(x + dx, z + dz) - 0.5) s++; }
    return s / 5;
  }
  sunVis(x, y, z) {
    const L = SUN_DIR; let px = x, py = y, pz = z;
    for (let s = 2; s <= 120; s += (s < 24 ? 2 : 5)) {
      py = y + L[1] * s; if (py > 230) break;
      if (py < topAt(x + L[0] * s, z + L[2] * s) - 0.7) return 0;
    }
    return 1;
  }
  blockLight(x, y, z, out) {
    let w = 0, c = 0; const kx = Math.floor(x / 16), kz = Math.floor(z / 16), ky = Math.floor(y / 16);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) {
      const l = this.emitCells.get((kx + dx) + ',' + (kz + dz) + ',' + (ky + dy)); if (!l) continue;
      for (const e of l) { const d = Math.hypot(x - e[0], y - e[1], z - e[2]); if (d < e[5]) { const a = 1 - d / e[5]; const k = a * a; w += e[3] * k; c += e[4] * k; } }
    }
    out[0] = Math.min(w, 1.4); out[1] = Math.min(c, 1.4);
  }

  // ---------------- meshing ----------------
  meshSection(cx, sy, cz) {
    const pad = this.pad, y0 = YMIN + sy * 16;
    const cols = []; for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) cols.push(this.chunk(cx + dx, cz + dz));
    for (let py = 0; py < 18; py++) {
      const y = y0 - 1 + py; const inY = y >= YMIN && y < YMAX;
      for (let pz = 0; pz < 18; pz++) {
        const cz2 = pz === 0 ? 0 : pz === 17 ? 2 : 1, lz = pz === 0 ? 15 : pz === 17 ? 0 : pz - 1;
        for (let px = 0; px < 18; px++) {
          const cx2 = px === 0 ? 0 : px === 17 ? 2 : 1, lx = px === 0 ? 15 : px === 17 ? 0 : px - 1;
          pad[(py * 18 + pz) * 18 + px] = inY ? cols[cz2 * 3 + cx2].data[(y - YMIN) * 256 + lz * 16 + lx] : 0;
        }
      }
    }
    const solid = new GeoBuilder(), water = new GeoBuilder();
    const at = this.atlas; const probe = [0, 0]; const ox = cx * 16, oz = cz * 16;
    const O = (x, y, z) => ((y + 1) * 18 + (z + 1)) * 18 + (x + 1);
    const opq = (x, y, z) => OPAQUE[pad[O(x, y, z)]];
    for (let y = 0; y < 16; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const id = pad[O(x, y, z)]; if (id === 0) continue;
      const wx = ox + x, wy = y0 + y, wz = oz + z;
      if (id === B.WATER) {
        const up = pad[O(x, y + 1, z)]; const top = up === 0 || isSpecial(up);
        for (let f = 0; f < 6; f++) {
          const F = FACES[f]; const nb = pad[O(x + F.n[0], y + F.n[1], z + F.n[2])];
          if (nb === B.WATER || OPAQUE[nb]) continue;
          const hh = top ? 0.88 : 1;
          const cx0 = wx + F.n[0], cy0 = wy + F.n[1], cz0 = wz + F.n[2];
          const sky = this.skyOpen(cx0, cy0, cz0); const sun = sky > 0 ? this.sunVis(cx0, cy0 + 0.5, cz0) : 0; this.blockLight(cx0 + 0.5, cy0 + 0.5, cz0 + 0.5, probe);
          const [u0, v0, u1, v1] = at.uvRect(at.faceTile[id][F.k]);
          const p = F.c.map((c) => [x + c[0], y + c[1] * hh, z + c[2]]);
          water.quad(p, F.n, [[u0, v1], [u1, v1], [u1, v0], [u0, v0]], [sky, sun, probe[0], probe[1]], [[1, 0], [1, 0], [1, 0], [1, 0]], false);
        }
        continue;
      }
      if (isSpecial(id)) { this.meshSpecial(solid, id, x, y, z, wx, wy, wz, pad, O); continue; }
      const tiles = at.faceTile[id]; const self = SELF_LIT[id] || 0;
      for (let f = 0; f < 6; f++) {
        const F = FACES[f]; const nx = x + F.n[0], ny = y + F.n[1], nz = z + F.n[2];
        if (OPAQUE[pad[O(nx, ny, nz)]]) continue;
        const cx0 = wx + F.n[0], cy0 = wy + F.n[1], cz0 = wz + F.n[2];
        const sky = this.skyOpen(cx0, cy0, cz0);
        const nl = F.n[0] * SUN_DIR[0] + F.n[1] * SUN_DIR[1] + F.n[2] * SUN_DIR[2];
        const sun = (sky > 0 && nl > 0) ? this.sunVis(cx0 + 0.5, cy0 + 0.5, cz0 + 0.5) : 0;
        this.blockLight(cx0 + 0.5, cy0 + 0.5, cz0 + 0.5, probe);
        const ao = [0, 0, 0, 0];
        const ra = F.ra, ua = F.ua;
        for (let i = 0; i < 4; i++) {
          const c = F.c[i]; const dR = c[ra] === 1 ? 1 : -1, dU = c[ua] === 1 ? 1 : -1;
          const o1 = [nx, ny, nz], o2 = [nx, ny, nz], o3 = [nx, ny, nz];
          o1[ra] += dR; o2[ua] += dU; o3[ra] += dR; o3[ua] += dU;
          const s1 = opq(o1[0], o1[1], o1[2]), s2 = opq(o2[0], o2[1], o2[2]), cc = opq(o3[0], o3[1], o3[2]);
          ao[i] = (s1 && s2) ? 0 : (3 - (s1 + s2 + cc)) / 3;
        }
        const [u0, v0, u1, v1] = at.uvRect(tiles[F.k]);
        const p = F.c.map((c) => [x + c[0], y + c[1], z + c[2]]);
        const flip = ao[0] + ao[2] < ao[1] + ao[3];
        solid.quad(p, F.n, [[u0, v1], [u1, v1], [u1, v0], [u0, v0]], [sky, sun, probe[0], probe[1]], ao.map((a) => [a, self]), flip);
      }
    }
    this.stats.mesh++;
    return { solid: solid.build(), water: water.build() };
  }

  meshSpecial(gb, id, x, y, z, wx, wy, wz, pad, O) {
    const at = this.atlas; const tile = at.faceTile[id][2]; const [u0, v0, u1, v1] = at.uvRect(tile);
    const probe = [0, 0]; this.blockLight(wx + 0.5, wy + 0.5, wz + 0.5, probe);
    const sky = this.skyOpen(wx, wy, wz); const sun = sky > 0 ? this.sunVis(wx + 0.5, wy + 0.8, wz + 0.5) : 0;
    const Lt = [sky, sun * 0.9, probe[0], probe[1]]; const self = SELF_LIT[id] || 0; const A4 = [[1, self], [1, self], [1, self], [1, self]];
    const uvFull = [[u0, v1], [u1, v1], [u1, v0], [u0, v0]];
    const sub = (a, b, c, d) => { const w = u1 - u0, h = v1 - v0; return [[u0 + w * a, v0 + h * d], [u0 + w * c, v0 + h * d], [u0 + w * c, v0 + h * b], [u0 + w * a, v0 + h * b]]; };
    const box = (x0, y0, z0, x1, y1, z1, px) => { // px: [uA,vA,uB,vB] in 0..1 tile space for side faces
      const f = (cx, cy, cz) => [x + cx, y + cy, z + cz];
      const s = sub(...px);
      gb.quad([f(x1, y0, z1), f(x1, y0, z0), f(x1, y1, z0), f(x1, y1, z1)], [1, 0, 0], s, Lt, A4, false);
      gb.quad([f(x0, y0, z0), f(x0, y0, z1), f(x0, y1, z1), f(x0, y1, z0)], [-1, 0, 0], s, Lt, A4, false);
      gb.quad([f(x0, y0, z1), f(x1, y0, z1), f(x1, y1, z1), f(x0, y1, z1)], [0, 0, 1], s, Lt, A4, false);
      gb.quad([f(x1, y0, z0), f(x0, y0, z0), f(x0, y1, z0), f(x1, y1, z0)], [0, 0, -1], s, Lt, A4, false);
      gb.quad([f(x0, y1, z1), f(x1, y1, z1), f(x1, y1, z0), f(x0, y1, z0)], [0, 1, 0], sub(px[0], px[1], px[2], Math.min(px[3], px[1] + 0.14)), Lt, A4, false);
    };
    switch (id) {
      case B.SHORT_GRASS: case B.COBWEB: {
        const a = id === B.COBWEB ? 0 : 0.12, hgt = id === B.COBWEB ? 1 : 0.85;
        gb.quad([[x + a, y, z + a], [x + 1 - a, y, z + 1 - a], [x + 1 - a, y + hgt, z + 1 - a], [x + a, y + hgt, z + a]], [0, 1, 0], uvFull, Lt, A4, false);
        gb.quad([[x + 1 - a, y, z + a], [x + a, y, z + 1 - a], [x + a, y + hgt, z + 1 - a], [x + 1 - a, y + hgt, z + a]], [0, 1, 0], uvFull, Lt, A4, false);
        gb.quad([[x + 1 - a, y, z + 1 - a], [x + a, y, z + a], [x + a, y + hgt, z + a], [x + 1 - a, y + hgt, z + 1 - a]], [0, 1, 0], uvFull, Lt, A4, false);
        gb.quad([[x + a, y, z + 1 - a], [x + 1 - a, y, z + a], [x + 1 - a, y + hgt, z + a], [x + a, y + hgt, z + 1 - a]], [0, 1, 0], uvFull, Lt, A4, false);
        break; }
      case B.RAIL: case B.RAIL_X: {
        const e = 0.05; const uv = id === B.RAIL ? uvFull : [[u0, v0], [u0, v1], [u1, v1], [u1, v0]];
        gb.quad([[x, y + e, z + 1], [x + 1, y + e, z + 1], [x + 1, y + e, z], [x, y + e, z]], [0, 1, 0], uv, Lt, A4, false); break; }
      case B.LADDER: gb.quad([[x, y, z + 0.06], [x + 1, y, z + 0.06], [x + 1, y + 1, z + 0.06], [x, y + 1, z + 0.06]], [0, 0, 1], uvFull, Lt, A4, false); break;
      case B.TORCH: box(0.4375, 0, 0.4375, 0.5625, 0.625, 0.5625, [0.4375, 0.375, 0.5625, 1]); break;
      case B.SOUL_LANTERN: box(0.3125, 0.0, 0.3125, 0.6875, 0.4375, 0.6875, [0, 0.12, 0.375, 0.56]); box(0.4375, 0.4375, 0.4375, 0.5625, 0.5, 0.5625, [0.4, 0.0, 0.5, 0.1]); break;
      case B.FENCE: {
        box(0.375, 0, 0.375, 0.625, 1, 0.625, [0.375, 0, 0.625, 1]);
        const conn = (dx, dz) => { const nb = pad[O(x + dx, y, z + dz)]; return nb === B.FENCE || OPAQUE[nb]; };
        for (const yy of [0.375, 0.75]) {
          if (conn(1, 0)) box(0.625, yy - 0.0, 0.4375, 1, yy + 0.1875 * 0.8, 0.5625, [0.5, 0.2, 1, 0.35]);
          if (conn(-1, 0)) box(0, yy, 0.4375, 0.375, yy + 0.15, 0.5625, [0.5, 0.2, 1, 0.35]);
          if (conn(0, 1)) box(0.4375, yy, 0.625, 0.5625, yy + 0.15, 1, [0.5, 0.2, 1, 0.35]);
          if (conn(0, -1)) box(0.4375, yy, 0, 0.5625, yy + 0.15, 0.375, [0.5, 0.2, 1, 0.35]);
        }
        break; }
    }
  }

  // ---------------- visibility management ----------------
  update(camPos, radius, scene) {
    const R = radius, minCx = Math.floor((camPos.x - R) / 16), maxCx = Math.floor((camPos.x + R) / 16), minCz = Math.floor((camPos.z - R) / 16), maxCz = Math.floor((camPos.z + R) / 16);
    const want = new Set();
    const ymin = Math.max(YMIN, camPos.yMin ?? camPos.y - R), ymax = Math.min(YMAX, camPos.yMax ?? camPos.y + R);
    const s0 = Math.max(0, Math.floor((ymin - YMIN) / 16)), s1 = Math.min(NSEC - 1, Math.floor((ymax - YMIN) / 16));
    for (let cz = minCz; cz <= maxCz; cz++) for (let cx = minCx; cx <= maxCx; cx++) {
      const dx = cx * 16 + 8 - camPos.x, dz = cz * 16 + 8 - camPos.z; if (dx * dx + dz * dz > (R + 12) * (R + 12)) continue;
      const ch = this.chunk(cx, cz);
      for (let s = s0; s <= s1; s++) {
        if (!ch.secCount[s]) continue;
        const key = cx + ',' + s + ',' + cz; want.add(key);
        let e = this.sections.get(key);
        if (!e) {
          const m = this.meshSection(cx, s, cz); e = { solid: null, water: null };
          const org = [cx * 16, YMIN + s * 16, cz * 16];
          if (m.solid) { e.solid = new THREE.Mesh(m.solid, this.voxMat); e.solid.position.set(...org); e.solid.matrixAutoUpdate = false; e.solid.updateMatrix(); }
          if (m.water) { e.water = new THREE.Mesh(m.water, this.waterMat); e.water.position.set(...org); e.water.matrixAutoUpdate = false; e.water.updateMatrix(); e.water.renderOrder = 5; }
          this.sections.set(key, e);
        }
        if (!e.on) { if (e.solid) this.group.add(e.solid); if (e.water) this.group.add(e.water); e.on = true; }
      }
    }
    for (const [key, e] of this.sections) {
      if (want.has(key)) continue;
      if (e.on) { if (e.solid) this.group.remove(e.solid); if (e.water) this.group.remove(e.water); e.on = false; }
      if (this.sections.size > 2400) { if (e.solid) e.solid.geometry.dispose(); if (e.water) e.water.geometry.dispose(); this.sections.delete(key); }
    }
  }
}

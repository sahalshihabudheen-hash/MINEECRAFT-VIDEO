// Analytic terrain: surface height, carve functions (cavern, sinkhole, ascent shaft), strata. Fully deterministic.
import { clamp, lerp, smoothstep, fbm2, noise2, noise3, hash2, hash3 } from '../core/util.js';
import { Y0, SEA, YMIN, CAVERN, SINK, POOL, SHAFT, shaftAxis, LOWLAND, RIVER, ROAD } from './layout.js';

const hyp = Math.hypot;

export function riverDist(x, z) { return Math.abs(x - RIVER(z)) * 0.93; }

// natural surface height (before sinkhole/shaft carving)
export function baseHeight(x, z) {
  const d = hyp(x - LOWLAND.x, z - LOWLAND.z);
  const A = smoothstep(95, 340, d);
  const hills = fbm2(x / 150, z / 150, 3, 11) * 11 + fbm2(x / 48, z / 48, 2, 23) * 2.6;
  const rid = 1 - Math.abs(fbm2(x / 185 + 9, z / 185 - 4, 4, 5)) * 2.2;
  const mount = Math.pow(clamp(rid, 0, 1), 1.55) * 122 + fbm2(x / 62, z / 62, 3, 31) * 14;
  const peaks = Math.pow(clamp(fbm2(x / 95 - 3, z / 95 + 8, 3, 41) * 0.5 + 0.5, 0, 1), 3) * 38 * A;
  let h = 75 + hills * (1 - 0.55 * A) + A * (mount * 0.82 + peaks + 6);
  // river valley
  const rd = riverDist(x, z);
  const rw = 6.5 + 2.5 * Math.sin(z / 37);
  const rmask = 1 - smoothstep(0, 1, 0); // placeholder (kept for readability)
  if (rd < rw + 16) {
    const t = smoothstep(rw + 16, rw, rd);          // 0 far .. 1 centre
    const bed = SEA - 3 - 2 * (1 - clamp(rd / rw, 0, 1));
    const bankTarget = lerp(h, SEA + 1.2, smoothstep(rw + 16, rw + 2, rd));
    h = lerp(h, Math.min(bankTarget, h), t);
    if (rd < rw) h = lerp(h, bed, smoothstep(rw, rw * 0.35, rd));
  }
  return Math.round(h);
}

// footprint-aware "top solid" estimate used for sky light / sun shadows
export function columnTop(x, z) {
  if (hyp(x - SINK.x, z - SINK.z) < sinkRadius(Y0 + 60) - 2) return Y0 + 2;
  const a = shaftAxis(60); if (hyp(x - a.x, z - a.z) < 5.5) return Y0 + 2;
  return baseHeight(x, z);
}

export function sinkRadius(y) {   // vast, slightly wobbly shaft; funnel flare near the surface
  const flare = 1 + 0.55 * smoothstep(52, 80, y);
  return (SINK.r + 3.2 * Math.sin(y * 0.071 + 1.1) + 2 * Math.sin(y * 0.19)) * flare;
}

// ---- cavern (Ancient City hall) -------------------------------------------------------
function cavernCeiling(rn) { return Y0 + 9 + CAVERN.h * Math.sqrt(Math.max(0, 1 - Math.pow(rn, 2.3))); }

export function floorBump(x, z) {   // keeps the city area flat (y = Y0) and gives the outskirts relief
  const r = hyp(x, z);
  const t = smoothstep(112, 138, r);
  return Math.round(t * (fbm2(x / 17, z / 17, 3, 61) * 3.2 + 2.6));
}

// returns true if (x,y,z) is open air inside the great cavern / lake bowl
export function inCavern(x, y, z) {
  if (y < Y0 - 14 || y > Y0 + CAVERN.h + 14) return false;
  const r = hyp(x, z); if (r > CAVERN.r * 1.18) return false;
  const rn = r / CAVERN.r + noise2(x / 29, z / 29, 5) * 0.075 + noise2(x / 9, z / 9, 6) * 0.012;
  if (rn < 1) {
    let ceil = cavernCeiling(rn) + noise2(x / 13, z / 13, 7) * 2.2;
    const floor = Y0 + floorBump(x, z);
    if (y >= floor && y <= ceil) {
      // stalactites hanging from the ceiling
      const cx = Math.floor(x / 8), cz = Math.floor(z / 8);
      if (hash2(cx, cz, 19) < 0.22) {
        const px = cx * 8 + 2 + hash2(cx, cz, 20) * 4, pz = cz * 8 + 2 + hash2(cx, cz, 21) * 4;
        const L = 4 + hash2(cx, cz, 22) * 11, depth = ceil - y;
        if (depth >= -1 && depth < L && hyp(x + 0.5 - px, z + 0.5 - pz) < (1 - depth / L) * 2.8 + 0.2) return false;
      }
      // stalagmites outside the city
      if (r > 118 && hash2(cx, cz, 29) < 0.2) {
        const px = cx * 8 + 2 + hash2(cx, cz, 30) * 4, pz = cz * 8 + 2 + hash2(cx, cz, 31) * 4;
        const L = 3 + hash2(cx, cz, 32) * 7, h = y - floor;
        if (h < L && hyp(x + 0.5 - px, z + 0.5 - pz) < (1 - h / L) * 2.4 + 0.2) return false;
      }
      return true;
    }
  }
  // lake bowl carved into the floor
  const pr = hyp(x - POOL.x, z - POOL.z);
  const pn = pr + noise2(x / 7, z / 7, 8) * 1.8;
  if (y < Y0 && y >= Y0 - 11 && pn < POOL.r * (0.55 + 0.45 * ((y - (Y0 - 11)) / 11) ** 0.6)) return true;
  return false;
}

// vast sinkhole from the surface into the cavern roof
export function inSinkhole(x, y, z) {
  if (y < Y0 + 20 || y > 140) return false;
  const rr = sinkRadius(y); const d = hyp(x - SINK.x, z - SINK.z);
  if (d > rr + 6) return false;
  return d < rr + noise3(x / 6, y / 8, z / 6, 70) * 3.2 + noise2(x / 3, z / 3, 71) * 0.8;
}

// narrow ascent shaft above the portal, up through the rock layers to a meadow hole
export function inAscentShaft(x, y, z) {
  if (y < Y0 + 30 || y > 130) return false;
  const a = shaftAxis(y); const d = hyp(x - a.x, z - a.z); if (d > 12) return false;
  const flare = 1 + 0.45 * smoothstep(60, 80, y);
  const r = (6.4 + 1.2 * Math.sin(y * 0.21) + noise3(x / 4, y / 6, z / 4, 81) * 1.6) * flare;
  return d < r;
}

// natural deepslate cave pocket on the route (formations are added by the structure module)
export function inDeepCave(x, y, z) {
  const cy = -14; if (y < cy - 14 || y > cy + 14) return false;
  const a = shaftAxis(cy); const dx = (x - a.x) / 21, dz = (z - a.z) / 19, dy = (y - cy) / 11;
  return dx * dx + dy * dy + dz * dz + noise3(x / 8, y / 6, z / 8, 91) * 0.28 < 1;
}

// ---- strata / ore choice -------------------------------------------------------------
export function strataBlock(B, x, y, z, depth) {
  const dsLine = 2 + noise2(x / 24, z / 24, 3) * 5;   // stone -> deepslate transition around y=0
  const deep = y < dsLine;
  const r = hash3(x, y, z, 5);
  if (!deep) {
    const n = noise3(x / 14, y / 9, z / 14, 12);
    if (n > 0.62) return B.TUFF; if (n < -0.64) return B.GRANITE; if (n > 0.46 && n < 0.52) return B.ANDESITE;
    if (r < 0.0035 && y < 52) return B.COAL_ORE; if (r < 0.0055 && y < 40) return B.IRON_ORE; if (r < 0.0062 && y < 25) return B.COPPER_ORE;
    if (r < 0.0063 && y < 8) return B.DIAMOND_ORE;
    return B.STONE;
  }
  const n = noise3(x / 13, y / 8, z / 13, 14);
  if (n > 0.66) return B.TUFF; if (n < -0.7) return B.BASALT;
  if (r < 0.004) return B.DEEP_IRON; if (r < 0.0058) return B.DEEP_COPPER; if (r < 0.0075) return B.DEEP_COAL; if (r < 0.0082) return B.DEEP_DIAMOND;
  return B.DEEPSLATE;
}

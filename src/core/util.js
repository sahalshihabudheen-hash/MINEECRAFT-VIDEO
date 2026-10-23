// Deterministic helpers: PRNG, hashing, gradient noise, easing, splines.
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const smootherstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };
export const easeInOut = (t) => t * t * (3 - 2 * t);
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t) => t * t * t;
export const remap = (x, a, b, c, d) => lerp(c, d, clamp((x - a) / (b - a), 0, 1));

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hash2(x, z, seed = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(seed | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function hash3(x, y, z, seed = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 1103515245) ^ Math.imul(z | 0, 668265263) ^ Math.imul(seed | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Smooth value noise (2D/3D) in [-1,1]
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
export function noise2(x, z, seed = 0) {
  const x0 = Math.floor(x), z0 = Math.floor(z), fx = x - x0, fz = z - z0;
  const a = hash2(x0, z0, seed), b = hash2(x0 + 1, z0, seed), c = hash2(x0, z0 + 1, seed), d = hash2(x0 + 1, z0 + 1, seed);
  const u = fade(fx), v = fade(fz);
  return (lerp(lerp(a, b, u), lerp(c, d, u), v)) * 2 - 1;
}
export function noise3(x, y, z, seed = 0) {
  const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z), fx = x - x0, fy = y - y0, fz = z - z0;
  const u = fade(fx), v = fade(fy), w = fade(fz);
  const h = (i, j, k) => hash3(x0 + i, y0 + j, z0 + k, seed);
  const x00 = lerp(h(0, 0, 0), h(1, 0, 0), u), x10 = lerp(h(0, 1, 0), h(1, 1, 0), u);
  const x01 = lerp(h(0, 0, 1), h(1, 0, 1), u), x11 = lerp(h(0, 1, 1), h(1, 1, 1), u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w) * 2 - 1;
}
export function fbm2(x, z, oct = 4, seed = 0, lac = 2, gain = 0.5) {
  let a = 1, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise2(x * f, z * f, seed + i * 101); n += a; a *= gain; f *= lac; }
  return s / n;
}
export function fbm3(x, y, z, oct = 3, seed = 0) {
  let a = 1, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise3(x * f, y * f, z * f, seed + i * 77); n += a; a *= 0.5; f *= 2; }
  return s / n;
}

// Catmull-Rom (uniform) for arrays of numbers
export function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
// Keyframe track over time with Catmull-Rom smoothing. keys: [{t, v:[...]}]
export function sampleTrack(keys, t, ease = null) {
  if (t <= keys[0].t) return keys[0].v.slice();
  const n = keys.length;
  if (t >= keys[n - 1].t) return keys[n - 1].v.slice();
  let i = 0; while (i < n - 2 && t > keys[i + 1].t) i++;
  const k1 = keys[i], k2 = keys[i + 1], k0 = keys[Math.max(0, i - 1)], k3 = keys[Math.min(n - 1, i + 2)];
  let u = (t - k1.t) / (k2.t - k1.t); if (ease) u = ease(u);
  return k1.v.map((_, j) => catmull(k0.v[j], k1.v[j], k2.v[j], k3.v[j], u));
}

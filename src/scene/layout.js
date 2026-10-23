// Single source of truth for where everything lives in the world (blocks, +Y up).
export const YMIN = -80, YMAX = 260, HEIGHT = YMAX - YMIN;
export const SEA = 63;
export const Y0 = -70;                       // world Y of the Ancient City GLB's y=0 (cavern floor top)
export const CITY_SCALE = 30;                // GLB units -> blocks (1 block = 1/30 GLB unit)
export const CITY_CENTER = [0, 0];
export const ROAD = { x0: -9, x1: -1, topY: Y0 + 6, endZ: 108 };   // south road of the city (top surface y = Y0+6)
export const PORTAL = { x: -5, z: 56, baseY: Y0 + 6, w: 9, h: 15 };  // gateway standing on the south road
export const POOL = { x: -5, z: 126, r: 14.5, waterY: Y0 - 1 };     // underground lake where Sahal lands
export const SINK = { x: -5, z: 126, r: 17 };                       // sinkhole (vast shaft) above the lake
export const SHAFT = { x: -5, z: 56 };                              // ascent shaft axis above the portal
export const CAVERN = { r: 142, h: 44 };
export const LOWLAND = { x: -5, z: 92 };                            // centre of the flat valley that holds sinkhole+exit
export const RIVER = (z) => 78 + 30 * Math.sin(z / 62) + 13 * Math.sin(z / 23 + 1.3);  // river centreline x(z)
// vertical bands along the ascent shaft (world Y)
export const BANDS = {
  deepCave: [-25, -3], trial: [-1, 18], stronghold: [20, 41], mineshaft: [43, 55], soil: [55, 80]
};
// the shaft axis wanders a little with height (deterministic)
export const shaftAxis = (y) => ({ x: SHAFT.x + 3.2 * Math.sin(y / 17 + 0.6), z: SHAFT.z + 2.6 * Math.cos(y / 14) });
// fixed sun used for baked sun-visibility (morning sun, low enough for long mountain shadows)
export const SUN_DIR = (() => { const v = [0.62, 0.56, -0.40]; const l = Math.hypot(...v); return v.map((c) => c / l); })();

// Block registry, texture atlas (built from the real Minecraft texture pack), UV mapping and special-block geometry info.
import * as THREE from 'three';

export const TEX_ROOT = '/assets/textures/';
export const TILE = 16;           // pixels per tile
export const ATLAS_TILES = 16;    // tiles per row/col  => 256x256 atlas

// ---- block ids -----------------------------------------------------------
const names = [
  'AIR', 'STONE', 'DIRT', 'GRASS', 'DEEPSLATE', 'COBBLED_DEEPSLATE', 'SCULK', 'SAND', 'GRAVEL', 'WATER', 'LOG', 'LEAVES', 'SNOW',
  'STONE_BRICKS', 'CRACKED_SB', 'MOSSY_SB', 'CHISELED_SB', 'DEEPSLATE_BRICKS', 'DEEPSLATE_TILES', 'POLISHED_DEEPSLATE', 'REINFORCED',
  'TUFF', 'TUFF_BRICKS', 'CHISELED_TUFF', 'POLISHED_TUFF', 'COPPER', 'CUT_COPPER', 'EXPOSED_CUT', 'WEATHERED_CUT', 'OXIDIZED_CUT',
  'COPPER_BULB', 'COPPER_GRATE', 'PLANKS', 'BOOKSHELF', 'OBSIDIAN', 'COAL_ORE', 'IRON_ORE', 'COPPER_ORE', 'DIAMOND_ORE', 'DRIPSTONE',
  'CALCITE', 'MOSS', 'MUD', 'GRANITE', 'ANDESITE', 'BASALT', 'SPAWNER', 'VAULT', 'GLOWSTONE', 'SCULK_CATALYST', 'COBBLE', 'MOSSY_COBBLE',
  'DEEP_COAL', 'DEEP_IRON', 'DEEP_COPPER', 'DEEP_DIAMOND', 'CHISELED_COPPER', 'OXIDIZED_COPPER', 'WEATHERED_COPPER', 'EXPOSED_COPPER',
  'STRIPPED_LOG', 'DARK_LOG', 'DARK_PLANKS', 'AMETHYST', 'CLAY', 'WOOL',
  // specials (non-cube)
  'RAIL', 'FENCE', 'TORCH', 'SOUL_LANTERN', 'COBWEB', 'SHORT_GRASS', 'LADDER', 'PORTAL', 'RAIL_X'
];
export const B = {};
names.forEach((n, i) => { B[n] = i; });
export const BLOCK_COUNT = names.length;

// Texture names per face: [top, bottom, side] (or single string). Baked-tint tiles use 'name@tint'.
const T = {
  STONE: 'stone', DIRT: 'dirt', GRASS: ['grass_top_t', 'dirt', 'grass_side_t'], DEEPSLATE: ['deepslate_top', 'deepslate_top', 'deepslate'],
  COBBLED_DEEPSLATE: 'cobbled_deepslate', SCULK: 'sculk', SAND: 'sand', GRAVEL: 'gravel', WATER: 'water_still_t', LOG: ['oak_log_top', 'oak_log_top', 'oak_log'],
  LEAVES: 'oak_leaves_t', SNOW: 'snow', STONE_BRICKS: 'stone_bricks', CRACKED_SB: 'cracked_stone_bricks', MOSSY_SB: 'mossy_stone_bricks',
  CHISELED_SB: 'chiseled_stone_bricks', DEEPSLATE_BRICKS: 'deepslate_bricks', DEEPSLATE_TILES: 'deepslate_tiles', POLISHED_DEEPSLATE: 'polished_deepslate',
  REINFORCED: ['reinforced_deepslate_top', 'reinforced_deepslate_bottom', 'reinforced_deepslate_side'], TUFF: 'tuff', TUFF_BRICKS: 'tuff_bricks',
  CHISELED_TUFF: ['chiseled_tuff_top', 'chiseled_tuff_top', 'chiseled_tuff'], POLISHED_TUFF: 'polished_tuff', COPPER: 'copper_block', CUT_COPPER: 'cut_copper',
  EXPOSED_CUT: 'exposed_cut_copper', WEATHERED_CUT: 'weathered_cut_copper', OXIDIZED_CUT: 'oxidized_cut_copper', COPPER_BULB: 'copper_bulb_lit',
  COPPER_GRATE: 'copper_grate', PLANKS: 'oak_planks', BOOKSHELF: ['oak_planks', 'oak_planks', 'bookshelf'], OBSIDIAN: 'obsidian', COAL_ORE: 'coal_ore',
  IRON_ORE: 'iron_ore', COPPER_ORE: 'copper_ore', DIAMOND_ORE: 'diamond_ore', DRIPSTONE: 'dripstone_block', CALCITE: 'calcite', MOSS: 'moss_block', MUD: 'mud',
  GRANITE: 'granite', ANDESITE: 'andesite', BASALT: 'smooth_basalt', SPAWNER: 'trial_spawner_side_active', VAULT: ['vault_top', 'vault_bottom', 'vault_side_on'],
  GLOWSTONE: 'glowstone', SCULK_CATALYST: ['sculk_catalyst_top', 'sculk_catalyst_bottom', 'sculk_catalyst_side'], COBBLE: 'cobblestone', MOSSY_COBBLE: 'mossy_cobblestone',
  DEEP_COAL: 'deepslate_coal_ore', DEEP_IRON: 'deepslate_iron_ore', DEEP_COPPER: 'deepslate_copper_ore', DEEP_DIAMOND: 'deepslate_diamond_ore',
  CHISELED_COPPER: 'chiseled_copper', OXIDIZED_COPPER: 'oxidized_copper', WEATHERED_COPPER: 'weathered_copper', EXPOSED_COPPER: 'exposed_copper',
  STRIPPED_LOG: ['stripped_oak_log_top', 'stripped_oak_log_top', 'stripped_oak_log'], DARK_LOG: ['dark_oak_log_top', 'dark_oak_log_top', 'dark_oak_log'],
  DARK_PLANKS: 'dark_oak_planks', AMETHYST: 'amethyst_block', CLAY: 'clay', WOOL: 'white_wool',
  RAIL: 'rail', FENCE: 'oak_planks', TORCH: 'torch', SOUL_LANTERN: 'soul_lantern', COBWEB: 'cobweb', SHORT_GRASS: 'short_grass_t', LADDER: 'ladder', PORTAL: 'nether_portal', RAIL_X: 'rail'
};

// flags
export const SPECIAL = new Set([B.RAIL_X, B.RAIL, B.FENCE, B.TORCH, B.SOUL_LANTERN, B.COBWEB, B.SHORT_GRASS, B.LADDER, B.PORTAL]);
export const isSpecial = (id) => SPECIAL.has(id);
// "opaque" = hides neighbours' faces (full cube, not water, not leaves which we treat as cutout-but-culling-opaque for speed)
const NONOPAQUE = new Set([B.AIR, B.WATER, ...SPECIAL]);
export const OPAQUE = new Uint8Array(BLOCK_COUNT).map((_, i) => (NONOPAQUE.has(i) ? 0 : 1));
// solid for collisions (water & specials are not solid; leaves solid)
export const SOLID = new Uint8Array(BLOCK_COUNT).map((_, i) => (i === B.AIR || i === B.WATER || (isSpecial(i) && i !== B.FENCE) ? 0 : 1));
// emissive light: [warm, cool, radius]
export const EMIT = {
  [B.TORCH]: [1, 0, 9], [B.SOUL_LANTERN]: [0, 1, 11], [B.GLOWSTONE]: [1, 0, 10], [B.COPPER_BULB]: [0.9, 0.2, 9],
  [B.SCULK_CATALYST]: [0, 0.8, 7], [B.PORTAL]: [0.3, 0.6, 14], [B.SPAWNER]: [0.2, 0.7, 6]
};
// self-illumination on the block's own faces (0..1) so lamps look lit
export const SELF_LIT = { [B.GLOWSTONE]: 1, [B.COPPER_BULB]: 0.9, [B.SOUL_LANTERN]: 1, [B.TORCH]: 1, [B.SCULK_CATALYST]: 0.35, [B.SPAWNER]: 0.5 };

// ---- atlas ----------------------------------------------------------------
const VEG = { grass: [0.49, 0.74, 0.33], leaves: [0.40, 0.66, 0.22], water: [0.26, 0.46, 0.93] };

function loadImage(url) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('missing texture ' + url)); im.src = url; });
}

export class Atlas {
  constructor() { this.tiles = new Map(); this.canvas = document.createElement('canvas'); this.canvas.width = this.canvas.height = TILE * ATLAS_TILES;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true }); this.ctx.imageSmoothingEnabled = false; this.next = 0; this.imgs = new Map(); this.missing = []; this.avg = []; }
  async img(path) { // path relative to TEX_ROOT without .png
    if (!this.imgs.has(path)) this.imgs.set(path, loadImage(TEX_ROOT + path + '.png').catch(() => { this.missing.push(path); return null; }));
    return this.imgs.get(path);
  }
  // draw first TILExTILE frame of an image to a temp canvas, optionally tinted
  async frame(path, tint = null, overlayPath = null, frameIndex = 0) {
    const c = document.createElement('canvas'); c.width = c.height = TILE; const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingEnabled = false;
    const im = await this.img(path); if (!im) { x.fillStyle = '#ff00ff'; x.fillRect(0, 0, TILE, TILE); return c; }
    x.drawImage(im, 0, frameIndex * im.width, im.width, im.width, 0, 0, TILE, TILE);
    const tintIt = (ctx) => { if (!tint) return; const d = ctx.getImageData(0, 0, TILE, TILE); for (let i = 0; i < d.data.length; i += 4) { d.data[i] *= tint[0]; d.data[i + 1] *= tint[1]; d.data[i + 2] *= tint[2]; } ctx.putImageData(d, 0, 0); };
    tintIt(x);
    if (overlayPath) { const ov = await this.img(overlayPath); if (ov) { const c2 = document.createElement('canvas'); c2.width = c2.height = TILE; const x2 = c2.getContext('2d', { willReadFrequently: true }); x2.imageSmoothingEnabled = false; x2.drawImage(ov, 0, 0, ov.width, ov.width, 0, 0, TILE, TILE); tintIt(x2); x.drawImage(c2, 0, 0); } }
    return c;
  }
  async add(key, path, tint, overlay, frameIndex) {
    if (this.tiles.has(key)) return this.tiles.get(key);
    const idx = this.next++; const tx = idx % ATLAS_TILES, ty = Math.floor(idx / ATLAS_TILES);
    const f = await this.frame(path, tint, overlay, frameIndex); this.ctx.drawImage(f, tx * TILE, ty * TILE);
    // average colour (for LOD terrain)
    const d = f.getContext('2d').getImageData(0, 0, TILE, TILE).data; let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 20) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    this.avg[idx] = n ? [r / n / 255, g / n / 255, b / n / 255] : [0.5, 0.5, 0.5];
    this.tiles.set(key, idx); return idx;
  }
  async build() {
    const special = {
      grass_top_t: ['block/grass_block_top', VEG.grass], grass_side_t: ['block/grass_block_side', null, 'block/grass_block_side_overlay', VEG.grass],
      oak_leaves_t: ['block/oak_leaves', VEG.leaves], water_still_t: ['block/water_still', VEG.water], short_grass_t: ['block/short_grass', VEG.grass]
    };
    const wanted = new Set(); Object.values(T).forEach((v) => (Array.isArray(v) ? v : [v]).forEach((n) => wanted.add(n)));
    for (const key of wanted) {
      if (special[key]) { const [p, tint, ov, ovTint] = special[key];
        if (key === 'grass_side_t') { await this.add(key, p, null, ov, 0); /* side overlay tinted below */ 
          const idx = this.tiles.get(key); const tx = idx % ATLAS_TILES, ty = Math.floor(idx / ATLAS_TILES);
          const base = await this.frame(p), over = await this.frame(ov, ovTint); this.ctx.clearRect(tx * TILE, ty * TILE, TILE, TILE); this.ctx.drawImage(base, tx * TILE, ty * TILE); this.ctx.drawImage(over, tx * TILE, ty * TILE); }
        else await this.add(key, p, tint, null, 0);
      } else if (key === 'sculk') await this.add(key, 'block/sculk', null, null, 0);
      else if (key === 'nether_portal') await this.add(key, 'block/nether_portal', null, null, 0);
      else await this.add(key, 'block/' + key, null, null, 0);
    }
    // item textures used elsewhere
    this.texture = new THREE.CanvasTexture(this.canvas); this.texture.magFilter = THREE.NearestFilter; this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false; this.texture.colorSpace = THREE.SRGBColorSpace; this.texture.flipY = false; this.texture.needsUpdate = true;
    // per block face tile table
    this.faceTile = []; // [blockId] -> [top,bottom,side]
    for (let i = 0; i < BLOCK_COUNT; i++) { const nm = names[i]; const t = T[nm]; if (!t) { this.faceTile[i] = [0, 0, 0]; continue; }
      const a = Array.isArray(t) ? t : [t, t, t]; this.faceTile[i] = a.map((k) => this.tiles.get(k) ?? 0); }
    this.blockAvg = this.faceTile.map((ft) => this.avg[ft[0]] || [0.5, 0.5, 0.5]);
    return this;
  }
  // uv rect of tile idx (flipY=false => v grows downwards like canvas)
  uvRect(idx) { const e = 0.0006, s = 1 / ATLAS_TILES; const tx = idx % ATLAS_TILES, ty = Math.floor(idx / ATLAS_TILES); return [tx * s + e, ty * s + e, (tx + 1) * s - e, (ty + 1) * s - e]; }
}
export { names as BLOCK_NAMES };

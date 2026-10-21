// The five stretches of a run. Swanston St always comes first; after that the
// other four come in random order (see Run.nextZone). Everything here is
// procedural, so every zone is ready the moment the run starts.
//
// A zone sets the sky, fog and lighting, the ground, the shopfronts, the
// street furniture and the landmark that closes the view.

import { W, H, S, hex, mix, scale, hsh } from './gfx.js';
import { EMIS, Scene } from './render.js';

const c = hex;
const fm = (a, m) => ((a % m) + m) % m;

export const LANES = [-3, 0, 3];

// time, set once a frame, for anything that moves (the river)
export const clock = { t: 0 };

// --- ground --------------------------------------------------------------------------------

const PAVE = c('#c4bcae'), TRACK = c('#8a8680'), RAIL = c('#d4d6de');
// shades of a colour for noise n in 0..1, looked up instead of scaled per pixel
const shades = (col, k0, dk) => Int32Array.from({ length: 33 }, (_, i) => scale(col, k0 + dk * (i / 32)));
const TRACK_N = shades(TRACK, 0.95, 0.08), PAVE_N = shades(PAVE, 0.92, 0.12), PAVE_JOINT = shades(PAVE, 0.92 * 0.88, 0.12 * 0.88);

function track(x, z, t, nz) {
  const lane = Math.round(x / 3);
  if (lane < -1 || lane > 1) return -1;
  const dl = x - lane * 3;
  if (Math.abs(dl) >= 0.95) return -1;
  const rw = Math.max(0.06, (t * 0.7) / 260);
  if (Math.abs(dl - 0.7175) < rw || Math.abs(dl + 0.7175) < rw) return RAIL;
  return TRACK_N[(nz * 32) | 0];
}

function paved(x, z, t) {
  const nz = hsh(Math.floor(x * 6), Math.floor(z * 6));
  const tr = track(x, z, t, nz);
  if (tr >= 0) return tr;
  return (t < 60 && (fm(x, 1.2) < 0.06 || fm(z, 0.6) < 0.05) ? PAVE_JOINT : PAVE_N)[(nz * 32) | 0];
}

const GOLD = [c('#e8c050'), c('#d2a02a'), c('#e8c050')], GROUT = c('#c88a10');

function goldTiles(x, z, t) {
  const nz = hsh(Math.floor(x * 6), Math.floor(z * 6));
  const tr = track(x, z, t, nz);
  if (tr >= 0) return tr;
  if (t < 70 && (fm(x, 0.6) < 0.05 || fm(z, 0.6) < 0.05)) return GROUT;
  const g = GOLD[Math.floor(hsh(Math.floor(x / 0.6), Math.floor(z / 0.6), 5) * 3) % 3];
  // a glint that runs along with you
  return hsh(Math.floor(x * 8), Math.floor(z * 8), 2) > 0.995 ? c('#fffbe0') : g;
}

const WATER = c('#7a5a36'), WATER_D = c('#5a4026'), WATER_L = c('#8a6a48'), FOAM = c('#f0efeb');

function river(x, z, t) {
  const zz = z + clock.t * 1.5;
  // thin ripples drifting downstream, sparser in the distance
  const n = hsh(Math.floor(x * 1.5), Math.floor(zz * 5), 9);
  if (n > (t < 40 ? 0.96 : 0.985)) return WATER_L;
  if (n < 0.015) return WATER_D;
  // the river wall's foam line
  if (Math.abs(Math.abs(x) - 6.15) < 0.15 && hsh(Math.floor(zz * 3), x > 0 ? 1 : 2) > 0.4) return FOAM;
  return WATER;
}

const FOOT = c('#a8a49c');
const footStone = (x, z) => (fm(x, 0.9) < 0.06 || fm(z, 0.9) < 0.06 ? scale(FOOT, 0.82) : FOOT);
const GRASS = c('#7cbc48'), GRASS_D = c('#6aac3c');
const footGrass = (x, z) => {
  const ax = Math.abs(x);
  if (ax < 7.0) return footStone(x, z);
  return Math.floor(z * 0.4) % 2 ? GRASS : GRASS_D;
};
const PROM = c('#bfb8ac');
const promenade = (x, z) => (fm(z, 1.8) < 0.08 ? scale(PROM, 0.85) : PROM);

// --- shopfronts ---------------------------------------------------------------------------------

export const STYLES = {
  heritage: ['#e6cfa0', '#d8b888', '#efe0c0'],
  brick: ['#a8483a', '#8e3c32', '#b85a48'],
  glass: ['#4a7890', '#3a6880', '#5a90a0'],
  deco: ['#b8e0d0', '#f0c0c8', '#f4e0a8'],
};
export const SIGNS = ['#e03040', '#2050c0', '#f0b020', '#20a080', '#e060a0', '#303030'];
const NEON = [c('#ff3ca0'), c('#30f0ff'), c('#ffd040'), c('#a060ff')];

const WIN = c('#3a4a5e'), WIN_HI = c('#8aa2b8'), GW0 = c('#2c5068'), GW1 = c('#6aa0c0');
const SHOP = c('#30384a'), SHOP_HI = c('#7088a0'), LETTER = c('#f8f4e8');
const LIT = c('#ffcf7a') | EMIS, NIGHT_WIN = c('#18202e'), SHOP_LIT = c('#c88a48') | EMIS, SHOP_TOP = c('#ffd890') | EMIS;

export function facade(seg, z, y, night) {
  const lz = z - seg.z;
  if (y >= seg.h) return -1;
  let col = seg.wall;
  const fl = Math.floor(y / 3.6), fy = y - fl * 3.6, wc = fm(lz, 2.4);
  const lit = night && hsh(fl, Math.floor(lz / 2.4), seg.i) > 0.45;
  if (fl >= 1 && fy > 1.0 && fy < 2.8 && wc > 0.6 && wc < 1.8 && y < seg.h - 1.3 &&
      !(seg.heritage && fy > 2.4 && Math.hypot(wc - 1.2, fy - 2.4) > 0.6)) {
    col = night ? (lit ? LIT : NIGHT_WIN) : fy > 2.2 ? WIN_HI : WIN;
  }
  if (seg.glass && y > 3.6 && !(fm(lz, 1.5) < 0.12 || fy < 0.18)) {
    if (night) col = hsh(fl, Math.floor(lz / 1.5), seg.i) > 0.55 ? c('#ffe0a0') | EMIS : c('#141a28');
    else col = mix(GW0, GW1, Math.min(1, (y - 3.6) / 40));
  }
  if (!seg.glass && !(col & EMIS)) {
    if (y > seg.h - 0.7) col = mix(col, 0xffffff, 0.2);
    if (Math.abs(y - (seg.h - 1.0)) < 0.12) col = scale(col, 0.7);
  }
  if (y > 0.25 && y < 2.7 && fm(lz, 4.0) > 0.4 && lz > 0.4) {
    if (night) col = y > 2.2 ? SHOP_TOP : SHOP_LIT;
    else col = fm(lz * 0.8 + y, 1.6) < 0.25 ? SHOP_HI : SHOP;
  }
  if (y >= 2.7 && y < 3.6) {
    col = seg.sign;
    if (y > 2.9 && y < 3.4 && lz > 1 && lz < 6 && hsh(lz * 3, y * 6, seg.i) > 0.5) col = night ? LETTER | EMIS : LETTER;
  }
  // neon on the upper floors at night
  if (night && seg.neon && lz > 0.8 && lz < 1.7 && y > 4.2 && y < 10 && y < seg.h - 1) {
    const ring = lz < 0.95 || lz > 1.55 || fm(y, 1.2) < 0.15;
    const glyph = hsh(lz * 4, y * 2.5, seg.i) > 0.55;
    col = ring || glyph ? NEON[seg.i % 4] | EMIS : scale(NEON[seg.i % 4], 0.25);
  }
  if (lz < 0.25 && !(col & EMIS)) col = scale(col, 0.8);
  return col;
}

// --- landmarks at the end of the street ------------------------------------------------------------

function library(x, y) {
  const wing = Math.abs(x) < 40 && y < 13;
  const port = Math.abs(x) < 11 && y < 16;
  const pedTop = 16 + 5 * (1 - Math.abs(x) / 12);
  const ped = Math.abs(x) < 12 && y >= 16 && y < pedTop;
  const drum = Math.abs(x) < 13 && y < 24;
  const dome = Math.hypot(x, (y - 24) * 1.25) < 13;
  const lantern = Math.abs(x) < 2.2 && y < 37 && y > 30;
  if (!(wing || port || ped || drum || dome || lantern)) return -1;
  if (lantern && !dome) return c('#e8e0cc');
  if (dome && !drum) {
    if (Math.abs(x) % 3.2 < 0.35) return c('#4e7a70');
    return Math.hypot(x + 4, y - 30) < 5 ? c('#a8d4c4') : c('#6e9c90');
  }
  if (ped) return Math.abs(y - pedTop) < 0.5 ? c('#c8bca4') : c('#ece2cc');
  if (port) {
    if (y >= 14) return c('#f6f0e2');
    return fm(x + 11, 2.75) < 0.8 ? c('#f6f0e2') : c('#9a9080');
  }
  if (drum && y > 16 && !wing) return c('#d8ccb4');
  const wx = fm(x + 100, 4), wy = fm(y, 6.5);
  if (wing && wx > 1.2 && wx < 2.8 && wy > 2 && wy < 5) return c('#4a5664');
  if (fm(y, 4.3) < 0.35) return c('#f6f0e2');
  return c('#e6dcc8');
}

// Parliament House: a long colonnade on a flight of steps, no dome
function parliament(x, y) {
  const ax = Math.abs(x);
  const steps = ax < 26 && y < 5 && y < 5 - Math.max(0, ax - 22);
  const body = ax < 34 && y < 20;
  const attic = ax < 24 && y >= 20 && y < 24;
  if (!(steps || body || attic)) return -1;
  if (steps && y < 5) return fm(y, 0.6) < 0.12 ? c('#c8bca4') : c('#e6dcc8');
  if (attic) return fm(y, 1.6) < 0.3 ? c('#d8ccb4') : c('#ece2cc');
  if (y > 18) return c('#f6f0e2');
  if (ax < 22 && y > 5 && y < 17) return fm(x + 22, 2.2) < 0.9 ? c('#f6f0e2') : c('#6b7c9a');
  const wx = fm(x + 100, 4);
  if (wx > 1.3 && wx < 2.7 && fm(y, 6) > 2 && fm(y, 6) < 4.5) return c('#4a5664');
  return c('#e0d4bc');
}

// the Arts Centre spire on St Kilda Rd
function spire(x, y) {
  const sx = Math.abs(x);
  const sp = y < 70 && sx < 9 * (1 - y / 72);
  const base = sx < 24 && y < 10 && sx < 24 - y;
  if (sp) {
    if (fm(y, 7) < 1.4) return c('#f4f4ff');
    if (fm(x + y, 4) < 0.8 || fm(x - y, 4) < 0.8) return c('#9aa8c0');
    return c('#d0d8e8');
  }
  if (base) return fm(y, 2.5) < 0.4 ? c('#d8ccb4') : c('#c8a888');
  if (sx < 0.15 && y < 82) return c('#9aa8c0');
  return -1;
}

const TOWERS = Array.from({ length: 40 }, (_, k) => [
  (hsh(k, 1, 7) - 0.5) * 220, 6 + hsh(k, 2, 7) * 14, 12 + hsh(k, 3, 7) * 30,
]);

function skyline(night, eureka) {
  return (x, y) => {
    let col = -1;
    for (let k = 0; k < TOWERS.length; k++) {
      const [tx, tw, th] = TOWERS[k];
      if (Math.abs(x - tx) < tw / 2 && y < th) {
        const lit = fm(x - tx, 2.2) < 1.1 && fm(y, 2) < 1 && hsh(Math.floor((x - tx) / 2.2), Math.floor(y / 2), k) > 0.6;
        if (night) col = lit ? c('#ffd890') | EMIS : c('#141a2a');
        else col = scale(c('#7896b8'), 0.9 + 0.1 * (k % 3));
      }
    }
    if (eureka && Math.abs(x + 30) < 5 && y < 52) col = y > 45 ? c('#e8b840') : night ? c('#141a2a') : c('#6b7c9a');
    return col;
  };
}

// --- skies --------------------------------------------------------------------------------------------

// in screen pixels; cloud and moon positions in the zone specs are on the 320x180 layout grid
export const SKY_HOR = 58 * S, SKY_PAD = 24 * S;

function buildSky({ stops, clouds = [], seed = 1, stars = false, moon = null, cloudCols = ['#ffffff', '#b8ccf0'] }) {
  const h = H + SKY_PAD;
  const img = new Int32Array(W * h);
  const st = stops.map(([p, s]) => [p, c(s)]);
  for (let y = 0; y < h; y++) {
    const v = (y - SKY_PAD) / SKY_HOR;
    let col = st[st.length - 1][1];
    if (v <= st[0][0]) col = st[0][1];
    else for (let i = 1; i < st.length; i++) if (v <= st[i][0]) { col = mix(st[i - 1][1], st[i][1], (v - st[i - 1][0]) / (st[i][0] - st[i - 1][0])); break; }
    img.fill(col, y * W, (y + 1) * W);
  }
  if (stars)
    for (let y = 0; y < SKY_PAD + SKY_HOR * 0.7; y++)
      for (let x = 0; x < W; x++) if (hsh(x, y, 7) > 0.9985) img[y * W + x] = c('#e0e8ff');
  if (moon) {
    const [mx, my, r] = moon.map((v) => v * S);
    for (let y = my - r; y <= my + r; y++)
      for (let x = mx - r; x <= mx + r; x++) {
        const d = Math.hypot(x - mx, y - my);
        if (d <= r && Math.hypot(x - mx - r * 0.45, y - my + r * 0.2) > r * 0.8) img[(y + SKY_PAD) * W + x] = c('#fff6c8');
      }
  }
  let s = seed;
  const r = (a, b) => { s = (s * 16807) % 2147483647; return a + ((s - 1) / 2147483646) * (b - a); };
  for (let i = 0; i < 4; i++) r(0, 1);
  for (const [cx0, cy0, sc0] of clouds) {
    const cx = cx0 * S, cy = cy0 * S, sc = sc0 * S;
    const blobs = [[cx, cy, 14 * sc]];
    for (let i = 0; i < 9; i++) blobs.push([cx + r(-30, 30) * sc, cy + r(-10, 4) * sc, r(7, 15) * sc]);
    const bottom = Math.max(...blobs.map(([, by, rr]) => by + rr * 0.35));
    for (let y = 0; y < Math.min(H, bottom); y++)
      for (let x = 0; x < W; x++) {
        let inside = false, lit = false;
        for (const [bx, by, rr] of blobs) {
          if (Math.hypot(x - bx, (y - by) * 1.15) < rr) inside = true;
          if (Math.hypot(x - bx + rr * 0.15, (y - by + rr * 0.35) * 1.15) < rr * 0.92) lit = true;
        }
        if (inside && y >= 0) img[(y + SKY_PAD) * W + x] = c(lit ? cloudCols[0] : cloudCols[1]);
      }
  }
  return img;
}

const DAY = [[0, '#2f7ee6'], [0.65, '#78c0f4'], [1, '#d8f0ff']];

// --- the zones ---------------------------------------------------------------------------------------------

const PLANE = ['#3f7a34', '#7cbc48', '#b4e070', '#285024'];

export const ZONES = {
  swanston: {
    name: 'SWANSTON ST', jp: 'swanston', ground: paved, foot: footStone,
    sky: { stops: DAY, clouds: [[70, 16, 0.9], [250, 24, 1.0]], seed: 21 }, fog: '#cfe4f2', fogd: 230,
    tall: 0.65, styles: ['heritage', 'heritage', 'brick', 'glass', 'deco'], verandahs: true, verTop: ['#e8303c', '#f4f0e8'],
    trees: { leaves: 'sakura', x: 6.95, every: 17, h: 6.5 }, lanterns: true, kanban: 19, noren: true,
    landmark: library, landmarkW: 40, landmarkH: 40, trams: true,
  },
  bourke: {
    name: 'BOURKE ST', jp: 'bourke', ground: goldTiles, foot: footStone,
    sky: { stops: [[0, '#3a78e0'], [0.6, '#8cc4f0'], [1, '#ffe8c0']], clouds: [[120, 20, 1.1], [280, 12, 0.7]], seed: 33 }, fog: '#f0e4cc', fogd: 230,
    tall: 0.7, styles: ['heritage', 'brick', 'brick', 'deco', 'glass'], verandahs: true, verTop: ['#2050c0', '#f4f0e8'],
    trees: null, lanterns: true, kanban: 13, noren: true,
    landmark: parliament, landmarkW: 40, landmarkH: 26, trams: true,
  },
  stkilda: {
    name: 'ST KILDA RD', jp: 'stkilda', ground: paved, foot: footGrass,
    sky: { stops: DAY, clouds: [[90, 18, 1.0], [240, 12, 0.8]], seed: 3 }, fog: '#cfe4f2', fogd: 230,
    tall: 0.8, styles: ['glass', 'glass', 'deco', 'heritage', 'brick'], verandahs: false,
    trees: { leaves: 'plane', x: 7.6, every: 8, h: 10, both: true }, lanterns: false, kanban: 0, noren: false,
    landmark: spire, landmarkW: 30, landmarkH: 85, trams: true,
  },
  collins: {
    name: 'COLLINS ST', jp: 'collins', ground: paved, foot: footStone, night: true,
    sky: { stops: [[0, '#0c1028'], [0.7, '#1e2850'], [1, '#3a3c6a']], stars: true, moon: [250, 18, 8], clouds: [], seed: 5 },
    fog: '#1a2236', fogd: 170,
    tall: 0.9, styles: ['heritage', 'glass', 'brick', 'deco', 'glass'], verandahs: true, verTop: ['#7c1f28', '#e6cfa0'], neon: true,
    trees: { leaves: 'plane', x: 6.95, every: 15, h: 7 }, lanterns: true, kanban: 16, noren: true,
    landmark: skyline(true, false), landmarkW: 130, landmarkH: 55, trams: true,
  },
  yarra: {
    name: 'YARRA RIVER', jp: 'yarra', ground: river, foot: promenade, water: true,
    sky: { stops: DAY, clouds: [[60, 22, 0.8], [200, 14, 1.1]], seed: 11 }, fog: '#d8e8f0', fogd: 240,
    tall: 1.0, styles: ['glass', 'glass', 'deco', 'glass', 'heritage'], verandahs: false,
    trees: { leaves: 'plane', x: 7.4, every: 12, h: 8 }, lanterns: false, kanban: 0, noren: false,
    landmark: skyline(false, true), landmarkW: 130, landmarkH: 55, trams: false,
  },
};

export const SCHEDULE = ['bourke', 'stkilda', 'collins', 'yarra'];
// how long each stretch lasts: about 80 s on the streets. The river is planned at
// 20 s so that, with the last layout running over, it always stays under 30 s.
export const ZONE_SECONDS = { swanston: 80, bourke: 80, stkilda: 80, collins: 80, yarra: 20 };

/**
 * Landmarks always sit at the far end of the view, where a screen pixel covers
 * about half a metre, so they are sampled on a 0.25 m grid, each cell worked
 * out the first time it is seen.
 */
function baked(fn, hw, h, res = 0.25) {
  const nx = Math.ceil((2 * hw) / res), ny = Math.ceil(h / res);
  const grid = new Int32Array(nx * ny).fill(-2);
  return (x, y) => {
    const ix = Math.floor((x + hw) / res), iy = Math.floor(y / res);
    if (ix < 0 || iy < 0 || ix >= nx || iy >= ny) return -1;
    const i = iy * nx + ix;
    if (grid[i] === -2) grid[i] = fn((ix + 0.5) * res - hw, (iy + 0.5) * res);
    return grid[i];
  };
}

for (const [id, z] of Object.entries(ZONES)) {
  z.id = id;
  z.landmark = baked(z.landmark, z.landmarkW, z.landmarkH);
  z.skyImg = buildSky(z.sky);
  z.fogc = c(z.fog);
  z.fogk = Scene.fogTable(z.fogd);
}

/** The sky for a zone with the horizon at row hor (the camera tilts down on the road). */
export function skyFor(zone, hor) {
  const off = Math.max(0, Math.min(SKY_PAD, SKY_PAD + SKY_HOR - hor));
  return zone.skyImg.subarray(off * W, off * W + W * H);
}

// Swanston St, stylised: trams only, sakura trees, lanterns, verandahs,
// Japanese shop signs, and the State Library dome at the end of the street.
// Ported from the concept renderer's chosen direction (scene_f).

import { hex, scale, mix, hsh, jpSign, noren } from './gfx.js';
import { TAG } from './render.js';
import { LANTERN, treeSprite, COIN } from './sprites.js';

export const LANES = [-3, 0, 3];
export const XR = 6.3, XV = 7.4, XB = 10.0;
export const VIEW = 232;

const fm = (a, m) => ((a % m) + m) % m;
const c = hex;

// --- ground -------------------------------------------------------------------

const PAVE = c('#c4bcae'), TRACK = c('#8a8680'), RAIL = c('#d4d6de'), FOOT = c('#a8a49c'), KERB = c('#3c4050');

function road(x, z, t) {
  const nz = hsh(Math.floor(x * 6), Math.floor(z * 6));
  const rw = Math.max(0.06, (t * 0.7) / 260);
  for (const L of LANES) {
    const dl = x - L;
    if (Math.abs(dl) < 0.95) {
      if (Math.abs(dl - 0.7175) < rw || Math.abs(dl + 0.7175) < rw) return RAIL;
      return scale(TRACK, 0.95 + 0.08 * nz);
    }
  }
  let col = scale(PAVE, 0.92 + 0.12 * nz);
  if (t < 60 && (fm(x, 1.2) < 0.06 || fm(z, 0.6) < 0.05)) col = scale(col, 0.88);
  return col;
}

function foot(x, z) {
  return fm(x, 0.9) < 0.06 || fm(z, 0.9) < 0.06 ? scale(FOOT, 0.82) : FOOT;
}

// --- shopfronts -------------------------------------------------------------------

const STYLES = {
  heritage: ['#e6cfa0', '#d8b888', '#efe0c0'],
  brick: ['#a8483a', '#8e3c32', '#b85a48'],
  glass: ['#4a7890', '#3a6880', '#5a90a0'],
  deco: ['#b8e0d0', '#f0c0c8', '#f4e0a8'],
};
const SIGNS = ['#e03040', '#2050c0', '#f0b020', '#20a080', '#e060a0', '#303030'];
const STYLE_PICK = ['heritage', 'heritage', 'brick', 'glass', 'deco'];

class Block {
  constructor(side, seed) {
    this.side = side;
    this.seed = seed;
    this.segs = [];
    this.n = 0;
    this.zEnd = -20;
  }
  ensure(zmin, zmax) {
    while (this.zEnd < zmax) {
      const i = this.n++;
      const r = (k) => hsh(i, this.seed, k);
      const style = STYLE_PICK[Math.floor(r(1) * 5) % 5];
      const L = 7 + r(2) * 9;
      const tall = 0.65;
      const h = { heritage: 8 + r(3) * 7, brick: 7 + r(3) * 6, glass: (18 + r(3) * 16) * tall, deco: 10 + r(3) * 8 }[style] * tall;
      this.segs.push({
        i, z: this.zEnd, L, h, style, glass: style === 'glass', heritage: style === 'heritage',
        wall: c(STYLES[style][Math.floor(r(4) * 3) % 3]), sign: c(SIGNS[Math.floor(r(5) * 6) % 6]),
        ver: (style === 'heritage' || style === 'brick') && r(6) < 0.8,
      });
      this.zEnd += L;
    }
    while (this.segs.length && this.segs[0].z + this.segs[0].L < zmin) this.segs.shift();
  }
  at(z) {
    const s = this.segs;
    for (let k = s.length - 1; k >= 0; k--) if (s[k].z <= z) return s[k];
    return s[0];
  }
}

const WIN = c('#3a4a5e'), WIN_HI = c('#8aa2b8'), GW0 = c('#2c5068'), GW1 = c('#6aa0c0');
const SHOP = c('#30384a'), SHOP_HI = c('#7088a0'), LETTER = c('#f8f4e8');

function facade(seg, z, y) {
  const lz = z - seg.z;
  if (y >= seg.h) return -1;
  let col = seg.wall;
  const fl = Math.floor(y / 3.6), fy = y - fl * 3.6, wc = fm(lz, 2.4);
  if (fl >= 1 && fy > 1.0 && fy < 2.8 && wc > 0.6 && wc < 1.8 && y < seg.h - 1.3 &&
      !(seg.heritage && fy > 2.4 && Math.hypot(wc - 1.2, fy - 2.4) > 0.6)) col = fy > 2.2 ? WIN_HI : WIN;
  if (seg.glass && y > 3.6 && !(fm(lz, 1.5) < 0.12 || fy < 0.18)) col = mix(GW0, GW1, Math.min(1, (y - 3.6) / 40));
  if (!seg.glass) {
    if (y > seg.h - 0.7) col = mix(col, 0xffffff, 0.2);
    if (Math.abs(y - (seg.h - 1.0)) < 0.12) col = scale(col, 0.7);
  }
  if (y > 0.25 && y < 2.7 && fm(lz, 4.0) > 0.4 && lz > 0.4) col = fm(lz * 0.8 + y, 1.6) < 0.25 ? SHOP_HI : SHOP;
  if (y >= 2.7 && y < 3.6) {
    col = seg.sign;
    if (y > 2.9 && y < 3.4 && lz > 1 && lz < 6 && hsh(lz * 3, y * 6, seg.i) > 0.5) col = LETTER;
  }
  if (lz < 0.25) col = scale(col, 0.8);
  return col;
}

// --- State Library backdrop ---------------------------------------------------------

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

// --- props -----------------------------------------------------------------------------

const KANBAN = [
  ['ramen', '#e8303c', '#fff6e8'], ['sushi', '#f6f0e2', '#1a1020'], ['izakaya', '#4a2c1c', '#ffe8b0'],
  ['kissa', '#2d6a3e', '#f6f0e2'], ['karaoke', '#ff5aa8', '#ffffff'], ['takoyaki', '#f2a41e', '#1a1020'],
];
const KANBAN_SPR = KANBAN.map(([k, bg, fg]) => jpSign(k, bg, fg));
const NOREN_SPR = [noren('noren_ramen', '#22306a'), noren('noren_sushi', '#7c1f28')];
const TREES = Array.from({ length: 6 }, (_, i) => treeSprite(200 + i * 7));

export class Street {
  constructor() {
    this.blocks = [new Block(-1, 12), new Block(1, 13)];
    this.verTop = [c('#e8303c'), c('#f4f0e8')];
  }

  draw(s) {
    const z0 = s.cz, z1 = s.cz + VIEW;
    for (const b of this.blocks) b.ensure(z0 - 10, z1 + 20);
    // props, nearest first so the z-buffer rejects more
    for (let sg = -1; sg <= 1; sg += 2) {
      const off = sg > 0 ? 8 : 0;
      for (let k = Math.floor((z0 - off) / 17); k * 17 + off < z0 + 140; k++) {
        const z = k * 17 + off;
        if (z < z0 + 0.5) continue;
        s.sprite(TREES[Math.floor(hsh(k, sg, 3) * 6) % 6], sg * 6.95, 0.15, z, 6.5 * 0.85, TAG.OBJ);
      }
      for (let k = Math.ceil(z0 / 3.2); k * 3.2 < z0 + 70; k++) s.sprite(LANTERN, sg * 7.35, 2.35, k * 3.2, 0.42, TAG.OBJ);
      for (let k = Math.ceil((z0 - off) / 19); k * 19 + off < z0 + 90; k++) {
        const z = k * 19 + off + 2;
        if (z < z0 + 1) continue;
        const spr = KANBAN_SPR[Math.floor(hsh(k, sg, 9) * 6) % 6];
        s.sprite(spr, sg * (XB - 0.6), 3.9, z, 1.05, TAG.OBJ);
      }
      for (let k = Math.ceil(z0 / 23); k * 23 < z0 + 70; k++) {
        if (hsh(k, sg, 11) < 0.55) continue;
        s.sprite(NOREN_SPR[k & 1], sg * (XB - 1.4), 1.7, k * 23 + 5.5 + (sg > 0 ? 6 : 0), 2.3, TAG.OBJ);
      }
    }
    // verandahs over the footpath
    const up = s.cy > 3.35;
    for (const b of this.blocks) {
      const sg = b.side;
      for (const g of b.segs) {
        if (!g.ver || g.z > z0 + 140 || g.z + g.L < z0) continue;
        const za = g.z + 0.3, zb = g.z + g.L - 0.3;
        const xa = Math.min(sg * XV, sg * XB), xb = Math.max(sg * XV, sg * XB);
        const top = this.verTop;
        s.floor(3.35, xa, xb, za, zb, up ? (x, z) => (fm(z * 3, 1) < 0.5 ? top[0] : top[1]) : () => c('#2e2622'), TAG.BUILD);
        const trim = scale(g.wall, 0.6), lace = c('#efe6d4');
        s.side(sg * XV, za, zb, 2.9, 3.5, (z, y) => {
          if (y > 3.2) return trim;
          return (fm(z * 5, 1) < 0.5) !== (fm(y * 10, 1) < 0.5) ? lace : -1;
        }, TAG.BUILD);
        for (let zp = za; zp < zb; zp += 3.2) {
          const xp = sg * (XV - 0.05);
          s.front(zp, xp - 0.06, xp + 0.06, 0.15, 3.35, () => trim, TAG.BUILD);
        }
      }
    }
    // ground and walls
    s.floor(0, -XR, XR, z0, z1, road, TAG.ROAD);
    s.floor(0.15, -XB, -XR, z0, z1, foot, TAG.FOOT);
    s.floor(0.15, XR, XB, z0, z1, foot, TAG.FOOT);
    s.side(-XR, z0, z1, 0, 0.15, () => KERB, TAG.FOOT);
    s.side(XR, z0, z1, 0, 0.15, () => KERB, TAG.FOOT);
    for (const b of this.blocks) {
      let seg = null, lastZ = NaN;
      s.side(b.side * XB, z0, z1 + 10, 0, 200, (z, y) => {
        if (z !== lastZ) { seg = b.at(z); lastZ = z; }
        return facade(seg, z, y);
      }, TAG.BUILD);
    }
    // the library closes the view, always just ahead
    s.front(z0 + VIEW, -40, 40, 0, 40, library, TAG.BUILD);
    s.floor(0.16, -40, -XB, z0 + VIEW - 25, z0 + VIEW, (x, z) => (Math.floor(z * 0.5) % 2 ? c('#7cbc48') : c('#6aac3c')), TAG.FOOT);
    s.floor(0.16, XB, 40, z0 + VIEW - 25, z0 + VIEW, (x, z) => (Math.floor(z * 0.5) % 2 ? c('#7cbc48') : c('#6aac3c')), TAG.FOOT);
  }
}

// --- obstacles and pickups -----------------------------------------------------------

const BAR_DARK = c('#2a2a30'), BAR_RED = c('#e8303a'), BAR_WHITE = c('#f4f0e8'), LAMP = c('#ffb020'), LEG = c('#d8d8d8');

/** Roadworks barrier: low ones are jumped, high ones are rolled under. */
export function drawBarrier(s, b) {
  const y0 = b.high ? 1.5 : 0.55, y1 = y0 + (b.high ? 0.6 : 0.5);
  const lane = b.x;
  s.front(b.z, lane - 1.15, lane + 1.15, 0, y1 + 0.2, (a, y) => {
    const lx = a - lane;
    if (Math.hypot(Math.abs(lx) - 0.85, y - (y1 + 0.1)) < 0.11) return LAMP;
    if (y >= y0 && y < y1) return fm((lx + y) * 2.2, 1) < 0.5 ? BAR_RED : BAR_WHITE;
    if (y < y0 && Math.abs(Math.abs(lx) - 0.85) < 0.07) return LEG;
    return -1;
  }, TAG.OBJ);
  if (b.high) {
    // posts down to the ground make the gap underneath read clearly
    for (const sx of [-1, 1]) s.front(b.z + 0.01, lane + sx * 1.05 - 0.07, lane + sx * 1.05 + 0.07, 0, y0, () => BAR_DARK, TAG.OBJ);
  }
}

const RAMP = c('#8e939c'), RAMP_DARK = c('#5c606a'), RAMP_Y = c('#ffd23a'), RAMP_K = c('#24242a');

/** A boarding ramp up to a parked tram's roof. */
export function drawRamp(s, r) {
  const x0 = r.x - 1.2, x1 = r.x + 1.2;
  const sl = r.h / r.len;
  s.floor(0, x0, x1, r.z, r.z + r.len, (x, z) => {
    const lx = x - x0;
    if (lx < 0.18 || lx > 2.22) return fm(z * 1.6 + lx, 1) < 0.5 ? RAMP_Y : RAMP_K;
    return fm(z, 0.5) < 0.08 ? RAMP_DARK : RAMP;
  }, TAG.OBJ, sl, r.z);
  const tri = (z, y) => (y <= (z - r.z) * sl ? RAMP_DARK : -1);
  if (s.cx < x0) s.side(x0, r.z, r.z + r.len, 0, r.h, tri, TAG.OBJ);
  if (s.cx > x1) s.side(x1, r.z, r.z + r.len, 0, r.h, tri, TAG.OBJ);
}

export function drawCoin(s, coin, time) {
  const spin = Math.abs(Math.cos(time * 5 + coin.z * 0.7));
  s.sprite(COIN, coin.x, coin.y, coin.z, 0.55 * Math.max(0.25, spin), TAG.OBJ, { glow: true, h: 0.55 });
}

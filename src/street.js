// The street (or river) around the run, drawn zone by zone: ground, shopfronts,
// verandahs, trees, lanterns, Japanese signs, and the landmark ahead. Each
// stretch takes its look from the zone it is in (src/zones.js), so the
// changeover from one zone to the next is seamless.

import { hex, scale, hsh, jpSign, noren } from './gfx.js';
import { TAG, EMIS } from './render.js';
import { LANTERN, treeSprite, COIN_HI, BLUE_COIN_HI, SAKURA } from './sprites.js';
import { ZONES, STYLES, SIGNS, facade } from './zones.js';

export { LANES } from './zones.js';
export const XR = 6.3, XV = 7.4, XB = 10.0;
export const VIEW = 232;

const fm = (a, m) => ((a % m) + m) % m;
const c = hex;

// --- shopfront blocks, generated as the run goes, styled by zone -------------------------

class Block {
  constructor(side, seed, zoneAt) {
    Object.assign(this, { side, seed, zoneAt, segs: [], n: 0, zEnd: -20 });
  }
  ensure(zmin, zmax) {
    while (this.zEnd < zmax) {
      const i = this.n++;
      const r = (k) => hsh(i, this.seed, k);
      const zone = this.zoneAt(this.zEnd);
      const style = zone.styles[Math.floor(r(1) * 5) % 5];
      const L = 7 + r(2) * 9;
      const tall = zone.tall;
      const h = { heritage: 8 + r(3) * 7, brick: 7 + r(3) * 6, glass: (18 + r(3) * 16) * tall, deco: 10 + r(3) * 8 }[style] * tall;
      this.segs.push({
        i, z: this.zEnd, L, h, style, glass: style === 'glass', heritage: style === 'heritage',
        wall: c(STYLES[style][Math.floor(r(4) * 3) % 3]), sign: c(SIGNS[Math.floor(r(5) * 6) % 6]),
        ver: zone.verandahs && (style === 'heritage' || style === 'brick') && r(6) < 0.8,
        neon: r(7) < 0.5,
      });
      this.zEnd += L;
    }
    while (this.segs.length > 1 && this.segs[0].z + this.segs[0].L < zmin) this.segs.shift();
  }
  at(z) {
    const s = this.segs;
    for (let k = s.length - 1; k >= 0; k--) if (s[k].z <= z) return s[k];
    return s[0];
  }
}

// --- props -----------------------------------------------------------------------------------

const KANBAN = [
  ['ramen', '#e8303c', '#fff6e8'], ['sushi', '#f6f0e2', '#1a1020'], ['izakaya', '#4a2c1c', '#ffe8b0'],
  ['kissa', '#2d6a3e', '#f6f0e2'], ['karaoke', '#ff5aa8', '#ffffff'], ['takoyaki', '#f2a41e', '#1a1020'],
];
const KANBAN_SPR = KANBAN.map(([k, bg, fg]) => jpSign(k, bg, fg));
const NOREN_SPR = [noren('noren_ramen', '#22306a'), noren('noren_sushi', '#7c1f28')];
const LEAVES = { sakura: SAKURA, plane: ['#3f7a34', '#7cbc48', '#b4e070', '#285024'] };
const TREES = {
  sakura: Array.from({ length: 6 }, (_, i) => treeSprite(200 + i * 7, LEAVES.sakura)),
  plane: Array.from({ length: 6 }, (_, i) => treeSprite(400 + i * 5, LEAVES.plane)),
};
const KERB = c('#3c4050'), RIVER_WALL = c('#6b6258');

/** Grid positions k*every + off that fall inside [a, b). */
function* grid(a, b, every, off = 0) {
  for (let k = Math.ceil((a - off) / every); k * every + off < b; k++) yield [k, k * every + off];
}

export class Street {
  constructor(run) {
    this.run = run;
    const zoneAt = (z) => ZONES[run.zoneAt(z)];
    this.zoneAt = zoneAt;
    this.blocks = [new Block(-1, 12, zoneAt), new Block(1, 13, zoneAt)];
  }

  /** Zone stretches overlapping [a, b), clipped to it. */
  spans(a, b) {
    const out = [];
    for (const zn of this.run.zones) {
      const z0 = Math.max(a, zn.z0), z1 = Math.min(b, zn.z1);
      if (z1 > z0) out.push([ZONES[zn.id], z0, z1]);
    }
    return out;
  }

  draw(s) {
    const z0 = s.cz, z1 = s.cz + VIEW;
    for (const b of this.blocks) b.ensure(z0 - 10, z1 + 20);

    // props, nearest first so the z-buffer rejects more
    for (const [zone, a, b] of this.spans(z0, z0 + 140)) {
      const night = !!zone.night;
      for (let sg = -1; sg <= 1; sg += 2) {
        const tr = zone.trees;
        if (tr) {
          const off = sg > 0 ? (tr.both ? tr.every / 2 : 8) : 0;
          const set = TREES[tr.leaves];
          for (const [k, z] of grid(Math.max(a, z0 + 0.5), b, tr.every, off))
            s.sprite(set[Math.floor(hsh(k, sg, 3) * 6) % 6], sg * tr.x, 0.15, z, tr.h * 0.85, TAG.OBJ);
        }
        if (zone.lanterns)
          for (const [, z] of grid(a, Math.min(b, z0 + 70), 3.2)) s.sprite(LANTERN, sg * 7.35, 2.35, z, 0.42, TAG.OBJ, { emis: night });
        if (zone.kanban) {
          const off = sg > 0 ? 8 : 0;
          for (const [k, z] of grid(Math.max(a, z0 + 1), Math.min(b, z0 + 90), zone.kanban, off + 2))
            s.sprite(KANBAN_SPR[Math.floor(hsh(k, sg, 9) * 6) % 6], sg * (XB - 0.6), 3.9, z, 1.05, TAG.OBJ, { emis: night });
        }
        if (zone.noren)
          for (const [k, z] of grid(a, Math.min(b, z0 + 70), 23, 5.5 + (sg > 0 ? 6 : 0)))
            if (hsh(k, sg, 11) >= 0.55) s.sprite(NOREN_SPR[k & 1], sg * (XB - 1.4), 1.7, z, 2.3, TAG.OBJ);
      }
    }

    // verandahs over the footpath
    const up = s.cy > 3.35;
    for (const bl of this.blocks) {
      const sg = bl.side;
      for (const g of bl.segs) {
        if (!g.ver || g.z > z0 + 140 || g.z + g.L < z0) continue;
        const zone = this.zoneAt(g.z);
        if (!zone.verandahs) continue;
        const za = g.z + 0.3, zb = g.z + g.L - 0.3;
        const xa = Math.min(sg * XV, sg * XB), xb = Math.max(sg * XV, sg * XB);
        const top = zone.verTop.map(c);
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

    // ground and walls, one stretch per zone
    for (const [zone, a, b] of this.spans(z0, z1)) {
      s.floor(0, -XR, XR, a, b, zone.ground, TAG.ROAD);
      s.floor(0.15, -XB, -XR, a, b, zone.foot, TAG.FOOT);
      s.floor(0.15, XR, XB, a, b, zone.foot, TAG.FOOT);
      const kerb = zone.water ? () => RIVER_WALL : () => KERB;
      s.side(-XR, a, b, zone.water ? -0.5 : 0, 0.15, kerb, TAG.FOOT);
      s.side(XR, a, b, zone.water ? -0.5 : 0, 0.15, kerb, TAG.FOOT);
    }
    for (const bl of this.blocks) {
      let seg = null, lastZ = NaN, night = false;
      s.side(bl.side * XB, z0, z1 + 10, 0, 200, (z, y) => {
        if (z !== lastZ) { seg = bl.at(z); lastZ = z; night = !!this.zoneAt(z).night; }
        return facade(seg, z, y, night);
      }, TAG.BUILD);
    }

    // the landmark of the zone at the far end closes the view, always just ahead
    const far = this.zoneAt(z1);
    s.front(z1, -far.landmarkW, far.landmarkW, 0, far.landmarkH, far.landmark, TAG.BUILD);
    if (far.landmark && far.id === 'swanston') {
      const lawn = (x, z) => (Math.floor(z * 0.5) % 2 ? c('#7cbc48') : c('#6aac3c'));
      s.floor(0.16, -40, -XB, z1 - 25, z1, lawn, TAG.FOOT);
      s.floor(0.16, XB, 40, z1 - 25, z1, lawn, TAG.FOOT);
    }
  }
}

// --- obstacles and pickups -----------------------------------------------------------

const BAR_DARK = c('#2a2a30'), BAR_RED = c('#e8303a'), BAR_WHITE = c('#f4f0e8'), LAMP = c('#ffb020'), LEG = c('#d8d8d8');
const WOOD = c('#a07850'), WOOD_D = c('#5a4026'), WOOD_L = c('#c8a070');
const STEEL = c('#394151'), STEEL_L = c('#6b7c9a');

/** Roadworks barrier: low ones are jumped, high ones are rolled under. On the river:
 *  floating crates to jump, and footbridges to duck under. */
export function drawBarrier(s, b, time, night) {
  if (b.style === 'crate') return drawCrate(s, b, time);
  if (b.style === 'bridge') return drawBridge(s, b, night);
  const y0 = b.high ? 1.5 : 0.55, y1 = y0 + (b.high ? 0.6 : 0.5);
  const lane = b.x;
  const lamp = night ? LAMP | EMIS : LAMP;
  s.front(b.z, lane - 1.15, lane + 1.15, 0, y1 + 0.2, (a, y) => {
    const lx = a - lane;
    if (Math.hypot(Math.abs(lx) - 0.85, y - (y1 + 0.1)) < 0.11) return lamp;
    if (y >= y0 && y < y1) return fm((lx + y) * 2.2, 1) < 0.5 ? BAR_RED : BAR_WHITE;
    if (y < y0 && Math.abs(Math.abs(lx) - 0.85) < 0.07) return LEG;
    return -1;
  }, TAG.OBJ);
  if (b.high) {
    for (const sx of [-1, 1]) s.front(b.z + 0.01, lane + sx * 1.05 - 0.07, lane + sx * 1.05 + 0.07, 0, y0, () => BAR_DARK, TAG.OBJ);
  }
}

function drawCrate(s, b, time) {
  const bob = Math.sin(time * 2.2 + b.z) * 0.05;
  const x0 = b.x - 0.8, x1 = b.x + 0.8, top = 1.0 + bob;
  const wood = (lx, ly) => {
    if (lx < 0.1 || lx > 1.5 || ly < 0.1 || ly > top - 0.1) return WOOD_D;
    if (Math.abs(lx - 0.8 - (ly - top / 2) * 1.3) < 0.08) return WOOD_D;
    return fm(ly, 0.25) < 0.03 ? scale(WOOD, 0.85) : WOOD;
  };
  s.front(b.z, x0, x1, -0.3, top, (x, y) => wood(x - x0, y), TAG.OBJ);
  s.floor(top, x0, x1, b.z, b.z + 1.4, (x, z) => (x - x0 < 0.1 || x1 - x < 0.1 ? WOOD_D : fm(x - x0, 0.4) < 0.04 ? WOOD : WOOD_L), TAG.OBJ);
}

function drawBridge(s, b, night) {
  // one footbridge spans the river; each lane's barrier draws the same one
  if (b.x !== -3) return;
  const y0 = 1.5, y1 = 2.2;
  const rail = night ? c('#ffd98a') | EMIS : c('#f0efeb');
  s.front(b.z, -XB, XB, 0, 3.2, (x, y) => {
    if (y >= y0 && y < y1) return fm(y, 0.35) < 0.05 ? STEEL_L : STEEL;
    if (y >= y1 && y < 3.2) {
      if (y > 3.05) return rail;
      return fm(x, 1.2) < 0.08 ? STEEL : -1;
    }
    if (y < y0 && Math.abs(x) > XR - 0.4) return STEEL;
    return -1;
  }, TAG.OBJ);
  s.floor(y1, -XB, XB, b.z, b.z + 3, (x, z) => (fm(x, 0.5) < 0.05 ? c('#806247') : c('#a08066')), TAG.OBJ);
}

const RAMP = c('#8e939c'), RAMP_DARK = c('#5c606a'), RAMP_Y = c('#ffd23a'), RAMP_K = c('#24242a');

/** A boarding ramp up to a parked tram's roof (a wooden gangplank for a ferry). */
export function drawRamp(s, r) {
  const x0 = r.x - 1.2, x1 = r.x + 1.2;
  const sl = r.h / r.len;
  const plank = r.gangplank;
  s.floor(0, x0, x1, r.z, r.z + r.len, (x, z) => {
    const lx = x - x0;
    if (plank) return lx < 0.15 || lx > 2.25 ? WOOD_D : fm(z, 0.45) < 0.07 ? WOOD_D : WOOD;
    if (lx < 0.18 || lx > 2.22) return fm(z * 1.6 + lx, 1) < 0.5 ? RAMP_Y : RAMP_K;
    return fm(z, 0.5) < 0.08 ? RAMP_DARK : RAMP;
  }, TAG.OBJ, sl, r.z);
  const tri = (z, y) => (y <= (z - r.z) * sl ? (plank ? WOOD_D : RAMP_DARK) : -1);
  if (s.cx < x0) s.side(x0, r.z, r.z + r.len, 0, r.h, tri, TAG.OBJ);
  if (s.cx > x1) s.side(x1, r.z, r.z + r.len, 0, r.h, tri, TAG.OBJ);
}

const DECK = c('#b8b4ac'), DECK_D = c('#8e8a84'), PIER = c('#6b6f78');

/** A raised platform at roof height (a wooden jetty on the river), on pillars, with a yellow safety edge. */
export function drawPlatform(s, pl) {
  const x0 = pl.x - 1.2, x1 = pl.x + 1.2;
  const z0 = Math.max(pl.z0, s.cz + 0.1);
  if (z0 >= pl.z1) return;
  const jetty = pl.jetty;
  s.floor(pl.h, x0, x1, z0, pl.z1, (x, z) => {
    const lx = x - x0;
    if (lx < 0.16 || lx > 2.24) return jetty ? WOOD_D : fm(z * 1.6 + lx, 1) < 0.5 ? RAMP_Y : RAMP_K;
    if (jetty) return fm(z, 0.45) < 0.07 ? WOOD_D : WOOD;
    return fm(z, 1.5) < 0.06 ? DECK_D : DECK;
  }, TAG.OBJ);
  // the edge of the deck, and pillars every 6 m underneath
  const side = (z, y) => {
    if (y > pl.h - 0.35) return jetty ? WOOD_D : DECK_D;
    return fm(z - pl.z0, 6) < 0.5 ? (jetty ? WOOD_D : PIER) : -1;
  };
  if (s.cx < x0) s.side(x0, z0, pl.z1, jetty ? -0.5 : 0, pl.h, side, TAG.OBJ);
  if (s.cx > x1) s.side(x1, z0, pl.z1, jetty ? -0.5 : 0, pl.h, side, TAG.OBJ);
}

export function drawCoin(s, coin, time) {
  const spin = Math.abs(Math.cos(time * 5 + coin.z * 0.7));
  s.sprite(coin.blue ? BLUE_COIN_HI : COIN_HI, coin.x, coin.y, coin.z, 0.55 * Math.max(0.25, spin), TAG.OBJ, { glow: true, h: 0.55, emis: true });
}

const MAT = c('#22306a'), MAT_L = c('#3a4a9a'), RIM_R = c('#e8303c'), RIM_Y = c('#ffd23a'), SKIRT = c('#24242a');

/** A round trampoline; the mat dips when someone bounces on it. */
export function drawTrampoline(s, tr) {
  const top = 0.45 - (tr.boing || 0) * 0.2, rx = 1.0, rz = 0.9;
  s.floor(top, tr.x - rx, tr.x + rx, tr.z - rz, tr.z + rz, (x, z) => {
    const dx = (x - tr.x) / rx, dz = (z - tr.z) / rz, d = dx * dx + dz * dz;
    if (d > 1) return -1;
    if (d > 0.72) return fm(Math.atan2(dz, dx) * 2.5, 1) < 0.5 ? RIM_R : RIM_Y;
    return d < 0.12 ? MAT_L : MAT;
  }, TAG.OBJ);
  // the skirt and legs, seen from in front
  s.front(tr.z - rz * 0.55, tr.x - rx * 0.85, tr.x + rx * 0.85, 0, 0.45, (x, y) => {
    if (y > 0.3) return SKIRT;
    return Math.abs(Math.abs(x - tr.x) - rx * 0.6) < 0.06 ? SKIRT : -1;
  }, TAG.OBJ);
}

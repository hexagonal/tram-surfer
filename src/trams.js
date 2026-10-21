// Melbourne trams, ported from the concept renderer: W class (green and the
// City Circle maroon), Z class in its 1975 mustard, E class and G class.
// No pantographs, so the roofs are clear to run on.
//
// Each class has front(lx, y), side(zl, y, shade) and roof(lx, zl) textures in
// metres: lx across the tram from its left edge, zl along it from the front,
// y up from the rail.

import { hex, scale, hsh } from './gfx.js';

const c = hex;
const fm = (a, m) => ((a % m) + m) % m;

export const LIVERIES = {
  W: { body: c('#2d6a3e'), band: c('#e8c050'), door: c('#245a35'), roof: c('#6e665e'), walk: c('#8c7658') },
  Wcc: { body: c('#7c1f28'), band: c('#ead08a'), door: c('#63161e'), roof: c('#5e544e'), walk: c('#8c7658') },
  G: { body: c('#efefea'), stripe: c('#6cb02c'), roof: c('#c4c8cc') },
  Z: { body: c('#d2a02a'), band: c('#5a3c1e'), door: c('#b8861e'), roof: c('#8a847a') },
  E: { body: c('#f2f2ee'), stripe: c('#78be20'), roof: c('#c4c8cc') },
};

const K = {
  under: c('#18181c'), under2: c('#141416'), skirt: c('#34343a'), skirt2: c('#2a2a2e'),
  wheel: c('#262628'), hub: c('#8a8a8a'), glass: c('#5d7f99'), glint: c('#b8d4e6'),
  box: c('#101014'), txt: c('#fff2c0'), lampRim: c('#2a2a2a'), lamp: c('#fff6c8'),
  zskirt: c('#3a2e22'), zglass: c('#4e6e88'), zglint: c('#a8c8e0'),
  gskirt: c('#3c4048'), gglass: c('#2a3644'), gglint: c('#56708a'), gws: c('#1e2a36'), gwsg: c('#4a6478'),
  dest: c('#0c0c0e'), dot: c('#ffa828'), joint: c('#2a2c30'), head: c('#fffbe0'), headRim: c('#2a2e34'),
  eskirt: c('#34383e'), emask: c('#121418'), ews: c('#24323e'),
};

function roundTop(lx, y, Wd, Hh, r) {
  if (y <= Hh - r) return false;
  const cxr = Math.min(Math.max(lx, r), Wd - r);
  return Math.hypot(lx - cxr, y - (Hh - r)) > r;
}

function bogies(zl, y, centres, off, r, yc, ymin, half) {
  // under the floor: wheels and bogie frames, the rest is open
  for (const bc of centres) {
    for (const o of [-off, off]) {
      const d = Math.hypot(zl - (bc + o), y - yc);
      if (d < r * 0.35) return K.hub;
      if (d < r) return K.wheel;
    }
    if (Math.abs(zl - bc) < half && y > ymin) return K.under2;
  }
  return -1;
}

// --- W class ---------------------------------------------------------------

function wFront(lx, y, L) {
  const Wd = 2.7, Hh = 3.2;
  if (roundTop(lx, y, Wd, Hh, 0.35)) return -1;
  if (y < 0.35) return lx < 0.4 || lx > Wd - 0.4 ? -1 : K.under;
  const d = Math.hypot(lx - Wd / 2, y - 1.0);
  if (d < 0.14) return K.lamp;
  if (d < 0.2) return K.lampRim;
  if (y < 0.52) return K.skirt;
  if (y >= 1.35 && y < 1.55) return L.band;
  if (y >= 1.75 && y < 2.6 && ((lx > 0.18 && lx < 0.85) || (lx > 0.95 && lx < 1.75) || (lx > 1.85 && lx < 2.52)))
    return fm(lx * 1.3 + y * 0.9, 1) < 0.2 ? K.glint : K.glass;
  if (y >= 2.66 && y < 2.76) return L.band;
  if (y >= 2.82 && y < 3.06 && ((lx > 0.8 && lx < 1.9) || (lx > 2.0 && lx < 2.4))) {
    if (y > 2.88 && y < 3.0 && lx > 0.9 && (lx < 1.8 || lx > 2.08) && hsh(lx * 16, y * 30) > 0.5) return K.txt;
    return K.box;
  }
  return L.body;
}

function wSide(zl, y, L) {
  if (y < 0.35) return bogies(zl, y, [2.6, 11.5], 0.75, 0.3, 0.3, 0.22, 1.2);
  if (y < 0.5) return K.skirt2;
  if (y >= 3.08) return L.roof;
  if (y >= 2.66 && y < 2.76) return L.band;
  const door = (zl > 0.9 && zl < 2.1) || (zl > 6.45 && zl < 7.65) || (zl > 12.0 && zl < 13.2);
  if (door && y < 2.7) {
    if (y >= 1.7 && y < 2.55 && ((zl * 10) | 0) % 6 !== 0) return fm(zl * 0.7 + y * 0.9, 1) < 0.18 ? K.glint : K.glass;
    return L.door;
  }
  if (y >= 1.35 && y < 1.55) return L.band;
  if (y >= 1.75 && y < 2.6 && fm(zl - 0.2, 1.05) > 0.14) return fm(zl * 0.7 + y * 0.9, 1) < 0.18 ? K.glint : K.glass;
  return L.body;
}

function wRoof(lx, zl, L) {
  let col = L.roof;
  if (Math.abs(lx - 1.35) < 0.4) {
    col = L.walk;
    if (fm(zl, 0.5) < 0.05) col = scale(col, 0.75);
  } else if (fm(zl, 1.2) < 0.08) col = scale(col, 0.8);
  return scale(col, 1.1);
}

// --- Z class ---------------------------------------------------------------

function zFront(lx, y, L) {
  const Wd = 2.67, Hh = 3.4;
  if (roundTop(lx, y, Wd, Hh, 0.18)) return -1;
  if (y < 0.3) return lx < 0.4 || lx > Wd - 0.4 ? -1 : K.under;
  if (y < 0.55) return K.zskirt;
  for (const hx of [0.45, Wd - 0.45]) {
    if (Math.abs(lx - hx) < 0.16 && Math.abs(y - 0.85) < 0.09) return K.lamp;
    if (Math.abs(lx - hx) < 0.2 && Math.abs(y - 0.85) < 0.13) return K.lampRim;
  }
  if (y >= 1.15 && y < 1.27) return L.band;
  if (y >= 1.5 && y < 2.65 && lx > 0.14 && lx < Wd - 0.14) {
    if (Math.abs(lx - Wd / 2) < 0.05) return K.lampRim;
    return fm(lx * 1.2 + y * 0.9, 1) < 0.2 ? K.zglint : K.zglass;
  }
  if (y >= 2.65 && y < 2.75) return L.band;
  if (y >= 2.82 && y < 3.18 && ((lx > 0.3 && lx < 1.9) || (lx > 2.0 && lx < 2.4))) {
    if (y > 2.9 && y < 3.1 && lx > 0.4 && (lx < 1.8 || lx > 2.08) && hsh(lx * 16, y * 30) > 0.5) return K.txt;
    return K.box;
  }
  return L.body;
}

function zSide(zl, y, L) {
  if (y < 0.3) return bogies(zl, y, [3.4, 13.2], 0.85, 0.28, 0.28, 0.18, 1.3);
  if (y < 0.55) return K.zskirt;
  if (y >= 3.15) return L.roof;
  if (y >= 2.65 && y < 2.75) return L.band;
  const door = (zl > 1.0 && zl < 2.3) || (zl > 7.6 && zl < 9.0) || (zl > 14.3 && zl < 15.6);
  if (door && y < 2.7) {
    if (y >= 1.0 && y < 2.55 && Math.abs(zl - Math.round(zl * 2) / 2) > 0.04)
      return fm(zl * 0.7 + y * 0.9, 1) < 0.18 ? K.zglint : K.zglass;
    return L.door;
  }
  if (y >= 1.15 && y < 1.27) return L.band;
  if (y >= 1.5 && y < 2.6 && fm(zl - 0.3, 1.3) > 0.14) return fm(zl * 0.7 + y * 0.9, 1) < 0.18 ? K.zglint : K.zglass;
  return L.body;
}

function zRoof(lx, zl, L) {
  let col = L.roof;
  const m = fm(zl, 4.0);
  if (Math.abs(lx - 1.33) < 0.35 && m > 1.2 && m < 2.2) col = c('#6a665e');
  else if (fm(zl, 1.6) < 0.08) col = scale(col, 0.8);
  return scale(col, 1.1);
}

// --- G and E class (low-floor, articulated) ----------------------------------

function gFront(lx, y, L) {
  const Wd = 2.65, Hh = 3.45;
  if (y < 0.1 || roundTop(lx, y, Wd, Hh, 0.6)) return -1;
  for (const hx of [0.42, Wd - 0.42]) {
    const d = Math.hypot(lx - hx, y - 1.15);
    if (d < 0.11) return K.head;
    if (d < 0.16) return K.headRim;
  }
  if (y < 0.55) return K.gskirt;
  if (y >= 0.7 && y < 0.95) return L.stripe;
  const marg = 0.15 + (y - 1.35) * 0.15;
  if (y >= 1.35 && y < 2.85 && lx > marg && lx < Wd - marg) return fm(lx * 1.1 - y * 0.8, 1) < 0.12 ? K.gwsg : K.gws;
  if (y >= 2.95 && y < 3.22 && lx > 0.4 && lx < Wd - 0.4) {
    if (y > 3.0 && y < 3.17 && fm(lx * 22, 1) < 0.55 && fm(y * 40, 1) < 0.6 && hsh(lx * 8, y * 12) > 0.35) return K.dot;
    return K.dest;
  }
  return L.body;
}

function gSide(zl, y, L) {
  if (y < 0.1) return -1;
  if (y >= 3.3) return L.roof;
  for (let k = 1; k < 5; k++) if (Math.abs(zl - 6.6 * k) < 0.18) return K.joint;
  for (let k = 0; k < 5; k++) {
    const d = Math.abs(zl - (3.3 + 6.6 * k));
    if (d < 0.68 && y >= 0.45 && y < 2.75) {
      if (Math.abs(d - 0.64) < 0.05 || d < 0.03) return L.stripe;
      return fm(zl * 0.5 + y * 0.9, 1) < 0.15 ? K.gglint : K.gglass;
    }
  }
  if (y < 0.5) return K.gskirt;
  if (y >= 0.55 && y < 0.8) return L.stripe;
  if (y >= 1.05 && y < 2.6 && fm(zl, 1.5) > 0.14) return fm(zl * 0.5 + y * 0.9, 1) < 0.15 ? K.gglint : K.gglass;
  return L.body;
}

function gRoof(lx, zl, L) {
  for (let k = 1; k < 5; k++) if (Math.abs(zl - 6.6 * k) < 0.2) return c('#3a3c40');
  for (let k = 0; k < 5; k++) {
    if (Math.abs(zl - (3.3 + 6.6 * k)) < 1.2 && Math.abs(lx - 1.325) < 0.7)
      return fm(zl * 5, 1) < 0.3 ? c('#7e848a') : c('#9ea4aa');
  }
  return scale(L.roof, 1.08);
}

function eFront(lx, y, L) {
  const Wd = 2.65, Hh = 3.45;
  if (y < 0.1 || roundTop(lx, y, Wd, Hh, 0.45)) return -1;
  for (const hx of [0.3, Wd - 0.3]) if (Math.abs(lx - hx) < 0.17 && Math.abs(y - 1.32) < 0.05) return K.head;
  if (y >= 2.95 && y < 3.2 && lx > 0.35 && lx < Wd - 0.35 && fm(lx * 22, 1) < 0.55 && fm(y * 40, 1) < 0.6 && hsh(lx * 8, y * 12) > 0.35)
    return K.dot;
  const marg = 0.2 + (y - 1.4) * 0.1;
  if (y >= 1.4 && y < 2.85 && lx > marg && lx < Wd - marg) return fm(lx * 1.1 - y * 0.8, 1) < 0.12 ? K.gwsg : K.ews;
  if (y >= 1.25 && y < 3.28 && lx > 0.08 && lx < Wd - 0.08) return K.emask;
  if (y < 0.6) return K.eskirt;
  if (Math.abs(y - (0.72 + (0.4 * lx) / Wd)) < 0.11) return L.stripe;
  return L.body;
}

const E_DOORS = [2.6, 8.4, 16.5, 24.6, 30.4];

function eSide(zl, y, L) {
  if (y < 0.1) return -1;
  if (y >= 3.3) return L.roof;
  for (const j of [11.0, 22.0]) if (Math.abs(zl - j) < 0.18) return K.joint;
  for (const dc of E_DOORS) {
    const d = Math.abs(zl - dc);
    if (d < 0.68 && y >= 0.45 && y < 2.75) {
      if (Math.abs(d - 0.64) < 0.05 || d < 0.03) return L.stripe;
      return fm(zl * 0.5 + y * 0.9, 1) < 0.15 ? K.gwsg : K.ews;
    }
  }
  if (y < 0.5) return K.eskirt;
  if (y >= 1.0 && y < 2.7) return fm(zl, 1.6) > 0.12 ? (fm(zl * 0.5 + y * 0.9, 1) < 0.15 ? K.gwsg : K.ews) : K.emask;
  if (Math.abs(y - (0.72 + 0.012 * fm(zl, 11.0))) < 0.1) return L.stripe;
  return L.body;
}

export const CLASSES = {
  W: { L: 14.1, W: 2.7, H: 3.2, front: wFront, side: wSide, roof: wRoof },
  Z: { L: 16.6, W: 2.67, H: 3.4, front: zFront, side: zSide, roof: zRoof },
  E: { L: 33.5, W: 2.65, H: 3.45, front: eFront, side: eSide, roof: gRoof },
  G: { L: 33.0, W: 2.65, H: 3.45, front: gFront, side: gSide, roof: gRoof },
};

/** Draw a tram whose front is at world z = zf, centred on x = lane. */
export function drawTram(s, tram) {
  const K2 = CLASSES[tram.kind];
  const L = LIVERIES[tram.livery];
  const x0 = tram.x - K2.W / 2, x1 = tram.x + K2.W / 2;
  const zf = tram.z, Hh = K2.H;
  s.front(zf, x0, x1, 0, Hh, (a, b) => K2.front(a - x0, b, L), 4);
  if (s.cx < x0) s.side(x0, zf, zf + K2.L, 0, Hh - 0.15, (a, b) => { const v = K2.side(a - zf, b, L); return v < 0 ? v : scale(v, 0.92); }, 4);
  if (s.cx > x1) s.side(x1, zf, zf + K2.L, 0, Hh - 0.15, (a, b) => { const v = K2.side(a - zf, b, L); return v < 0 ? v : scale(v, 0.78); }, 4);
  s.floor(Hh - 0.12, x0 + 0.05, x1 - 0.05, zf + 0.2, zf + K2.L - 0.05, (a, b) => K2.roof(a - x0, b - zf, L), 4);
}

/** Side-on tram texture for 2D screens: px per metre, returns an ImageData-like sprite. */
export function tramSideSprite(kind, livery, ppm, lengthM) {
  const K2 = CLASSES[kind];
  const L = LIVERIES[livery];
  const w = Math.round((lengthM ?? K2.L) * ppm), h = Math.round(K2.H * ppm);
  const data = new Int32Array(w * h);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const y = (h - j - 0.5) / ppm, zl = (i + 0.5) / ppm;
      data[j * w + i] = K2.side(zl, y, L);
    }
  return { w, h, data };
}

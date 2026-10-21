// Framebuffer, palette, pixel font, sprites and text.
//
// Everything draws into one 320x180 buffer of 0xRRGGBB ints. At the end of a
// frame it is snapped to the 64-colour palette (no dither) and shown on a
// canvas that the page scales up with nearest-neighbour.

import { PALETTE } from './palette.js';
import { JP } from './jptext.js';

export const W = 320;
export const H = 180;

export function hex(s) {
  return parseInt(s.slice(1), 16);
}

export function mix(a, b, k) {
  const r = (a >> 16) & 255, g = (a >> 8) & 255, bl = a & 255;
  return (
    ((r + (((b >> 16) & 255) - r) * k) << 16) |
    ((g + (((b >> 8) & 255) - g) * k) << 8) |
    (bl + ((b & 255) - bl) * k)
  );
}

export function scale(c, k) {
  const r = Math.min(255, ((c >> 16) & 255) * k);
  const g = Math.min(255, ((c >> 8) & 255) * k);
  const b = Math.min(255, (c & 255) * k);
  return (r << 16) | (g << 8) | b;
}

/** Deterministic hash noise in 0..1, same idea as the concept renderer's hsh(). */
export function hsh(a, b, c = 0) {
  let v = Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul(c | 0, 83492791);
  v = Math.imul(v ^ (v >>> 13), 1274126177);
  return ((v >>> 7) & 1023) / 1023;
}

// ---------------------------------------------------------------------------
// palette snapping: a 15-bit colour -> palette lookup table

const PAL = PALETTE.map(hex);
const IDX = new Uint8Array(32768);
const LUT = new Int32Array(32768);
for (let i = 0; i < 32768; i++) {
  const r = ((i >> 10) & 31) * 8.226, g = ((i >> 5) & 31) * 8.226, b = (i & 31) * 8.226;
  let best = 0, bd = 1e9;
  for (let k = 0; k < PAL.length; k++) {
    const p = PAL[k];
    const dr = r - ((p >> 16) & 255), dg = g - ((p >> 8) & 255), db = b - (p & 255);
    const d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
    if (d < bd) { bd = d; best = k; }
  }
  IDX[i] = best;
  const p = PAL[best];
  // ImageData is RGBA bytes; on little-endian machines that is 0xAABBGGRR
  LUT[i] = 0xff000000 | ((p & 255) << 16) | (p & 0xff00) | ((p >> 16) & 255);
}

const idx15 = (c) => ((c >> 9) & 0x7c00) | ((c >> 6) & 0x3e0) | ((c >> 3) & 31);

// each palette colour's darker neighbour within the palette, for dimming the
// screen behind menus without leaving the 64 colours
const DIM = PAL.map((p) => {
  const d = scale(p, 0.42);
  let best = 0, bd = 1e9;
  PAL.forEach((q, k) => {
    const dr = ((d >> 16) & 255) - ((q >> 16) & 255), dg = ((d >> 8) & 255) - ((q >> 8) & 255), db = (d & 255) - (q & 255);
    const e = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
    if (e < bd) { bd = e; best = k; }
  });
  return PAL[best];
});

export class Frame {
  constructor() {
    this.img = new Int32Array(W * H);
  }
  present(ctx, imageData, out32) {
    const img = this.img;
    for (let i = 0; i < img.length; i++) {
      const c = img[i];
      out32[i] = LUT[idx15(c)];
    }
    ctx.putImageData(imageData, 0, 0);
  }
  fill(c) {
    this.img.fill(c);
  }
  rect(x0, y0, w, h, c) {
    const x1 = Math.min(W, x0 + w), y1 = Math.min(H, y0 + h);
    for (let y = Math.max(0, y0); y < y1; y++)
      for (let x = Math.max(0, x0); x < x1; x++) this.img[y * W + x] = c;
  }
  /** Darken/tint a rectangle towards c by alpha. */
  panel(x0, y0, w, h, c, a) {
    const x1 = Math.min(W, x0 + w), y1 = Math.min(H, y0 + h);
    for (let y = Math.max(0, y0); y < y1; y++)
      for (let x = Math.max(0, x0); x < x1; x++) {
        const i = y * W + x;
        this.img[i] = mix(this.img[i], c, a);
      }
  }
  /** Darken a rectangle using only palette colours. */
  dim(x0, y0, w, h, times = 1) {
    const x1 = Math.min(W, x0 + w), y1 = Math.min(H, y0 + h);
    for (let y = Math.max(0, y0); y < y1; y++)
      for (let x = Math.max(0, x0); x < x1; x++) {
        const i = y * W + x;
        let c = this.img[i];
        for (let k = 0; k < times; k++) c = DIM[IDX[idx15(c)]];
        this.img[i] = c;
      }
  }
  px(x, y, c) {
    if (x >= 0 && y >= 0 && x < W && y < H) this.img[(y | 0) * W + (x | 0)] = c;
  }
  /** Blit a sprite; s = integer scale; flip mirrors horizontally. */
  blit(spr, x, y, s = 1, flip = false) {
    x |= 0; y |= 0;
    const { w, h, data } = spr;
    for (let j = 0; j < h * s; j++) {
      const yy = y + j;
      if (yy < 0 || yy >= H) continue;
      const row = ((j / s) | 0) * w;
      for (let i = 0; i < w * s; i++) {
        const xx = x + i;
        if (xx < 0 || xx >= W) continue;
        const u = (i / s) | 0;
        const c = data[row + (flip ? w - 1 - u : u)];
        if (c >= 0) this.img[yy * W + xx] = c;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// sprites from ASCII art, and from canvas drawings

export function spriteFromArt(art, pal) {
  const rows = art.replace(/^\n+|\n+$/g, '').split('\n');
  const w = Math.max(...rows.map((r) => r.length));
  const h = rows.length;
  const data = new Int32Array(w * h).fill(-1);
  rows.forEach((r, j) => {
    for (let i = 0; i < r.length; i++) if (pal[r[i]]) data[j * w + i] = hex(pal[r[i]]);
  });
  return { w, h, data };
}

/** Mirror a sprite left-right. */
export function flipSprite(s) {
  const data = new Int32Array(s.w * s.h);
  for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) data[j * s.w + i] = s.data[j * s.w + s.w - 1 - i];
  return { w: s.w, h: s.h, data };
}

/**
 * Draw with the canvas 2D API, then make it pixel art: alpha is thresholded,
 * every pixel is snapped to the nearest colour actually used in the drawing
 * (so anti-aliased edges vanish), and a one-pixel outline is added.
 */
export function spriteFromCanvas(w, h, colours, draw, outline = '#140c1c') {
  const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = cv.getContext('2d');
  draw(ctx);
  const src = ctx.getImageData(0, 0, w, h).data;
  const cols = colours.map(hex);
  const data = new Int32Array(w * h).fill(-1);
  for (let i = 0; i < w * h; i++) {
    if (src[i * 4 + 3] < 128) continue;
    // un-premultiply roughly: canvas gives straight alpha in getImageData
    const r = src[i * 4], g = src[i * 4 + 1], b = src[i * 4 + 2];
    let best = cols[0], bd = 1e9;
    for (const c of cols) {
      const dr = r - ((c >> 16) & 255), dg = g - ((c >> 8) & 255), db = b - (c & 255);
      const d = dr * dr + dg * dg + db * db;
      if (d < bd) { bd = d; best = c; }
    }
    data[i] = best;
  }
  const spr = { w, h, data };
  return outline ? outlined(spr, outline) : spr;
}

export function outlined(spr, col = '#140c1c') {
  const { w, h, data } = spr;
  const oc = hex(col);
  const out = Int32Array.from(data);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (data[y * w + x] >= 0) continue;
      if ((x > 0 && data[y * w + x - 1] >= 0) || (x < w - 1 && data[y * w + x + 1] >= 0) ||
          (y > 0 && data[(y - 1) * w + x] >= 0) || (y < h - 1 && data[(y + 1) * w + x] >= 0)) out[y * w + x] = oc;
    }
  return { w, h, data: out };
}

// ---------------------------------------------------------------------------
// 3x5 pixel font (capitals), from the concept renderer

const FONT = {
  A: '.#.#.#####.##.#', B: '##.#.###.#.###.', C: '.###..#..#...##', D: '##.#.##.##.###.',
  E: '####..##.#..###', F: '####..##.#..#..', G: '.###..#.##.#.##', H: '#.##.#####.##.#',
  I: '###.#..#..#.###', J: '..#..#..##.#.#.', K: '#.##.###.#.##.#', L: '#..#..#..#..###',
  M: '#...###.###.#.##...##...#', N: '##.#.##.##.##.#', O: '.#.#.##.##.#.#.', P: '##.#.###.#..#..',
  Q: '.#.#.##.###..##', R: '##.#.###.#.##.#', S: '.###...#...###.', T: '###.#..#..#..#.',
  U: '#.##.##.##.####', V: '#.##.##.##.#.#.', W: '#...##...##.#.##.#.#.#.#.', X: '#.##.#.#.#.##.#',
  Y: '#.##.#.#..#..#.', Z: '###..#.#.#..###',
  0: '####.##.##.####', 1: '.#.##..#..#.###', 2: '##...#.#.#..###', 3: '##...#.#...###.',
  4: '#.##.####..#..#', 5: '####..##...###.', 6: '.###..####.####', 7: '###..#.#..#..#.',
  8: '####.#####.####', 9: '####.####..###.',
  x: '...#.#.#.#.#...', ':': '.....#.....#...', '-': '......###......', '.': '............#..',
  '!': '.#..#..#.....#.', '?': '##...#.#.....#.', "'": '.#..#..........', ',': '..........#.#..',
  '…': '....................#.#.#', '/': '..#..#.#..#.#..', '+': '....#.###.#....', '%': '#.#..#.#.#..#.#',
  ' ': '...............',
};
const GLYPHS = {};
for (const [ch, g] of Object.entries(FONT)) GLYPHS[ch] = { w: g.length / 5, g };

export function textWidth(s, sc = 1) {
  let w = 0;
  for (const ch of s) w += ((GLYPHS[ch] || GLYPHS[' ']).w + 1) * sc;
  return w - sc;
}

/** Pixel text with a dark outline (and a drop below), like the concept HUD. */
export function text(fr, x, y, s, col, sc = 1, outline = '#140c1c') {
  const c = hex(col), oc = outline ? hex(outline) : -1, c2 = scale(c, 0.8);
  for (let pass = outline ? 0 : 1; pass < 2; pass++) {
    let cx = x;
    for (const ch of s) {
      const G = GLYPHS[ch] || GLYPHS[' '];
      for (let j = 0; j < 5; j++)
        for (let i = 0; i < G.w; i++) {
          if (G.g[j * G.w + i] !== '#') continue;
          for (let a = 0; a < sc; a++)
            for (let b = 0; b < sc; b++) {
              const px = cx + i * sc + a, py = y + j * sc + b;
              if (pass === 0) {
                for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 2; oy++) fr.px(px + ox, py + oy, oc);
              } else fr.px(px, py, j >= 3 ? c2 : c);
            }
        }
      cx += (G.w + 1) * sc;
    }
  }
}

export function textC(fr, cx, y, s, col, sc = 1, outline) {
  text(fr, Math.round(cx - textWidth(s, sc) / 2), y, s, col, sc, outline);
}

// ---------------------------------------------------------------------------
// Japanese bitmaps (decorative)

const JPB = {};
for (const [k, v] of Object.entries(JP)) {
  const bytes = Uint8Array.from(atob(v.bits), (c) => c.charCodeAt(0));
  const bits = new Uint8Array(v.w * v.h);
  for (let i = 0; i < bits.length; i++) bits[i] = (bytes[i >> 3] >> (7 - (i & 7))) & 1;
  JPB[k] = { w: v.w, h: v.h, bits };
}
export const jpSize = (k) => JPB[k];

export function jpText(fr, x, y, key, col, sc = 1, outline = '#140c1c') {
  const b = JPB[key];
  const c = hex(col), oc = hex(outline);
  for (let pass = 0; pass < 2; pass++)
    for (let j = 0; j < b.h; j++)
      for (let i = 0; i < b.w; i++) {
        if (!b.bits[j * b.w + i]) continue;
        for (let a = 0; a < sc; a++)
          for (let d = 0; d < sc; d++) {
            const px = x + i * sc + a, py = y + j * sc + d;
            if (pass === 0) {
              for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= (sc > 1 ? 2 : 1); oy++) fr.px(px + ox, py + oy, oc);
            } else fr.px(px, py, c);
          }
      }
}

/** A Japanese bitmap as a sign sprite (background, ink, border), for kanban and noren. */
export function jpSign(key, bg, fg, pad = 3, border = '#140c1c') {
  const b = JPB[key];
  const w = b.w + 2 * pad, h = b.h + 2 * pad;
  const data = new Int32Array(w * h).fill(hex(border));
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) data[y * w + x] = hex(bg);
  for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) if (b.bits[j * b.w + i]) data[(j + pad) * w + i + pad] = hex(fg);
  return { w, h, data };
}

export function noren(key, cloth) {
  const b = JPB[key];
  const n = Math.round(b.w / 16);
  const w = n * 16 + 4, h = b.h + 10;
  const data = new Int32Array(w * h).fill(hex(cloth));
  for (let x = 0; x < w; x++) data[x] = data[w + x] = hex('#5a3a28');
  for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) if (b.bits[j * b.w + i]) data[(j + 5) * w + i + 2] = hex('#f6f0e2');
  for (let k = 1; k < n; k++) for (let y = (b.h >> 1) + 6; y < h; y++) data[y * w + 2 + k * 16 - 1] = -1;
  return { w, h, data };
}

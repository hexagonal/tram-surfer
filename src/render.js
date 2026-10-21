// A tiny Doom-style software renderer, ported from concept/render.py.
//
// The world is made of axis-aligned planes (floors, walls facing sideways,
// walls facing the camera), one kind of sloped floor for ramps, and
// billboards. Each plane is scan-converted exactly: for a floor every screen
// row is one depth, for a side wall every column is one depth, so only the
// pixels a plane covers are visited. A z-buffer sorts it all out, distance fog
// is applied as pixels are written, and objects get a one-pixel cel outline.
//
// Texture functions return a 0xRRGGBB colour, or -1 for transparent.

import { W, H, hex, mix, scale } from './gfx.js';

/** Colours with this bit set are light sources: never darkened by night, less fogged. */
export const EMIS = 0x1000000;
const NIGHT_TINT = hex('#141a2a');

export const TAG = { NONE: 0, ROAD: 1, FOOT: 2, BUILD: 3, OBJ: 4, RUNNER: 5 };

const NEAR = 0.05;
const OUTLINE = hex('#140c1c');

export class Scene {
  constructor(frame, { f = 200, hor = 58, fog = '#cfe4f2', fogd = 230 } = {}) {
    this.fr = frame;
    this.img = frame.img;
    this.f = f;
    this.hor = hor;
    this.zb = new Float32Array(W * H);
    this.tag = new Uint8Array(W * H);
    this.fogc = hex(fog);
    // fog amount by distance, in 0.25 m steps
    this.fogk = Scene.fogTable(fogd);
    this.cx = 0; this.cy = 6.4; this.cz = 0;
    // stretches of the street with their own fog and lighting (the zones):
    // [{ z0, z1, fogc, fogk, night }], looked up by each pixel's depth
    this.env = [];
  }

  static fogTable(fogd) {
    const k = new Float32Array(1601);
    for (let i = 0; i <= 1600; i++) k[i] = 1 - Math.exp(-(i * 0.25) / fogd);
    return k;
  }

  begin(cam, sky) {
    this.cx = cam.x; this.cy = cam.y; this.cz = cam.z;
    this.img.set(sky);
    this.zb.fill(Infinity);
    this.tag.fill(0);
  }

  _put(i, t, c, tag, glow) {
    let fogc = this.fogc, fogk = this.fogk, night = false;
    const z = this.cz + t;
    for (const e of this.env) if (z >= e.z0 && z < e.z1) { fogc = e.fogc; fogk = e.fogk; night = e.night; break; }
    if (c & EMIS) {
      c &= 0xffffff;
      glow = true;
    } else if (night) {
      // lamplight falls off with distance; the kid and the dingo stay readable
      const lit = tag === TAG.RUNNER ? 0.8 : Math.max(0.3, 0.66 - t / 300);
      c = mix(scale(c, lit), NIGHT_TINT, 0.12);
    }
    const k = fogk[Math.min(1600, (t * 4) | 0)];
    this.img[i] = mix(c, fogc, glow ? k * 0.4 : k);
    this.zb[i] = t;
    this.tag[i] = tag;
  }

  /**
   * Floor, optionally sloped: height y = h + s * (z - zs), for x0..x1, z0..z1.
   * tex(x, z, t).
   */
  floor(h, x0, x1, z0, z1, tex, tag = 0, s = 0, zs = 0) {
    const { f, hor, cx, cy, cz, zb } = this;
    const num = cy - h - s * (cz - zs);
    for (let row = 0; row < H; row++) {
      const dy = (row + 0.5 - hor) / f;
      const den = dy + s;
      if (den === 0) continue;
      const t = num / den;
      if (!(t > NEAR)) continue;
      const z = cz + t;
      if (z < z0 || z >= z1) continue;
      let i0 = Math.ceil(((x0 - cx) / t) * f + W / 2 - 0.5);
      let i1 = Math.ceil(((x1 - cx) / t) * f + W / 2 - 0.5);
      if (i0 < 0) i0 = 0;
      if (i1 > W) i1 = W;
      const base = row * W;
      for (let col = i0; col < i1; col++) {
        const i = base + col;
        if (t >= zb[i]) continue;
        const c = tex(cx + (t * (col + 0.5 - W / 2)) / f, z, t);
        if (c >= 0) this._put(i, t, c, tag, false);
      }
    }
  }

  /** Wall in the plane x = X, facing sideways, for z0..z1 and y0..y1. tex(z, y, t). */
  side(X, z0, z1, y0, y1, tex, tag = 0) {
    const { f, hor, cx, cy, cz, zb } = this;
    for (let col = 0; col < W; col++) {
      const dx = (col + 0.5 - W / 2) / f;
      if (dx === 0) continue;
      const t = (X - cx) / dx;
      if (!(t > NEAR)) continue;
      const z = cz + t;
      if (z < z0 || z >= z1) continue;
      let r0 = Math.ceil(((cy - y1) / t) * f + hor - 0.5);
      let r1 = Math.ceil(((cy - y0) / t) * f + hor - 0.5);
      if (r0 < 0) r0 = 0;
      if (r1 > H) r1 = H;
      for (let row = r0; row < r1; row++) {
        const i = row * W + col;
        if (t >= zb[i]) continue;
        const c = tex(z, cy - (t * (row + 0.5 - hor)) / f, t);
        if (c >= 0) this._put(i, t, c, tag, false);
      }
    }
  }

  /** Wall in the plane z = Z, facing the camera, for x0..x1 and y0..y1. tex(x, y, t). */
  front(Z, x0, x1, y0, y1, tex, tag = 0, glow = false) {
    const { f, hor, cx, cy, cz, zb } = this;
    const t = Z - cz;
    if (!(t > NEAR)) return;
    let c0 = Math.ceil(((x0 - cx) / t) * f + W / 2 - 0.5);
    let c1 = Math.ceil(((x1 - cx) / t) * f + W / 2 - 0.5);
    let r0 = Math.ceil(((cy - y1) / t) * f + hor - 0.5);
    let r1 = Math.ceil(((cy - y0) / t) * f + hor - 0.5);
    if (c0 < 0) c0 = 0;
    if (c1 > W) c1 = W;
    if (r0 < 0) r0 = 0;
    if (r1 > H) r1 = H;
    const k = t / f;
    for (let row = r0; row < r1; row++) {
      const y = cy - k * (row + 0.5 - hor);
      for (let col = c0; col < c1; col++) {
        const i = row * W + col;
        if (t >= zb[i]) continue;
        const c = tex(cx + k * (col + 0.5 - W / 2), y, t);
        if (c >= 0) this._put(i, t, c, tag, glow);
      }
    }
  }

  /** Billboard: (x, y) is the bottom centre, w its width in metres. */
  sprite(spr, x, y, z, w, tag = TAG.OBJ, { flip = false, glow = false, h = 0, emis = false } = {}) {
    const { w: sw, h: sh, data } = spr;
    const hh = h || (w * sh) / sw;
    const x0 = x - w / 2;
    this.front(z, x0, x0 + w, y, y + hh, (a, b) => {
      let u = ((a - x0) / w) * sw | 0;
      if (u < 0) u = 0; else if (u >= sw) u = sw - 1;
      if (flip) u = sw - 1 - u;
      let v = ((y + hh - b) / hh) * sh | 0;
      if (v < 0) v = 0; else if (v >= sh) v = sh - 1;
      const c = data[v * sw + u];
      return emis && c >= 0 ? c | EMIS : c;
    }, tag, glow);
  }

  /** Cel outlines where an object's silhouette meets something much further away. */
  outlines() {
    const { zb, tag, img } = this;
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (tag[i] !== TAG.OBJ) continue;
        const lim = zb[i] * 1.3 + 0.3;
        if (zb[i - 1] > lim || zb[i + 1] > lim || zb[i - W] > lim || zb[i + W] > lim) img[i] = OUTLINE;
      }
  }

  /** Project a world point to the screen: [sx, sy, t] or null if behind. */
  project(x, y, z) {
    const t = z - this.cz;
    if (t <= NEAR) return null;
    return [W / 2 + ((x - this.cx) / t) * this.f, this.hor + ((this.cy - y) / t) * this.f, t];
  }
}

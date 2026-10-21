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

import { W as FW, H as FH, S, hex, mix, scale } from './gfx.js';

/** Colours with this bit set are light sources: never darkened by night, less fogged. */
export const EMIS = 0x1000000;
const NIGHT_TINT = hex('#141a2a');

export const TAG = { NONE: 0, ROAD: 1, FOOT: 2, BUILD: 3, OBJ: 4, RUNNER: 5 };

const NEAR = 0.05;
const OUTLINE = hex('#140c1c');

export class Scene {
  constructor(frame, { fog = '#cfe4f2', fogd = 230 } = {}) {
    this.fr = frame;
    this.setDetail(1);
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

  /**
   * Render at full resolution (step 1), or at half resolution (step 2) and
   * double it up in end(), for machines that can't keep up with 640x360.
   */
  setDetail(step) {
    this.step = step;
    this.W = FW / step;
    this.H = FH / step;
    /** screen pixels per layout pixel, for the horizon row */
    this.ppx = S / step;
    this.f = 200 * this.ppx;
    this.hor = 58 * this.ppx;
    this.img = step === 1 ? this.fr.img : new Int32Array(this.W * this.H);
    this.zb = new Float32Array(this.W * this.H);
    this.tag = new Uint8Array(this.W * this.H);
  }

  /** Start a frame; sky is a full-resolution image. */
  begin(cam, sky) {
    this.cx = cam.x; this.cy = cam.y; this.cz = cam.z;
    if (this.step === 1) this.img.set(sky);
    else {
      const { W, H, step, img } = this;
      for (let y = 0; y < H; y++) for (let x = 0, o = y * step * FW; x < W; x++, o += step) img[y * W + x] = sky[o];
    }
    this.zb.fill(Infinity);
    this.tag.fill(0);
  }

  /** Finish a frame: at half resolution, copy it up into the frame. */
  end() {
    if (this.step === 1) return;
    const { W, H, img } = this, out = this.fr.img;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const c = img[y * W + x], o = 2 * y * FW + 2 * x;
        out[o] = out[o + 1] = out[o + FW] = out[o + FW + 1] = c;
      }
  }

  /**
   * Look up the fog and lighting at depth t. Every pixel of a floor row, a wall
   * column or a camera-facing wall has the same depth, so this runs once per
   * row, column or wall rather than once per pixel.
   */
  _at(t) {
    let fogc = this.fogc, fogk = this.fogk, night = false;
    const z = this.cz + t;
    for (const e of this.env) if (z >= e.z0 && z < e.z1) { fogc = e.fogc; fogk = e.fogk; night = e.night; break; }
    this.pfc = fogc;
    this.pk = fogk[Math.min(1600, (t * 4) | 0)];
    this.pnight = night;
    // lamplight falls off with distance
    this.plit = Math.max(0.3, 0.66 - t / 300);
  }

  /** Write one pixel at depth t; _at(t) must have been called for this depth. */
  _put(i, t, c, tag, glow) {
    if (c & EMIS) {
      c &= 0xffffff;
      glow = true;
    } else if (this.pnight) {
      // the kid and the dingo stay readable
      c = mix(scale(c, tag === TAG.RUNNER ? 0.8 : this.plit), NIGHT_TINT, 0.12);
    }
    const k = this.pk;
    this.img[i] = k > 0 ? mix(c, this.pfc, glow ? k * 0.4 : k) : c;
    this.zb[i] = t;
    this.tag[i] = tag;
  }

  /**
   * Floor, optionally sloped: height y = h + s * (z - zs), for x0..x1, z0..z1.
   * tex(x, z, t).
   */
  floor(h, x0, x1, z0, z1, tex, tag = 0, s = 0, zs = 0) {
    const { W, H } = this;
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
      this._at(t);
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
    const { W, H } = this;
    const { f, hor, cx, cy, cz, zb } = this;
    for (let col = 0; col < W; col++) {
      const dx = (col + 0.5 - W / 2) / f;
      if (dx === 0) continue;
      const t = (X - cx) / dx;
      if (!(t > NEAR)) continue;
      const z = cz + t;
      if (z < z0 || z >= z1) continue;
      this._at(t);
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
    const { W, H } = this;
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
    this._at(t);
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
    const { W, H } = this;
    // the same as front() with the sprite as its texture, but looking texels up
    // per row and column, since there are many of these (trees, lanterns, signs)
    const { w: sw, h: sh, data } = spr;
    const hh = h || (w * sh) / sw;
    const x0 = x - w / 2, x1 = x0 + w, y1 = y + hh;
    const { f, hor, cx, cy, cz, zb } = this;
    const t = z - cz;
    if (!(t > NEAR)) return;
    let c0 = Math.ceil(((x0 - cx) / t) * f + W / 2 - 0.5);
    let c1 = Math.ceil(((x1 - cx) / t) * f + W / 2 - 0.5);
    let r0 = Math.ceil(((cy - y1) / t) * f + hor - 0.5);
    let r1 = Math.ceil(((cy - y) / t) * f + hor - 0.5);
    if (c0 < 0) c0 = 0;
    if (c1 > W) c1 = W;
    if (r0 < 0) r0 = 0;
    if (r1 > H) r1 = H;
    if (c0 >= c1 || r0 >= r1) return;
    const k = t / f;
    const us = this._us && this._us.length >= c1 - c0 ? this._us : (this._us = new Int32Array(W));
    for (let col = c0; col < c1; col++) {
      let u = (((cx + k * (col + 0.5 - W / 2) - x0) / w) * sw) | 0;
      if (u < 0) u = 0; else if (u >= sw) u = sw - 1;
      us[col - c0] = flip ? sw - 1 - u : u;
    }
    this._at(t);
    for (let row = r0; row < r1; row++) {
      let v = (((y1 - (cy - k * (row + 0.5 - hor))) / hh) * sh) | 0;
      if (v < 0) v = 0; else if (v >= sh) v = sh - 1;
      const base = v * sw, line = row * W;
      for (let col = c0; col < c1; col++) {
        const c = data[base + us[col - c0]];
        if (c < 0) continue;
        const i = line + col;
        if (t >= zb[i]) continue;
        this._put(i, t, emis ? c | EMIS : c, tag, glow);
      }
    }
  }

  /** Cel outlines (two pixels thick at full resolution) where an object's silhouette meets something much further away. */
  outlines() {
    const { zb, tag, img, W, H, ppx: S } = this;
    for (let y = S; y < H - S; y++)
      for (let x = S; x < W - S; x++) {
        const i = y * W + x;
        if (tag[i] !== TAG.OBJ) continue;
        const lim = zb[i] * 1.3 + 0.3;
        for (let d = 1; d <= S; d++)
          if (zb[i - d] > lim || zb[i + d] > lim || zb[i - d * W] > lim || zb[i + d * W] > lim) { img[i] = OUTLINE; break; }
      }
  }

  /** Project a world point to the screen: [sx, sy, t] or null if behind. */
  project(x, y, z) {
    const { W } = this;
    const t = z - this.cz;
    if (t <= NEAR) return null;
    return [W / 2 + ((x - this.cx) / t) * this.f, this.hor + ((this.cy - y) / t) * this.f, t];
  }
}

// 2D screens: the sky, the intro animation, the start screen, the HUD, the
// pause menu and game over. Layouts follow concept/characters.py.

import { W, H, hex, mix, text, textC, textWidth, jpText, jpSize } from './gfx.js';
import { kidSprite, dingoSprite } from './characters.js';
import { tramSideSprite } from './trams.js';
import { COIN } from './sprites.js';
import { VOLUME_STEPS } from './audio.js';

const c = hex;

function lerpStops(stops, v) {
  if (v <= stops[0][0]) return c(stops[0][1]);
  for (let i = 1; i < stops.length; i++)
    if (v <= stops[i][0]) {
      const [p0, c0] = stops[i - 1], [p1, c1] = stops[i];
      return mix(c(c0), c(c1), (v - p0) / (p1 - p0));
    }
  return c(stops[stops.length - 1][1]);
}

function rng(seed) {
  let s = seed;
  for (let i = 0; i < 4; i++) s = (s * 16807) % 2147483647;
  return (a, b) => { s = (s * 16807) % 2147483647; return a + ((s - 1) / 2147483646) * (b - a); };
}

// --- sky for the 3D view ------------------------------------------------------------
// Rendered once for a horizon at row 58, with spare rows above so the camera can
// tilt down (move the horizon up) when the kid is on the road.

const SKY_HOR = 58, SKY_PAD = 24;
const skyImg = (() => {
  const h = H + SKY_PAD;
  const img = new Int32Array(W * h);
  const stops = [[0, '#2f7ee6'], [0.65, '#78c0f4'], [1, '#d8f0ff']];
  for (let y = 0; y < h; y++) {
    const v = (y - SKY_PAD) / SKY_HOR;
    img.fill(lerpStops(stops, v), y * W, (y + 1) * W);
  }
  const r = rng(21);
  for (const [cx, cy, sc] of [[70, 16, 0.9], [250, 24, 1.0]]) {
    const blobs = [[cx, cy, 14 * sc]];
    for (let i = 0; i < 9; i++) blobs.push([cx + r(-30, 30) * sc, cy + r(-10, 4) * sc, r(7, 15) * sc]);
    const bottom = Math.max(...blobs.map(([, by, rr]) => by + rr * 0.35));
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (y >= bottom) continue;
        let inside = false, lit = false;
        for (const [bx, by, rr] of blobs) {
          if (Math.hypot(x - bx, (y - by) * 1.15) < rr) inside = true;
          if (Math.hypot(x - bx + rr * 0.15, (y - by + rr * 0.35) * 1.15) < rr * 0.92) lit = true;
        }
        if (inside) img[(y + SKY_PAD) * W + x] = lit ? 0xffffff : c('#b8ccf0');
      }
  }
  return img;
})();

export function skyFor(hor) {
  const off = Math.max(0, Math.min(SKY_PAD, SKY_PAD + SKY_HOR - hor));
  return skyImg.subarray(off * W, off * W + W * H);
}

// --- overlays -------------------------------------------------------------------------

const LINES = Array.from({ length: 26 }, (_, i) => {
  const r = rng(300 + i);
  return { a: r(-0.6, Math.PI + 0.6), r0: r(0.42, 0.6), ph: r(0, 1) };
});

export function speedLines(fr, hor, time, speed) {
  const n = Math.round(10 + (speed - 13) * 1.2);
  const R = Math.hypot(W, H);
  for (let i = 0; i < Math.min(n, LINES.length); i++) {
    const L = LINES[i];
    const ph = (time * speed * 0.08 + L.ph) % 1;
    const r0 = (L.r0 * Math.min(W, H)) / 0.9 + ph * 120;
    const r1 = r0 + 30 + speed * 2;
    const ca = Math.cos(L.a), sa = Math.sin(L.a);
    for (let r = r0; r < Math.min(r1, R); r += 0.7) {
      const x = (W / 2 + ca * r) | 0, y = (hor + sa * r * 0.8) | 0;
      if (x < 0 || y < 0 || x >= W || y >= H) break;
      const i2 = y * W + x;
      fr.img[i2] = mix(fr.img[i2], 0xffffff, 0.35);
    }
  }
}

const PETALS = Array.from({ length: 60 }, (_, i) => {
  const r = rng(900 + i);
  return { x: r(0, W), y: r(0, H), vx: r(-14, -4), vy: r(8, 22), two: r(0, 1) < 0.5, w: r(0, 6.28) };
});

export function petals(fr, time, dt) {
  for (const p of PETALS) {
    p.x += (p.vx + Math.sin(time * 2 + p.w) * 6) * dt;
    p.y += p.vy * dt;
    if (p.y > H) { p.y -= H; p.x = Math.random() * W; }
    if (p.x < 0) p.x += W;
    fr.px(p.x, p.y, c('#ffc4d8'));
    if (p.two) fr.px(p.x + 1, p.y, c('#f08ab0'));
  }
}

// --- buttons --------------------------------------------------------------------------

export class Buttons {
  constructor() { this.list = []; }
  clear() { this.list = []; }
  add(x, y, w, h, action) { this.list.push({ x, y, w, h, action }); }
  hit(px, py) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      if (px >= b.x - 2 && px < b.x + b.w + 2 && py >= b.y - 2 && py < b.y + b.h + 2) return b.action;
    }
    return null;
  }
}

function button(fr, btns, x, y, w, h, label, action, col = '#ffd23a') {
  fr.dim(x, y, w, h, 2);
  fr.rect(x, y, w, 1, c(col)); fr.rect(x, y + h - 1, w, 1, c(col));
  fr.rect(x, y, 1, h, c(col)); fr.rect(x + w - 1, y, 1, h, c(col));
  textC(fr, x + w / 2, y + ((h - 5) >> 1), label, col);
  btns.add(x, y, w, h, action);
}

function iconPause(fr, x, y) {
  fr.dim(x, y, 13, 13);
  fr.rect(x + 4, y + 3, 2, 7, 0xffffff);
  fr.rect(x + 8, y + 3, 2, 7, 0xffffff);
}

function iconSound(fr, x, y, snd) {
  fr.dim(x, y, 13, 13);
  const w = 0xffffff;
  fr.rect(x + 2, y + 5, 2, 3, w);
  for (let k = 0; k < 4; k++) fr.rect(x + 4 + k, y + 4 - k + 1, 1, 3 + 2 * k - 2 + 2, w);
  if (snd.volume === 0) {
    for (let k = 0; k < 4; k++) { fr.px(x + 9 + k, y + 4 + k, c('#e8303c')); fr.px(x + 12 - k, y + 4 + k, c('#e8303c')); }
  } else {
    const bars = Math.ceil((snd.level / VOLUME_STEPS) * 3);
    for (let k = 0; k < bars; k++) fr.rect(x + 9 + k, y + 7 - k * 2 + (k ? 0 : 0) - 1, 1, 1 + k * 2 + 1, w);
  }
}

function pips(fr, x, y, snd) {
  for (let k = 0; k < VOLUME_STEPS; k++) {
    const on = !snd.muted && k < snd.level;
    fr.rect(x + k * 6, y, 5, 7, on ? c('#ffd23a') : c('#3a3640'));
  }
}

// --- HUD ----------------------------------------------------------------------------------

export function hud(fr, btns, run, snd, volFlash) {
  const score = String(Math.floor(run.score)).padStart(7, '0');
  text(fr, 4, 4, 'SCORE', '#ffffff');
  text(fr, 4, 12, score, '#ffd23a', 2);
  const mult = 'x' + run.mult;
  const mx = 4 + score.length * 8 + 4;
  fr.rect(mx - 2, 11, textWidth(mult, 2) + 4, 13, c('#e8303c'));
  text(fr, mx, 12, mult, '#ffffff', 2);
  const coins = String(run.coins).padStart(4, '0');
  const xr = W - 4 - textWidth(coins, 2);
  fr.blit(COIN, xr - 11, 7);
  text(fr, xr, 6, coins, '#ffffff', 2);
  const sz = jpSize('swanston');
  jpText(fr, ((W - sz.w) >> 1), 5, 'swanston', '#ffffff');
  textC(fr, W / 2, H - 10, 'SWANSTON ST', '#f0f0f0');
  // controls: pause and sound
  iconSound(fr, W - 33, 22, snd);
  btns.add(W - 33, 22, 13, 13, 'mute');
  iconPause(fr, W - 17, 22);
  btns.add(W - 17, 22, 13, 13, 'pause');
  if (volFlash > 0) {
    fr.dim(W - 64, 38, 60, 11);
    pips(fr, W - 62, 40, snd);
    if (snd.muted) text(fr, W - 33, 41, 'MUTE', '#e8303c');
  }
}

export function pauseMenu(fr, btns, snd) {
  fr.dim(0, 0, W, H);
  const x = 90, y = 28, w = 140, h = 124;
  fr.dim(x, y, w, h, 2);
  textC(fr, W / 2, y + 8, 'PAUSED', '#ffd23a', 2);
  const s = jpSize('pause');
  jpText(fr, (W - s.w) >> 1, y + 22, 'pause', '#ffffff');
  text(fr, x + 10, y + 46, 'SOUND', '#ffffff');
  button(fr, btns, x + 50, y + 42, 13, 13, '-', 'vol-');
  pips(fr, x + 67, y + 45, snd);
  button(fr, btns, x + 99, y + 42, 13, 13, '+', 'vol+');
  button(fr, btns, x + 20, y + 62, w - 40, 15, snd.muted ? 'UNMUTE' : 'MUTE', 'mute', '#ffffff');
  button(fr, btns, x + 20, y + 82, w - 40, 15, 'RESUME', 'resume');
  button(fr, btns, x + 20, y + 102, w - 40, 15, 'QUIT TO TITLE', 'quit', '#f0f0f0');
}

// --- game over -------------------------------------------------------------------------------

let dingoChomp = null;

export function gameOver(fr, btns, run, best, t) {
  if (!dingoChomp) dingoChomp = [dingoSprite(0.9, { pose: 'stand', mouth: 'open' }), dingoSprite(0.9, { pose: 'stand', mouth: 'shut' })];
  if (t > 0.15) fr.dim(0, 0, W, H);
  if (t < 0.3) return;
  const open = Math.floor(t * 4) % 2 === 0;
  const spr = dingoChomp[open ? 0 : 1];
  fr.blit(spr, 196, 36);
  if (open && t < 2.5) {
    text(fr, 214, 20, 'CHOMP!', '#e8303c', 3, '#ffffff');
    jpText(fr, 226, 38, 'gabu', '#e8303c', 1, '#ffffff');
  }
  text(fr, 16, 22, 'GAME OVER', '#ffd23a', 3);
  jpText(fr, 16, 42, 'gameover', '#ffffff');
  const why = { tram: 'YOU RAN INTO A TRAM!', barrier: 'YOU HIT A BARRIER!', stumble: 'THE DINGO CAUGHT UP!' }[run.crash] || '';
  text(fr, 16, 60, why, '#ffffff');
  text(fr, 16, 78, 'SCORE', '#f0f0f0');
  text(fr, 60, 76, String(Math.floor(run.score)), '#ffd23a', 2);
  text(fr, 16, 96, 'COINS', '#f0f0f0');
  fr.blit(COIN, 60, 94);
  text(fr, 72, 94, String(run.coins), '#ffffff', 2);
  text(fr, 16, 114, 'BEST', '#f0f0f0');
  text(fr, 60, 112, String(Math.floor(best)), '#ffffff', 2);
  if (run.score >= best && run.score > 0) text(fr, 16, 128, 'NEW BEST!', '#ff8a3a');
  if (t > 1.0) {
    button(fr, btns, 16, 144, 120, 17, 'RUN AGAIN', 'retry');
    button(fr, btns, 144, 144, 70, 17, 'TITLE', 'quit', '#f0f0f0');
  }
}

// --- start screen and intro --------------------------------------------------------------------

let titleArt = null;

function buildTitle() {
  const img = new Int32Array(W * H);
  for (let y = 0; y < H; y++) img.fill(mix(c('#2f7ee6'), c('#c8ecff'), y / H), y * W, (y + 1) * W);
  const r = rng(4);
  const fillR = (x0, y0, x1, y1, col) => {
    for (let y = Math.max(0, y0 | 0); y < Math.min(H, y1 | 0); y++)
      for (let x = Math.max(0, x0 | 0); x < Math.min(W, x1 | 0); x++) img[y * W + x] = col;
  };
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(r(-10, W)), w = Math.floor(r(10, 26)), h = Math.floor(r(20, 60));
    fillR(x, 100 - h, x + w, 100, c('#8ab0d8'));
  }
  fillR(262, 30, 276, 100, c('#8ab0d8'));
  fillR(262, 30, 276, 42, c('#e8b840'));
  fillR(0, 100, W, H, c('#a8c8e4'));
  for (const [cx, cy, rr] of [[200, 24, 14], [216, 18, 12], [232, 26, 11], [184, 28, 9]])
    for (let y = cy - rr; y <= cy + rr; y++)
      for (let x = cx - rr; x <= cx + rr; x++) if (Math.hypot(x - cx, y - cy) <= rr && y >= 0) img[y * W + x] = 0xffffff;
  fillR(174, 28, 245, 38, c('#c4d4f0'));
  const ground = 168, ppm = 24;
  const ws = tramSideSprite('W', 'W', ppm), zs = tramSideSprite('Z', 'Z', ppm);
  const paste = (s, x0, y0) => {
    for (let j = 0; j < s.h; j++)
      for (let i = 0; i < s.w; i++) {
        const x = x0 + i, y = y0 + j, v = s.data[j * s.w + i];
        if (v >= 0 && x >= 0 && x < W && y >= 0 && y < H) img[y * W + x] = v;
      }
  };
  paste(ws, 136 - ws.w, ground - ws.h);
  paste(zs, 196, ground - zs.h);
  fillR(0, ground, W, H, c('#c4bcae'));
  fillR(0, ground + 2, W, ground + 4, c('#d4d6de'));
  return { img, kid: [kidSprite(1, 'run'), kidSprite(1, 'run2')], dingo: [0, 0.25, 0.5, 0.75].map((ph) => dingoSprite(0.72, { phase: ph })) };
}

const STREAKS = Array.from({ length: 40 }, (_, i) => {
  const r = rng(77 + i);
  return { y: Math.floor(r(40, 160)), x: r(0, W), L: Math.floor(r(12, 40)), v: r(160, 320) };
});

function streaks(fr, t, n = 40, y0 = 0, y1 = H) {
  for (let i = 0; i < n; i++) {
    const s = STREAKS[i % STREAKS.length];
    const y = y0 + ((s.y - 40) / 120) * (y1 - y0) | 0;
    const x = ((s.x - t * s.v) % (W + 60) + W + 60) % (W + 60) - 40;
    for (let k = 0; k < s.L; k++) {
      const xx = (x + k) | 0;
      if (xx >= 0 && xx < W) fr.img[y * W + xx] = mix(fr.img[y * W + xx], 0xffffff, 0.6);
    }
  }
}

export const STORY = ['This kid is running for his life!', 'Across the tops of Melbourne trams!', 'A dingo is right behind him…'];

export function title(fr, btns, t, best) {
  if (!titleArt) titleArt = buildTitle();
  fr.img.set(titleArt.img);
  streaks(fr, t);
  const f = Math.floor(t * 8);
  const bob = f % 2;
  fr.blit(titleArt.kid[f % 2], 238, 168 - 3.4 * 24 - 52 + bob);
  fr.blit(titleArt.dingo[f % 4], 150, Math.round(168 - 3.2 * 24 - 64 - Math.abs(Math.sin(t * 4)) * 4));
  text(fr, 10, 10, 'TRAM SURFER', '#ffd23a', 3, '#1a1020');
  jpText(fr, 10, 30, 'title', '#ffffff');
  STORY.forEach((line, i) => text(fr, 10, 50 + i * 10, line.toUpperCase(), '#ffffff'));
  if (Math.floor(t * 2.2) % 2 === 0 || t < 0.5) textC(fr, W / 2 + 40, 161, 'PRESS START', '#ffd23a', 2);
  btns.add(0, 0, W, H, 'start');
  if (best > 0) text(fr, 10, 84, 'BEST ' + Math.floor(best), '#ffd23a');
  text(fr, 10, 96, 'ARROWS OR SWIPE', '#e8f4ff');
  text(fr, 10, 104, 'UP JUMP  DOWN ROLL', '#e8f4ff');
}

let introArt = null;

function stationBg() {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const d = cv.getContext('2d');
  const g = d.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2f7ee6'); g.addColorStop(1, '#c8ecff');
  d.fillStyle = g; d.fillRect(0, 0, W, H);
  const ell = (x0, y0, x1, y1, col) => { d.fillStyle = col; d.beginPath(); d.ellipse((x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2, 0, 0, 7); d.fill(); };
  const rect = (x0, y0, x1, y1, col) => { d.fillStyle = col; d.fillRect(x0, y0, x1 - x0 + 1, y1 - y0 + 1); };
  const sand = '#e0a058', cream = '#f2dcae', dark = '#4a3028', copper = '#5fa48c';
  ell(58, 22, 122, 86, copper); ell(70, 28, 94, 50, '#9ad6b8'); rect(86, 12, 94, 26, cream);
  rect(236, 24, 266, 140, sand); ell(236, 8, 266, 38, copper); rect(249, 0, 253, 10, dark);
  ell(243, 40, 259, 56, '#f8f4e0');
  d.strokeStyle = dark; d.lineWidth = 1;
  d.beginPath(); d.moveTo(251.5, 48.5); d.lineTo(251.5, 43.5); d.moveTo(251.5, 48.5); d.lineTo(255.5, 48.5); d.stroke();
  rect(0, 62, 320, 140, sand); rect(40, 54, 140, 64, sand);
  for (const y of [62, 84, 106]) rect(0, y, 320, y + 3, cream);
  for (let x = 6; x < 320; x += 22) for (const y of [68, 90]) { rect(x, y + 4, x + 10, y + 14, dark); ell(x, y, x + 10, y + 9, dark); }
  rect(60, 112, 120, 140, dark); ell(60, 100, 120, 126, dark);
  for (let x = 66; x < 120; x += 12) ell(x, 108, x + 7, 115, '#f8f4e0');
  rect(0, 140, 320, 180, '#c4bcae'); rect(0, 140, 320, 142, '#9a9488');
  for (const y of [166, 172]) rect(0, y, 320, y, '#d4d6de');
  d.strokeStyle = '#b4ac9e';
  for (let x = 0; x < 320; x += 16) { d.beginPath(); d.moveTo(x + 0.5, 143); d.lineTo(x - 5.5, 179); d.stroke(); }
  const px = d.getImageData(0, 0, W, H).data;
  const img = new Int32Array(W * H);
  for (let i = 0; i < W * H; i++) img[i] = (px[i * 4] << 16) | (px[i * 4 + 1] << 8) | px[i * 4 + 2];
  return img;
}

function buildIntro() {
  return {
    bg: stationBg(),
    kid: { stand: kidSprite(2, 'stand'), run: kidSprite(2, 'run'), run2: kidSprite(2, 'run2'), scared: kidSprite(2, 'scared', true) },
    dingo: { shut: dingoSprite(1.3, { pose: 'stand', mouth: 'shut' }), open: dingoSprite(1.3, { pose: 'stand', mouth: 'open' }), run: dingoSprite(1.3) },
  };
}

// [ms, kid pose, kid x, dingo pose, dingo x, words, streaks, sound]
const SHOTS = [
  [700, 'stand', 190], [1500, 'stand', 190, null, 0, 'surfer'],
  [250, 'stand', 190, 'shut', -150], [250, 'stand', 190, 'shut', -60],
  [260, 'stand', 190, 'open', -10, 'chomp', false, 'chomp'], [260, 'stand', 190, 'shut', -10, 'dingo'],
  [260, 'stand', 190, 'open', -10, 'chomp', false, 'chomp'], [260, 'stand', 190, 'shut', -10, 'dingo'],
  [900, 'scared', 196, 'shut', -10, 'eek', false, 'stumble'],
  ...Array.from({ length: 6 }, (_, i) => [130, i % 2 ? 'run2' : 'run', 200 + i * 26, 'run', -40 + i * 34, null, true]),
];
export const INTRO_MS = SHOTS.reduce((a, s) => a + s[0], 0);

export function intro(fr, ms, playSfx) {
  if (!introArt) introArt = buildIntro();
  let acc = 0, idx = 0;
  while (idx < SHOTS.length - 1 && ms >= acc + SHOTS[idx][0]) acc += SHOTS[idx++][0];
  const [, kpose, kx, dpose, dx, words, strk, sfx] = SHOTS[idx];
  if (sfx && idx !== intro.lastShot) playSfx(sfx);
  intro.lastShot = idx;
  fr.img.set(introArt.bg);
  const ground = 152;
  if (strk) streaks(fr, ms / 1000, 30, 20, 170);
  if (dpose) { const s = introArt.dingo[dpose]; fr.blit(s, dx, ground - s.h + 14); }
  const ks = introArt.kid[kpose];
  fr.blit(ks, kx, ground - ks.h + 8);
  const dingoWords = () => { text(fr, 16, 12, 'DINGO', '#ff8a3a', 4); jpText(fr, 16, 38, 'dingo', '#ffffff', 2, '#1a1020'); };
  if (words === 'surfer') { text(fr, 16, 12, 'SURFER', '#ffd23a', 4); jpText(fr, 16, 38, 'surfer', '#ffffff', 2, '#1a1020'); }
  if (words === 'dingo') dingoWords();
  if (words === 'chomp') {
    dingoWords();
    text(fr, 130, 14, 'CHOMP!', '#e8303c', 4, '#ffffff');
    jpText(fr, 150, 38, 'gabu', '#e8303c', 1, '#ffffff');
  }
  if (words === 'eek') { text(fr, 236, 14, '!', '#ffd23a', 4, '#ffffff'); jpText(fr, 252, 20, 'hi', '#ffffff', 1); }
  if (Math.floor(ms / 500) % 2 === 0) text(fr, W - 4 - textWidth('TAP TO SKIP'), H - 8, 'TAP TO SKIP', '#ffffff');
}

// Side-on character art for the intro, start and game-over screens, ported
// from concept/characters.py: the kid and Pup, the chibi wild dingo (no
// collar). Shapes are drawn with the canvas API and then turned into
// outlined pixel art by spriteFromCanvas().

import { spriteFromCanvas } from './gfx.js';

class Pen {
  constructor(ctx, k = 1, ox = 0, oy = 0, flip = false, fw = 96) {
    Object.assign(this, { ctx, k, ox, oy, flip, fw, grp: null });
  }
  group(pivot, k = 1, dx = 0, dy = 0) {
    this.grp = pivot ? [pivot, k, dx, dy] : null;
  }
  P(x, y) {
    if (this.grp) {
      const [[px, py], k, dx, dy] = this.grp;
      x = px + (x - px) * k + dx;
      y = py + (y - py) * k + dy;
    }
    if (this.flip) x = this.fw - x;
    return [this.ox + x * this.k, this.oy + y * this.k];
  }
  poly(pts, col) {
    const c = this.ctx;
    c.fillStyle = col;
    c.beginPath();
    pts.forEach(([x, y], i) => { const [X, Y] = this.P(x, y); i ? c.lineTo(X, Y) : c.moveTo(X, Y); });
    c.closePath();
    c.fill();
  }
  ell(x0, y0, x1, y1, col) {
    const [a, b] = this.P(x0, y0), [cc, d] = this.P(x1, y1);
    const c = this.ctx;
    c.fillStyle = col;
    c.beginPath();
    c.ellipse((a + cc) / 2, (b + d) / 2, Math.max(0.5, Math.abs(cc - a) / 2), Math.max(0.5, Math.abs(d - b) / 2), 0, 0, Math.PI * 2);
    c.fill();
  }
  line(pts, col, w) {
    const c = this.ctx;
    c.strokeStyle = col;
    c.lineWidth = Math.max(1, Math.round(w * this.k * (this.grp ? this.grp[1] : 1)));
    c.lineJoin = 'round';
    c.lineCap = 'butt';
    c.beginPath();
    pts.forEach(([x, y], i) => { const [X, Y] = this.P(x, y); i ? c.lineTo(X, Y) : c.moveTo(X, Y); });
    c.stroke();
  }
  dot(x, y, col) {
    const [X, Y] = this.P(x, y);
    this.ctx.fillStyle = col;
    this.ctx.fillRect(Math.round(X), Math.round(Y), 1, 1);
  }
}

// Pup, the chosen dingo design
const V = { coat: '#e8953a', light: '#ffbe68', shade: '#b8682a', cream: '#fff0d8', eye: '#58c8ff', line: '#2a140c',
  head: 1.45, legs: 0.72, body: 0.82 };
const DINGO_COLS = [V.coat, V.light, V.shade, V.cream, V.eye, '#e8a08a', '#1a1010', '#ffffff', '#5a1418', '#e86a7a'];

function drawDingo(p, pose, mouth, legPhase) {
  const { coat, light, shade, cream } = V;
  p.group([28, 28]);
  p.poly([[28, 25], [20, 18], [10, 15], [3, 19], [8, 23], [16, 26], [26, 33]], coat);
  p.poly([[20, 19], [12, 17], [14, 20], [22, 23]], light);
  p.poly([[10, 15], [3, 19], [8, 23], [11, 21]], cream);
  const s = legPhase; // 0..1 swings the gallop a little for a run cycle
  const sw = (a, b) => [a, b + Math.sin(s * Math.PI * 2) * 3];
  if (pose === 'stand') {
    p.group([62, 36], V.legs);
    p.line([[58, 37], [57, 47], [58, 55]], shade, 4); p.line([[58, 52], [60, 56]], cream, 4);
    p.group([34, 36], V.legs);
    p.line([[36, 37], [38, 46], [35, 55]], shade, 4); p.line([[35, 52], [37, 56]], cream, 4);
  } else {
    p.group([62, 36], V.legs);
    p.line([[58, 37], [66, 45], sw(75, 50)], shade, 4); p.line([sw(70, 48), sw(76, 51)], cream, 4);
    p.group([34, 36], V.legs);
    p.line([[36, 37], [28, 46], sw(18, 51)], shade, 4); p.line([sw(22, 50), sw(16, 52)], cream, 4);
  }
  p.group([46, 33], V.body);
  p.ell(25, 23, 66, 42, coat); p.ell(50, 21, 70, 42, coat); p.ell(29, 34, 62, 43, shade); p.ell(30, 23, 60, 29, light);
  p.poly([[56, 36], [66, 34], [68, 41], [58, 42]], cream);
  if (pose === 'stand') {
    p.group([62, 36], V.legs);
    p.line([[63, 37], [65, 47], [64, 55]], coat, 5); p.line([[64, 52], [67, 56]], cream, 5);
    p.group([34, 36], V.legs);
    p.line([[31, 37], [28, 46], [31, 55]], coat, 5); p.line([[31, 52], [34, 56]], cream, 5);
  } else {
    const sw2 = (a, b) => [a, b - Math.sin(s * Math.PI * 2) * 3];
    p.group([62, 36], V.legs);
    p.line([[62, 36], [73, 41], sw2(85, 43)], coat, 5); p.line([sw2(80, 42), sw2(88, 43)], cream, 5);
    p.group([34, 36], V.legs);
    p.line([[32, 36], [22, 43], sw2(8, 45)], coat, 5); p.line([sw2(13, 44), sw2(5, 45)], cream, 5);
  }
  p.group([66, 24]);
  p.poly([[58, 27], [66, 13], [77, 16], [71, 33]], coat);
  const hk = V.head;
  p.group([72, 18], hk, 0, 2 * (hk - 1));
  p.poly([[58, 27], [66, 13], [77, 16], [71, 33]], coat);
  p.poly([[66, 22], [74, 25], [70, 36], [61, 37]], cream);
  p.ell(64, 8, 82, 26, coat); p.ell(66, 9, 78, 15, light);
  p.poly([[65, 12], [66, 0], [72, 9]], coat); p.poly([[66, 9], [67, 3], [70, 9]], shade);
  p.poly([[71, 10], [75, -1], [79, 11]], coat); p.poly([[73, 9], [75, 3], [77, 10]], '#e8a08a');
  p.poly([[75, 14], [91, 18], [91, 23], [84, 25], [75, 24]], coat);
  p.poly([[77, 20], [91, 21], [90, 24], [84, 26], [77, 25]], cream);
  p.ell(89, 17, 93, 21, '#1a1010');
  if (mouth === 'open') {
    p.poly([[77, 22], [91, 22], [93, 33], [80, 30]], '#5a1418');
    p.poly([[79, 29], [93, 32], [91, 35], [80, 32]], coat);
    p.poly([[80, 30], [92, 33], [90, 35], [81, 33]], cream);
    p.poly([[84, 27], [90, 28], [88, 31]], '#e86a7a');
    for (const x of [81, 85, 89]) {
      p.poly([[x, 22], [x + 2, 22], [x + 1, 25]], '#ffffff');
      p.poly([[x + 1, 31], [x + 3, 32], [x + 1, 29]], '#ffffff');
    }
  } else if (mouth === 'shut') {
    p.poly([[78, 23], [90, 23], [86, 29], [78, 27]], '#5a1418');
    p.poly([[80, 27], [90, 26], [88, 30], [80, 29]], cream);
    for (const x of [82, 85, 88]) { p.dot(x, 24, '#ffffff'); p.dot(x, 27, '#ffffff'); }
  } else {
    p.dot(84, 25, '#ffffff'); p.dot(84, 26, '#ffffff');
  }
  p.ell(64, 17, 70, 24, cream);
  p.poly([[73, 13], [78, 11], [82, 13], [79, 16], [74, 15]], '#ffffff');
  p.ell(76, 11, 80, 15, V.eye); p.ell(77, 12, 79, 15, '#1a1010'); p.dot(78, 12, '#ffffff');
  p.group(null);
}

export function dingoSprite(k = 1, { pose = 'run', mouth = null, flip = false, phase = 0 } = {}) {
  const w = Math.floor(110 * k) + 2, h = Math.floor(80 * k) + 2;
  return spriteFromCanvas(w, h, DINGO_COLS, (ctx) => {
    drawDingo(new Pen(ctx, k, Math.floor(6 * k) + 1, Math.floor(12 * k) + 1, flip), pose, mouth, phase);
  }, V.line);
}

// --- the kid ------------------------------------------------------------------

const KID_COLS = ['#f4cbaa', '#3fb8cc', '#b0f4f4', '#ffffff', '#23788c', '#7a2030', '#7ad8ff', '#a05050',
  '#2a3264', '#181f40', '#f0f0f0', '#f6f2ea', '#b4aecb', '#e8303c', '#a01830', '#f2a41e', '#b06a10', '#e02848'];

function kidHead(p, mood, hair) {
  p.ell(17, 0, 31, 14, '#f4cbaa');
  if (hair === 'blown') {
    p.poly([[15, 6], [18, -1], [26, -3], [32, 1], [33, 6], [28, 4], [24, 6], [22, 9], [19, 12], [11, 10], [15, 8], [8, 6]], '#3fb8cc');
    p.poly([[19, 0], [26, -2], [29, 1], [23, 2]], '#b0f4f4');
  } else {
    p.poly([[15, 7], [16, 0], [22, -4], [29, -3], [33, 2], [33, 6], [29, 3], [26, 5], [23, 4], [20, 8], [18, 13], [14, 12]], '#3fb8cc');
    p.poly([[18, 1], [23, -2], [27, -1], [22, 1]], '#b0f4f4');
  }
  if (mood === 'scared') {
    p.poly([[25, 4], [31, 4], [31, 10], [25, 10]], '#ffffff');
    p.ell(27, 6, 29, 8, '#23788c');
    p.ell(26, 10, 30, 13, '#7a2030');
    for (const [x, y] of [[32, 1], [33, 3], [15, 3]]) p.dot(x, y, '#7ad8ff');
  } else {
    p.poly([[26, 6], [30, 5], [30, 9], [26, 9]], '#ffffff');
    p.ell(26, 6, 28, 9, '#23788c');
    p.dot(27, 6, '#ffffff');
    p.line([[28, 11], [30, 11]], '#a05050', 1);
    if (mood === 'panic') { p.dot(31, 3, '#7ad8ff'); p.dot(31, 4, '#7ad8ff'); }
  }
}

function drawKid(p, pose) {
  const pants = '#2a3264', pants2 = '#181f40', shoe = '#f0f0f0', hood = '#f6f2ea', hood2 = '#b4aecb';
  if (pose === 'run' || pose === 'run2') {
    p.poly([[18, 17], [4, 14], [0, 18], [6, 18], [2, 22], [12, 21], [19, 22]], '#e8303c');
    p.poly([[4, 14], [0, 18], [6, 18]], '#a01830');
    if (pose === 'run') { p.line([[18, 32], [12, 38], [6, 40]], pants2, 4); p.ell(1, 38, 8, 43, shoe); }
    else { p.line([[19, 32], [16, 39], [16, 45]], pants2, 4); p.ell(13, 42, 21, 47, shoe); }
    p.line([[19, 22], [12, 27]], hood2, 3);
    p.poly([[9, 18], [16, 16], [17, 29], [10, 30]], '#f2a41e');
    p.poly([[10, 26], [17, 25], [17, 29], [10, 30]], '#b06a10');
    p.poly([[15, 16], [25, 15], [27, 31], [15, 32]], hood);
    p.poly([[15, 26], [27, 25], [27, 31], [15, 32]], hood2);
    if (pose === 'run') {
      p.line([[21, 31], [29, 35], [28, 43]], pants, 4); p.ell(26, 41, 34, 46, shoe); p.line([[26, 45], [34, 45]], '#e02848', 1);
    } else { p.line([[21, 31], [28, 37], [34, 36]], pants, 4); p.ell(32, 33, 39, 38, shoe); }
    p.line([[22, 19], [29, 24], [34, 20]], hood, 3);
    p.ell(32, 17, 36, 21, '#f4cbaa');
    p.poly([[16, 13], [26, 13], [26, 17], [16, 18]], '#e8303c');
    kidHead(p, 'panic', 'blown');
  } else if (pose === 'stand') {
    p.poly([[17, 14], [14, 26], [17, 27], [19, 17]], '#e8303c');
    p.line([[19, 31], [19, 44]], pants2, 4); p.line([[24, 31], [24, 44]], pants, 4);
    p.ell(15, 42, 22, 47, shoe); p.ell(21, 42, 29, 47, shoe);
    p.poly([[11, 17], [17, 15], [17, 29], [12, 30]], '#f2a41e');
    p.poly([[16, 15], [26, 15], [27, 32], [16, 32]], hood);
    p.poly([[16, 27], [27, 26], [27, 32], [16, 32]], hood2);
    p.line([[25, 18], [27, 25], [26, 30]], hood, 3);
    p.ell(24, 29, 28, 33, '#f4cbaa');
    p.poly([[17, 13], [27, 13], [27, 17], [17, 18]], '#e8303c');
    kidHead(p, 'calm', 'still');
  } else {
    p.poly([[15, 14], [6, 8], [4, 13], [14, 18]], '#e8303c');
    p.line([[18, 31], [13, 38], [15, 45]], pants2, 4); p.line([[23, 31], [27, 38], [25, 45]], pants, 4);
    p.ell(10, 42, 18, 47, shoe); p.ell(22, 42, 30, 47, shoe);
    p.poly([[8, 17], [14, 15], [15, 28], [9, 29]], '#f2a41e');
    p.poly([[13, 16], [23, 14], [26, 31], [15, 32]], hood);
    p.poly([[15, 27], [26, 26], [26, 31], [15, 32]], hood2);
    p.line([[22, 18], [28, 12], [31, 6]], hood, 3);
    p.line([[15, 18], [10, 10], [11, 4]], hood2, 3);
    p.ell(29, 3, 33, 7, '#f4cbaa'); p.ell(9, 1, 13, 5, '#f4cbaa');
    p.poly([[14, 12], [24, 11], [24, 15], [14, 16]], '#e8303c');
    p.group([24, 7], 1, -2, 0);
    kidHead(p, 'scared', 'still');
    p.group(null);
  }
}

export function kidSprite(k = 1, pose = 'run', flip = false) {
  return spriteFromCanvas(Math.floor(42 * k) + 2, Math.floor(52 * k) + 2, KID_COLS, (ctx) => {
    drawKid(new Pen(ctx, k, 1, Math.floor(4 * k) + 1, flip, 40), pose);
  }, '#1a1020');
}

// --- Pup from behind, for the chase in the 3D view --------------------------------

export function dingoBackSprite(phase) {
  const s = Math.sin(phase * Math.PI * 2), c = Math.cos(phase * Math.PI * 2);
  return spriteFromCanvas(36, 36, DINGO_COLS, (ctx) => {
    const p = new Pen(ctx, 1, 2, 3 - Math.abs(s) * 1.5, false, 32);
    // hind legs, pumping
    p.ell(7, 22 + s * 2.5, 13, 30 + s * 2.5, V.shade);
    p.ell(19, 22 - s * 2.5, 25, 30 - s * 2.5, V.shade);
    p.ell(7.5, 28 + s * 2.5, 12.5, 31 + s * 2.5, V.cream);
    p.ell(19.5, 28 - s * 2.5, 24.5, 31 - s * 2.5, V.cream);
    // body
    p.ell(6, 15, 26, 28, V.coat);
    p.ell(10, 15, 22, 20, V.light);
    // big head with upright ears, seen from behind
    p.poly([[4, 10], [6, -2], [13, 5]], V.coat);
    p.poly([[28, 10], [26, -2], [19, 5]], V.coat);
    p.poly([[6, 6], [6.5, 1], [9, 5]], V.shade);
    p.poly([[26, 6], [25.5, 1], [23, 5]], V.shade);
    p.ell(1, 9, 8, 17, V.cream);
    p.ell(24, 9, 31, 17, V.cream);
    p.ell(3, 2, 29, 19, V.coat);
    p.ell(8, 3, 22, 9, V.light);
    // bushy tail streaming back towards us, wagging
    p.ell(11 + c * 3, 18, 21 + c * 3, 27, V.coat);
    p.ell(13 + c * 3, 20, 19 + c * 3, 25, V.cream);
  }, V.line);
}

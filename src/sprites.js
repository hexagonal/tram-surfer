// Hand-drawn pixel sprites for the 3D view: the kid from behind, coins,
// lanterns, and the sakura trees along Swanston St.

import { spriteFromArt, scale2x, hex, hsh, S } from './gfx.js';

const PAL = {
  k: '#1a1020', h: '#3fb8cc', H: '#b0f4f4', d: '#23788c', s: '#f4cbaa', r: '#e8303c', R: '#a01830',
  j: '#f6f2ea', J: '#b4aecb', g: '#f2a41e', G: '#b06a10', p: '#2a3264', P: '#181f40', b: '#f0f0f0',
  B: '#e02848', y: '#ffd23a', Y: '#c88a10', w: '#fffbe0', o: '#f07820',
};

const TOP = `
.......kkkk.........
.....kkhhhhkk.......
....khhHHhhhhk......
...khhHHhhhhhhk.....
...khhhhhhhhhhhk....
..khhhhhhhhhhhhk....
..khhhhdhhhhhhhhk...
.kkhhhhhhhhdhhhhkk..
..khhhhhhhhhhhhhk...
.khkhhhhdhhhhhhkhk..
.k.khhkhhhhhkhhk.k..
....kk.kssssk.kk....
......krrrrrrk..rrk.
.....krrrrrrrkrrRRk.
....kjjrrrrRRRRRk...
...kjjjjrRRjjjjjk...
..kjjjkggggggkjjjk..
..kjjkgGggggGgkjjk..
.kssjkgggggggkjJk...
.kssjkgGGGGGgkjJsk..
..kkjkgggggggkJJssk.
...kjjkkkkkkkJJJkk..
....kppppppppppk....`;

const LEGS_A = `
....kpppPkppppPk....
....kpppk.kpppk.....
...kpppk...kpppk....
...kpppk....kPPk....
..kbbbbk....kbbk....
..kBBBBk....kBBk....
...kkkk......kk.....`;

const LEGS_JUMP = `
....kpppPkppppPk....
....kpppk.kpppk.....
....kbbbk.kbbbk.....
....kBBBk.kBBBk.....
.....kkk...kkk......
....................
....................`;

const ROLL = `
.....kkkkkk.....
...kkhhhhhhkk...
..khhHHhhhhhhk..
.khhHhhhhdhhhhk.
.khhhhhhhhhhhhk.
khhhhhdhhhhhhhhk
krrrrrrrrrrRRRRk
kjjkggggggggkjjk
kjjkgGggggGgkjjk
kjjkggggggggkJJk
kjjkgGGGGGGgkJJk
.kjkggggggggkJk.
.kjjkkkkkkkkJJk.
..kppppppppppk..
...kkbbbbbbkk...
.....kkkkkk.....`;

const mirror = (art) => '\n' + art.trim().split('\n').map((r) => r.padEnd(20, '.').split('').reverse().join('')).join('\n');

// the 3D view runs at twice the resolution these were drawn for, so they are
// doubled with Scale2x, which rounds off the stair steps instead of fattening them
export const RUNNER = {
  runA: scale2x(spriteFromArt(TOP + LEGS_A, PAL)),
  runB: scale2x(spriteFromArt(TOP + mirror(LEGS_A), PAL)),
  jump: scale2x(spriteFromArt(TOP + LEGS_JUMP, PAL)),
  roll: scale2x(spriteFromArt(ROLL, PAL)),
};

const COIN_ART = `
..kkkk..
.kyyyyk.
kywyyyYk
kywyyyYk
kyyyyyYk
kyyyyyYk
.kYYYYk.
..kkkk..`;
export const COIN = spriteFromArt(COIN_ART, PAL);
/** The coins for the 3D view: gold, and the rarer blue ones worth double. */
export const COIN_HI = scale2x(COIN);
export const BLUE_COIN_HI = scale2x(spriteFromArt(COIN_ART, { ...PAL, y: '#4ab8ff', w: '#e8f8ff', Y: '#2060c0' }));

export const LANTERN = scale2x(spriteFromArt(`
..kk..
.kRRk.
krrrrk
kkkkkk
krrrrk
krrrrk
kkkkkk
.kRRk.
..kk..
..yy..`, PAL));

export const SAKURA = ['#e27ea0', '#ffbcd2', '#fff0f6', '#b8587a'];

/** A tree as a billboard sprite (h metres tall), from the concept's blob tree. */
export function treeSprite(seed, leaves = SAKURA, px = 96 * S) {
  let st = seed * 9301 + 49297;
  const rnd = (a, b) => { st = (st * 9301 + 49297) % 233280; return a + (st / 233280) * (b - a); };
  const blobs = [];
  for (let i = 0; i < 7; i++) blobs.push([rnd(-0.3, 0.3), rnd(0.55, 0.85), rnd(0.18, 0.3)]);
  blobs.push([0, 0.7, 0.32]);
  const w = Math.round(px * 0.85), h = px;
  const L = leaves.map(hex), trunkC = hex('#5a3a28');
  const data = new Int32Array(w * h).fill(-1);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const u = (i + 0.5) / w - 0.5, v = 1 - (j + 0.5) / h;
      let can = false, lit = false;
      for (const [bx, by, r] of blobs) {
        if (Math.hypot(u - bx, v - by) < r) can = true;
        if (Math.hypot(u - bx + r * 0.25, v - by - r * 0.3) < r * 0.75) lit = true;
      }
      let c = -1;
      if (can) {
        c = lit ? L[1] : L[0];
        if (lit && hsh(u * 40 * S, v * 40 * S) > 0.85) c = L[2];
        if (!lit && hsh(u * 30 * S, v * 30 * S) > 0.8) c = L[3];
      } else {
        const trunk = Math.abs(u) < 0.035 + (v < 0.1 ? 0.02 : 0) && v < 0.6;
        const br = v > 0.35 && v < 0.62 && Math.abs(Math.abs(u) - (v - 0.35) * 0.8) < 0.025;
        if (trunk || br) c = trunkC;
      }
      data[j * w + i] = c;
    }
  return { w, h, data };
}

// Tram Surfer: boot, main loop, input and the screen flow
// (intro -> start screen -> run -> game over).

import { W, H, S as PX, LW, LH, Frame, mix } from './gfx.js';
import { Scene, TAG } from './render.js';
import { Street, drawBarrier, drawRamp, drawCoin, drawTrampoline, drawPlatform } from './street.js';
import { drawTram } from './trams.js';
import { RUNNER } from './sprites.js';
import { dingoBackSprite } from './characters.js';
import { Run, MIN_SPEED, MAX_SPEED } from './game.js';
import { Sound } from './audio.js';
import * as S from './screens.js';
import { ZONES, skyFor, clock } from './zones.js';

const canvas = document.getElementById('screen');
// the size is set here, not only in index.html, so a cached page and a fresh
// script (or the other way round) can never disagree about it
canvas.width = W;
canvas.height = H;
const ctx = canvas.getContext('2d');
const imageData = ctx.createImageData(W, H);
const out32 = new Uint32Array(imageData.data.buffer);
const frame = new Frame();
const scene = new Scene(frame);
const btns = new S.Buttons();
const sound = new Sound();
let street = null;
// for testing: ?zone=collins starts the run in that zone
const QUERY = new URLSearchParams(location.search);
const START_ZONE = ZONES[QUERY.get('zone')] ? QUERY.get('zone') : 'swanston';
// the 3D view runs at 640x360 and drops to 320x180 if the machine can't keep
// up; ?res=low or ?res=high fixes it either way
const RES = QUERY.get('res');
if (RES === 'low') scene.setDetail(2);
const slow = { ms: 0, n: 0 };
const skyBlend = new Int32Array(W * H);

const DINGO = [0, 0.25, 0.5, 0.75].map((ph) => dingoBackSprite(ph, PX));
const BEST_KEY = 'tram-surfer:best';
let best = 0;
try { best = Number(localStorage.getItem(BEST_KEY)) || 0; } catch { /* private mode */ }
// edge smoothing (anti-aliasing) of the 3D view: on unless turned off in the
// pause menu; ?aa=on or ?aa=off overrides it for testing
const SMOOTH_KEY = 'tram-surfer:smooth';
let smooth = true;
try { smooth = localStorage.getItem(SMOOTH_KEY) !== 'off'; } catch { /* private mode */ }
if (QUERY.get('aa')) smooth = QUERY.get('aa') !== 'off';

let state = 'intro';
let stateT = 0;
let run = null;
let volFlash = 0;

// the button each menu selects first, for the keyboard
const FIRST = { paused: 'resume', over: 'retry' };

function setState(s) {
  state = s;
  stateT = 0;
  btns.focus = FIRST[s] ?? null;
}

function newRun() {
  const seed = (Math.random() * 2 ** 31) | 0;
  run = new Run(seed, (e, arg) => {
    sound.play(e);
    if (e === 'crash') sound.muffle(0.75);
  }, { startZone: START_ZONE });
  street = new Street(run);
  sound.newRun(seed);
  setState('play');
}

function endRun() {
  if (run.score > best) {
    best = Math.floor(run.score);
    try { localStorage.setItem(BEST_KEY, String(best)); } catch { /* ignore */ }
  }
}

// --- actions (keyboard, touch and on-screen buttons all come through here) ------------

function act(a) {
  if (!a) return;
  sound.unlock();
  switch (a) {
    case 'skip': setState('title'); break;
    case 'start': sound.play('start'); newRun(); break;
    case 'left': if (state === 'play') run.move(-1); break;
    case 'right': if (state === 'play') run.move(1); break;
    case 'jump': if (state === 'play') run.jump(); break;
    case 'roll': if (state === 'play') run.roll(); break;
    case 'pause':
      if (state === 'play' && !run.over) { setState('paused'); sound.muffle(0.85); sound.play('click'); }
      else if (state === 'paused') act('resume');
      break;
    case 'resume': setState('play'); sound.muffle(0); sound.play('click'); break;
    case 'quit': sound.pauseMusic(); setState('title'); break;
    case 'retry': sound.play('start'); newRun(); break;
    case 'mute': sound.toggleMute(); volFlash = 1.5; sound.play('click'); break;
    case 'vol-': sound.setLevel(sound.level - 1); volFlash = 1.5; sound.play('click'); break;
    case 'vol+': sound.setLevel(sound.level + 1); volFlash = 1.5; sound.play('click'); break;
    case 'smooth':
      smooth = !smooth;
      try { localStorage.setItem(SMOOTH_KEY, smooth ? 'on' : 'off'); } catch { /* private mode */ }
      sound.play('click');
      break;
  }
}

const KEYS = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'jump', KeyW: 'jump', Space: 'jump', ArrowDown: 'roll', KeyS: 'roll',
  KeyP: 'pause', Escape: 'pause', KeyM: 'mute', Minus: 'vol-', NumpadSubtract: 'vol-', Equal: 'vol+', NumpadAdd: 'vol+',
};

// in menus, arrows and WASD move between buttons and Enter or Space presses one
const MENU_KEYS = { ArrowUp: -1, KeyW: -1, ArrowLeft: -1, KeyA: -1, ArrowDown: 1, KeyS: 1, ArrowRight: 1, KeyD: 1 };

addEventListener('keydown', (e) => {
  if (e.repeat && !['vol-', 'vol+'].includes(KEYS[e.code])) return;
  let a = KEYS[e.code];
  if (state === 'intro') a = 'skip';
  else if (state === 'title' && ['Enter', 'Space', 'ArrowUp', 'KeyW'].includes(e.code)) a = 'start';
  else if (state === 'over' || state === 'paused') {
    // keys still held from steering into the crash shouldn't pick a button
    if (state === 'over' && stateT < 1.3) return;
    if (e.code in MENU_KEYS) {
      e.preventDefault();
      if (btns.step(MENU_KEYS[e.code])) sound.play('click');
      return;
    }
    if (e.code === 'Enter' || e.code === 'Space') a = btns.order.includes(btns.focus) ? btns.focus : null;
  }
  if (a) {
    e.preventDefault();
    act(a);
  }
});

// touch / mouse: swipes steer, taps press buttons
function toScreen(e) {
  const r = canvas.getBoundingClientRect();
  return [((e.clientX - r.left) / r.width) * LW, ((e.clientY - r.top) / r.height) * LH];
}

let touch = null;
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  canvas.setPointerCapture?.(e.pointerId);
  touch = { x: e.clientX, y: e.clientY, done: false, id: e.pointerId };
  sound.unlock();
  if (state === 'intro') return act('skip');
  const [sx, sy] = toScreen(e);
  const b = btns.hit(sx, sy);
  if (b && (state !== 'play' || b === 'pause' || b === 'mute')) {
    touch.done = true;
    act(b);
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (!touch || touch.done || touch.id !== e.pointerId) return;
  const dx = e.clientX - touch.x, dy = e.clientY - touch.y;
  const r = canvas.getBoundingClientRect();
  const th = Math.max(14, r.width * 0.03);
  if (Math.abs(dx) < th && Math.abs(dy) < th) return;
  touch.done = true;
  if (Math.abs(dx) > Math.abs(dy)) act(dx < 0 ? 'left' : 'right');
  else act(dy < 0 ? 'jump' : 'roll');
});
const endTouch = () => { touch = null; };
canvas.addEventListener('pointerup', endTouch);
canvas.addEventListener('pointercancel', endTouch);
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play' && run && !run.over) act('pause'); });

// --- drawing ------------------------------------------------------------------------------

/** The sky crossfades over 50 m as you run from one zone into the next. */
function sky(hor) {
  const p = run.p;
  const a = run.zoneAt(p.z - 25), b = run.zoneAt(p.z + 25);
  if (a === b) return skyFor(ZONES[a], hor);
  const zb = run.zones.find((zn) => zn.id === b && zn.z0 <= p.z + 25 && zn.z0 > p.z - 25);
  const k = zb ? Math.min(1, Math.max(0, (p.z + 25 - zb.z0) / 50)) : 1;
  const sa = skyFor(ZONES[a], hor), sb = skyFor(ZONES[b], hor);
  for (let i = 0; i < skyBlend.length; i++) skyBlend[i] = mix(sa[i], sb[i], k);
  return skyBlend;
}

/** A surfboard under whoever is on the river. */
function board(x, z, t) {
  scene.floor(0.04, x - 0.35, x + 0.35, z - 0.9, z + 0.8, (bx, bz) => {
    const u = (bx - x) / 0.35, v = (bz - z) / 0.85;
    if (u * u + v * v * (v > 0 ? 1.6 : 1) > 1) return -1;
    return Math.abs(u) < 0.12 ? 0xe8303c : 0xfffbe0;
  }, TAG.RUNNER);
  // wake
  scene.floor(0.02, x - 0.9, x + 0.9, z - 3, z - 0.8, (bx, bz) => {
    const d = Math.abs(Math.abs(bx - x) - (z - 0.8 - bz) * 0.3);
    return d < 0.08 && ((bz * 4 + t * 20) | 0) % 3 ? 0xf0efeb : -1;
  }, TAG.RUNNER);
}

function drawWorld(dt) {
  const cam = run.camera();
  scene.hor = cam.hor * scene.ppx;
  clock.t = run.time;
  const p = run.p, t = run.time;
  const here = ZONES[run.zoneAt(p.z)];
  scene.fogc = here.fogc;
  scene.fogk = here.fogk;
  scene.env = run.zones.map((zn) => ({ z0: zn.z0, z1: zn.z1, fogc: ZONES[zn.id].fogc, fogk: ZONES[zn.id].fogk, night: !!ZONES[zn.id].night }));
  scene.begin(cam, sky(cam.hor * PX));
  const onWater = (x, z, y) => ZONES[run.zoneAt(z)].water && y < 0.3;

  // the kid, with a shadow on whatever he is over
  const air = !p.grounded;
  let spr = RUNNER.runA, w = 0.95;
  if (p.roll > 0) { spr = RUNNER.roll; w = 0.8; }
  else if (air) spr = RUNNER.jump;
  else if (Math.floor(t * run.speed * 0.6) % 2) spr = RUNNER.runB;
  const surfing = onWater(p.x, p.z, p.y);
  if (surfing) {
    if (p.roll <= 0) spr = RUNNER.runA;
    board(p.x, p.z, t);
  }
  scene.sprite(spr, p.x, p.y + (surfing ? 0.08 + Math.sin(t * 6) * 0.04 : 0), p.z, w, TAG.RUNNER);
  const sy = p.support + 0.02, sr = Math.max(0.3, 0.55 - (p.y - p.support) * 0.08);
  scene.floor(sy, p.x - 0.6, p.x + 0.6, p.z - 0.4, p.z + 0.4, (x, z) => {
    const d = ((x - p.x) / sr) ** 2 + ((z - p.z) / (sr * 0.55)) ** 2;
    return d < 1 ? 0x2a2630 : -1;
  }, TAG.RUNNER);

  // the dingo, when it's close
  const dg = run.dingo;
  if (dg.gap < 7.3) {
    const ds = DINGO[Math.floor(t * 12) % 4];
    const hop = run.over ? Math.sin(dg.pounce * Math.PI) * 1.2 : Math.abs(Math.sin(t * 12)) * 0.12;
    const dz = p.z - dg.gap;
    if (onWater(dg.x, dz, dg.y) && !run.over) board(dg.x, dz, t);
    scene.sprite(ds, dg.x, dg.y + hop, dz, 1.15, TAG.RUNNER);
  }

  for (const c of run.coinList) if (c.z > p.z - 1 && c.z < p.z + 120) drawCoin(scene, c, t);
  for (const b of run.barriers) if (b.z > p.z - 1) drawBarrier(scene, b, t, !!ZONES[run.zoneAt(b.z)].night);
  for (const r of run.ramps) if (r.z + r.len > scene.cz) drawRamp(scene, r);
  for (const tr of run.trampolines) if (tr.z + 1 > scene.cz) drawTrampoline(scene, tr);
  for (const pl of run.platforms) if (pl.z1 > scene.cz) drawPlatform(scene, pl);
  const trams = run.trams.filter((tr) => tr.z + tr.L > scene.cz && tr.z < scene.cz + 240).sort((a, b) => a.z - b.z);
  for (const tr of trams) drawTram(scene, tr, !!ZONES[run.zoneAt(tr.z)].night);
  street.draw(scene);
  scene.outlines();
  scene.end();
  S.speedLines(frame, cam.hor * PX, t, run.speed);
  if (here.id === 'swanston' || here.id === 'bourke') S.petals(frame, t, dt);
  frame.keepWorld();
}

/**
 * If a frame's work keeps taking most of a 60 Hz frame, render the 3D view at
 * half resolution for the rest of the session. The first second of a run is
 * skipped, since it includes warming up.
 */
function watchSpeed(ms) {
  if (run.time < 1) return;
  slow.ms += ms;
  if (++slow.n < 120) return;
  if (slow.ms / slow.n > 15) scene.setDetail(2);
  slow.ms = 0;
  slow.n = 0;
}

let last = performance.now();
function loop(now) {
  const t0 = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  stateT += dt;
  if (volFlash > 0) volFlash -= dt;
  btns.clear();

  if (state === 'intro') {
    S.intro(frame, stateT * 1000, (s) => sound.play(s));
    if (stateT * 1000 > S.INTRO_MS) setState('title');
  } else if (state === 'title') {
    S.title(frame, btns, stateT, best);
    S.petals(frame, stateT, dt);
  } else if (state === 'play' || state === 'paused' || state === 'over') {
    if (state === 'play') {
      // fixed small steps keep collisions honest at high speed
      let left = dt;
      while (left > 0) {
        const h = Math.min(1 / 120, left);
        run.update(h);
        left -= h;
      }
      // the music speeds up and slows down with the kid
      sound.tempo(0.92 + (0.5 * (run.speed - MIN_SPEED)) / (MAX_SPEED - MIN_SPEED));
      if (run.over && run.overT > 0.9) { endRun(); setState('over'); }
    } else if (state === 'over') run.update(dt);
    drawWorld(state === 'paused' ? 0 : dt);
    if (state === 'over') S.gameOver(frame, btns, run, best, stateT);
    else S.hud(frame, btns, run, sound, volFlash, ZONES[run.zoneAt(run.p.z)]);
    if (state === 'paused') S.pauseMenu(frame, btns, sound, smooth);
  }
  frame.present(ctx, imageData, out32, smooth);
  if (state === 'play' && !RES && scene.step === 1) watchSpeed(performance.now() - t0);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// handy for poking at the game from the console
globalThis.tramSurfer = { get run() { return run; }, act, sound, get state() { return state; }, get detail() { return scene.step; }, get smooth() { return smooth; }, btns };

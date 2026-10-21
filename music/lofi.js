// Tram Surfer radio: endless procedural lofi music, synthesised with Web Audio.
//
// No samples. Every sound is built from oscillators and noise, and every
// musical choice comes from a seeded RNG, so the same seed always plays the
// same music. Tracks last about 90 seconds and alternate between two styles:
//   hiphop  - dusty boom-bap: minor 9ths, swung drums, Rhodes, vinyl crackle
//   citypop - 80s Japanese city pop: major 7ths, the "royal road" and
//             "Just the Two of Us" progressions, DX-style keys, funky bass
//
// Usage:
//   import { LofiMusic } from './lofi.js';
//   const music = new LofiMusic({ seed: 'game-1' });
//   button.onclick = () => music.start();    // must follow a user gesture
//   music.newGame();                          // fresh music for a new run
//   music.setTempoScale(1.1);                 // speed up with the runner
//   music.setMuffle(0.8);                     // pause menu / game over

export const STYLE_INFO = {
  hiphop: { label: 'Hip-hop', jp: 'ヒップホップ' },
  citypop: { label: 'City pop', jp: 'シティポップ' },
};

export const PARTS = ['drums', 'bass', 'keys', 'pad', 'melody', 'vinyl', 'bell'];

const PART_LEVEL = { drums: 0.9, bass: 0.85, keys: 0.6, pad: 0.5, melody: 0.55, vinyl: 0.5, bell: 0.4 };
const REVERB_SEND = { drums: 0.05, keys: 0.25, pad: 0.4, melody: 0.35, bell: 0.55 };

// Real Melbourne tram routes, used to label tracks.
const ROUTES = [1, 3, 5, 6, 11, 12, 16, 19, 30, 35, 48, 57, 58, 59, 64, 67, 70, 72, 75, 78, 82, 86, 96, 109];

const TRACK_SECONDS = 90;
const LOOKAHEAD = 0.2; // seconds scheduled ahead while visible
const LOOKAHEAD_HIDDEN = 1.6; // background tabs throttle timers to ~1s

// ---------------------------------------------------------------- random

export function hashSeed(...parts) {
  let h = 0x811c9dc5;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0xff;
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export class Rng {
  constructor(seed) {
    this.s = seed >>> 0;
  }
  next() {
    // mulberry32
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) {
    return a + (b - a) * this.next();
  }
  int(a, b) {
    return a + Math.floor(this.next() * (b - a + 1));
  }
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
  chance(p) {
    return this.next() < p;
  }
  weighted(pairs) {
    let total = 0;
    for (const [, w] of pairs) total += w;
    let r = this.next() * total;
    for (const [v, w] of pairs) if ((r -= w) < 0) return v;
    return pairs[pairs.length - 1][0];
  }
}

export function randomSeed() {
  const words = ['flinders', 'swanston', 'kilda', 'yarra', 'degraves', 'elizabeth', 'bourke', 'collins', 'brunswick', 'carlton', 'fitzroy', 'richmond'];
  const w = words[Math.floor(Math.random() * words.length)];
  return `${w}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

// ---------------------------------------------------------------- theory

export const NOTE_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

const CHORDS = {
  M7: [0, 4, 7, 11],
  M9: [0, 4, 7, 11, 14],
  6: [0, 4, 7, 9],
  69: [0, 4, 7, 9, 14],
  m7: [0, 3, 7, 10],
  m9: [0, 3, 7, 10, 14],
  m11: [0, 3, 10, 14, 17],
  7: [0, 4, 7, 10],
  9: [0, 4, 7, 10, 14],
  13: [0, 4, 10, 14, 21],
  '7sus4': [0, 5, 7, 10],
  '7b9': [0, 4, 7, 10, 13],
  m7b5: [0, 3, 6, 10],
};

const SUFFIX = { M7: 'maj7', M9: 'maj9', 6: '6', 69: '6/9', m7: 'm7', m9: 'm9', m11: 'm11', 7: '7', 9: '9', 13: '13', '7sus4': '7sus4', '7b9': '7♭9', m7b5: 'm7♭5' };

// [semitones above the tonic, chord quality, beats]. Every progression is 4 bars.
const HIPHOP_PROGS = [
  [[0, 'm9', 8], [5, 'm9', 8]],
  [[0, 'm9', 4], [8, 'M7', 4], [3, 'M9', 4], [10, '7sus4', 4]],
  [[5, 'm9', 4], [10, '9', 4], [3, 'M9', 4], [0, 'm9', 4]],
  [[2, 'm7b5', 4], [7, '7b9', 4], [0, 'm9', 8]],
  [[0, 'm9', 8], [5, '9', 8]],
  [[8, 'M9', 4], [7, '7b9', 4], [0, 'm9', 4], [0, 'm11', 4]],
  [[0, 'm11', 4], [10, '69', 4], [8, 'M7', 4], [7, '7sus4', 2], [7, '7b9', 2]],
  [[3, 'M7', 4], [2, 'm7b5', 4], [0, 'm9', 4], [5, 'm9', 4]],
];

const CITYPOP_PROGS = [
  [[5, 'M7', 4], [7, '7', 4], [4, 'm7', 4], [9, 'm7', 4]], // 王道進行, the "royal road"
  [[5, 'M7', 4], [4, '7', 4], [9, 'm7', 4], [7, 'm7', 2], [0, '7', 2]], // Just the Two of Us
  [[2, 'm9', 4], [7, '9', 4], [0, 'M9', 4], [9, 'm7', 4]],
  [[0, 'M7', 4], [9, 'm9', 4], [2, 'm7', 4], [7, '7sus4', 4]],
  [[5, 'M9', 4], [7, '13', 4], [4, 'm7', 4], [9, 'm9', 4]],
  [[0, 'M9', 4], [4, 'm7', 4], [5, 'M7', 4], [7, '7sus4', 2], [7, '9', 2]],
  [[2, 'm7', 4], [7, '7', 4], [4, 'm7', 4], [9, 'm7', 4]],
  [[5, 'M7', 4], [4, 'm7', 4], [2, 'm7', 4], [0, 'M9', 4]],
];

// Keys comping: [step, length, velocity] within a 16-step bar.
const HIPHOP_KEYS = [
  [[0, 16, 1]],
  [[0, 6, 1], [6, 10, 0.8]],
  [[0, 3, 1], [3, 7, 0.7], [10, 6, 0.85]],
  [[0, 8, 1], [10, 6, 0.75]],
  [[0, 2, 0.9], [3, 5, 0.8], [8, 2, 0.7], [11, 5, 0.85]],
];
const CITYPOP_KEYS = [
  [[0, 3, 1], [3, 3, 0.8], [6, 4, 0.9], [10, 2, 0.7], [12, 4, 0.85]],
  [[2, 2, 0.8], [6, 2, 0.8], [10, 2, 0.8], [14, 2, 0.8]],
  [[0, 4, 1], [6, 2, 0.7], [8, 4, 0.9], [14, 2, 0.7]],
  [[0, 6, 1], [6, 6, 0.85], [12, 4, 0.8]],
];

const HIPHOP_KICKS = [[0, 10], [0, 7, 10], [0, 6, 10], [0, 3, 10], [0, 10, 13], [0, 8, 10], [0, 7, 9]];
const CITYPOP_KICKS = [[0, 8], [0, 6, 8], [0, 4, 8, 12], [0, 7, 8, 14], [0, 3, 8, 11], [0, 8, 11]];

const LEAD_RANGE = {
  flute: [69, 88],
  pluck: [62, 81],
  epbell: [72, 91],
  bell: [74, 93],
  square: [67, 86],
  sawlead: [64, 83],
};

const DRUM_NOTE = { kick: 36, rim: 37, snare: 38, clap: 39, hat: 42, ohat: 46, shaker: 70 };

export const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function buildProg(key, spec) {
  const chords = [];
  let start = 0;
  for (const [deg, q, beats] of spec) {
    const root = (key + deg) % 12;
    const ivs = CHORDS[q];
    const upper = ivs.filter((i) => i !== 0).sort((a, b) => (a % 12) - (b % 12));
    chords.push({
      root,
      q,
      name: NOTE_NAMES[root] + SUFFIX[q],
      pcs: ivs.map((i) => (root + i) % 12),
      upper: upper.slice(0, 4).map((i) => (root + i) % 12),
      start,
      len: beats * 4,
    });
    start += beats * 4;
  }
  return { chords, steps: start };
}

function chordAt(prog, step) {
  const s = ((step % prog.steps) + prog.steps) % prog.steps;
  for (let i = 0; i < prog.chords.length; i++) {
    const c = prog.chords[i];
    if (s >= c.start && s < c.start + c.len) return { c, i, offset: s - c.start };
  }
  return { c: prog.chords[0], i: 0, offset: 0 };
}

// Close voicing of the chord's upper tones, moving as little as possible from
// the previous voicing.
function voiceChord(chord, prev) {
  const pcs = chord.upper;
  let best = null;
  let bestCost = Infinity;
  for (let rot = 0; rot < pcs.length; rot++) {
    const order = pcs.slice(rot).concat(pcs.slice(0, rot));
    for (const lo of [50, 62]) {
      const notes = [];
      let n = lo + ((order[0] - lo + 120) % 12);
      notes.push(n);
      for (let k = 1; k < order.length; k++) {
        n = n + 1 + ((order[k] - n - 1 + 120) % 12);
        notes.push(n);
      }
      if (notes[0] > 62 || notes[notes.length - 1] > 80) continue;
      let cost;
      if (prev) {
        cost = 0;
        for (const x of notes) cost += Math.min(...prev.map((p) => Math.abs(p - x)));
      } else {
        cost = Math.abs(notes.reduce((a, b) => a + b, 0) / notes.length - 64) * 3;
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = notes;
      }
    }
  }
  return best || pcs.map((pc) => 60 + pc);
}

function nearestTone(pcs, m) {
  let best = m;
  let bestD = Infinity;
  for (let d = 0; d <= 6; d++) {
    for (const x of [m - d, m + d]) {
      if (pcs.includes(((x % 12) + 12) % 12) && d < bestD) {
        best = x;
        bestD = d;
      }
    }
    if (bestD < Infinity) break;
  }
  return best;
}

function scaleWalk(scale, m, delta) {
  const notes = [];
  for (let n = 24; n <= 108; n++) if (scale.includes(n % 12)) notes.push(n);
  let idx = 0;
  let bestD = Infinity;
  notes.forEach((n, i) => {
    const d = Math.abs(n - m);
    if (d < bestD) {
      bestD = d;
      idx = i;
    }
  });
  return notes[clamp(idx + delta, 0, notes.length - 1)];
}

// ---------------------------------------------------------------- composition

const TITLE_WORDS = {
  hiphop: {
    a: ['rainy', 'late', 'quiet', 'golden', 'sleepy', 'mustard', 'slow', 'after-hours', 'foggy', 'sunday'],
    b: ['tram stop', 'laneway', 'Degraves St', 'Flinders St', 'Swanston St', 'St Kilda Rd', 'Yarra bank', 'State Library', 'Fed Square', 'last tram', 'route 86', 'Hosier Lane'],
  },
  citypop: {
    a: ['真夜中', '夏', '夕焼け', '雨上がり', '土曜日', '午前二時', '金曜日', '南半球'],
    b: ['トラム', '路面電車', 'ヤラ川', 'シティ', 'ネオン', 'プラットホーム', 'メルボルン', 'ラジオ'],
  },
};

function genTitle(r, style) {
  const w = TITLE_WORDS[style];
  return style === 'hiphop' ? `${r.pick(w.a)} ${r.pick(w.b)}` : `${r.pick(w.a)}の${r.pick(w.b)}`;
}

/** Compose a whole ~90 second track. Pure and deterministic for (gameSeed, index, style). */
export function composeTrack(gameSeed, index, style) {
  const seed = hashSeed(gameSeed, 'track', index, style);
  const r = new Rng(seed);
  const hh = style === 'hiphop';
  const key = r.int(0, 11);
  const bpm = hh ? r.int(72, 88) : r.int(90, 104);
  const nBars = clamp(Math.round(TRACK_SECONDS / (240 / bpm) / 4) * 4, 24, 48);
  const progs = hh ? HIPHOP_PROGS : CITYPOP_PROGS;
  const ia = r.int(0, progs.length - 1);
  let ib = r.int(0, progs.length - 2);
  if (ib >= ia) ib++;
  const keyPats = hh ? HIPHOP_KEYS : CITYPOP_KEYS;
  const kickPats = hh ? HIPHOP_KICKS : CITYPOP_KICKS;
  const k1 = r.int(0, kickPats.length - 1);
  let k2 = r.int(0, kickPats.length - 2);
  if (k2 >= k1) k2++;

  const t = {
    index,
    seed,
    style,
    key,
    bpm,
    nBars,
    keyName: NOTE_NAMES[key] + (hh ? ' minor' : ' major'),
    route: r.pick(ROUTES),
    title: genTitle(r, style),
    progA: buildProg(key, progs[ia]),
    progB: buildProg(key, progs[ib]),
    scale: (hh ? [0, 2, 3, 5, 7, 10] : [0, 2, 4, 7, 9, 11]).map((i) => (key + i) % 12),
    swing16: hh ? r.range(0.18, 0.34) : r.range(0.03, 0.1),
    swing8: hh ? r.range(0.06, 0.16) : 0,
    strum: hh ? r.range(0.008, 0.02) : r.range(0.002, 0.008),
    tone: hh ? r.range(3600, 6000) : r.range(6500, 9500),
    crackle: hh ? r.range(0.7, 1.1) : r.range(0.3, 0.6),
    lead: hh ? r.pick(['flute', 'pluck', 'epbell']) : r.pick(['bell', 'square', 'sawlead']),
    keysA: r.pick(keyPats),
    keysB: r.pick(keyPats),
    kicksA: kickPats[k1],
    kicksB: kickPats[k2],
    hats: hh ? r.pick(['eighths', 'lazy16', 'offbeat']) : r.pick(['sixteenths', 'disco', 'shaker']),
    snare: hh ? 'snare' : r.pick(['snare', 'clap', 'both']),
    rim: hh ? [] : r.pick([[], [10], [3, 10], [7, 14]]),
    bassMode: hh ? r.pick(['hold', 'kick']) : r.pick(['octave', 'synco', 'walk']),
    introHats: r.chance(0.6),
  };

  // Form: a 4 bar intro, then 8 bar sections alternating progression A and B.
  const sections = [{ kind: 'intro', start: 0, len: 4, prog: t.progA, keys: hh ? [[0, 16, 0.8]] : [[0, 8, 0.8], [8, 8, 0.7]] }];
  for (let b = 4, k = 0; b < nBars; k++) {
    const len = Math.min(8, nBars - b);
    const useB = k % 2 === 1;
    const melody = hh ? k === 1 || (k > 1 && r.chance(0.6)) : k >= 1 ? r.chance(0.75) : r.chance(0.3);
    sections.push({
      kind: 'main',
      start: b,
      len,
      prog: useB ? t.progB : t.progA,
      keys: useB ? t.keysB : t.keysA,
      kicks: useB ? t.kicksB : t.kicksA,
      kicksAlt: useB ? t.kicksA : t.kicksB,
      drumAlt: r.chance(0.35),
      lite: k > 1 && r.chance(0.2),
      melody,
      arp: !hh && !melody && r.chance(0.6),
      pad: !hh && r.chance(0.7),
    });
    b += len;
  }
  t.sections = sections.map(({ kind, start, len, melody }) => ({ kind, start, len, melody: !!melody }));

  const bars = [];
  let voicing = null;
  let arpIdx = 0;
  sections.forEach((sec, si) => {
    const mel = sec.melody ? composeMelody(t, r, sec) : [];
    for (let i = 0; i < sec.len; i++) {
      const barIdx = sec.start + i;
      const br = new Rng(hashSeed(seed, 'bar', barIdx));
      const isIntro = sec.kind === 'intro';
      const isOutro = barIdx === nBars - 1;
      const isFill = i === sec.len - 1 && !isOutro;
      const ev = [];

      // Chord segments in this bar.
      const segs = [];
      for (let st = 0; st < 16; st++) {
        const { c, i: ci, offset } = chordAt(sec.prog, i * 16 + st);
        const last = segs[segs.length - 1];
        if (!last || last.ci !== ci) segs.push({ step: st, ci, chord: c, isStart: offset === 0, len: 0 });
        segs[segs.length - 1].len++;
      }
      for (const seg of segs) {
        if (seg.isStart || !voicing) voicing = voiceChord(seg.chord, voicing);
        seg.voicing = voicing;
        if (seg.isStart || (i === 0 && seg.step === 0)) ev.push({ t: 'chord', s: seg.step, name: seg.chord.name });
      }
      const segAt = (st) => segs.find((g) => st >= g.step && st < g.step + g.len);

      if (barIdx === 0) {
        ev.push({ t: 'start', s: 0 });
        ev.push({ t: 'bell', s: 0 });
        ev.push({ t: 'fx', s: 0, kind: 'open' });
      }
      if (isOutro) ev.push({ t: 'fx', s: 0, kind: 'close' });

      // Keys.
      const hits = isOutro ? [[0, 16, 0.9]] : sec.keys.slice();
      if (!isOutro) {
        for (const seg of segs) if (seg.isStart && !hits.some((h) => h[0] === seg.step)) hits.push([seg.step, 16, 0.8]);
        hits.sort((a, b) => a[0] - b[0]);
      }
      hits.forEach(([st, d, vm], hi) => {
        const seg = segAt(st);
        const nextHit = hi + 1 < hits.length ? hits[hi + 1][0] : 16;
        const dur = Math.min(d, nextHit - st, seg.step + seg.len - st) || 1;
        ev.push({ t: 'keys', s: st, d: isOutro ? 16 : dur, n: seg.voicing, v: clamp(0.62 * vm + br.range(-0.05, 0.05), 0.1, 1), j: br.range(-0.003, 0.006) });
      });

      // Pad (city pop).
      if (!hh && (sec.pad || isIntro)) {
        for (const seg of segs) if (seg.isStart) ev.push({ t: 'pad', s: seg.step, d: seg.chord.len, n: seg.voicing, v: isIntro ? 0.8 : 0.65 });
      }

      // Drums.
      const kicks = drumBar(t, sec, i, br, ev, { isIntro, isOutro, isFill });

      // Bass.
      const bassOn = !isIntro || (!hh && i >= 2 && br.chance(0.5));
      if (bassOn) {
        let nextRoot;
        if (i + 1 < sec.len) nextRoot = chordAt(sec.prog, (i + 1) * 16).c.root;
        else if (si + 1 < sections.length) nextRoot = sections[si + 1].prog.chords[0].root;
        else nextRoot = segs[0].chord.root;
        bassBar(t, br, ev, segs, segAt, kicks, nextRoot, isOutro);
      }

      // Melody, or a bell arpeggio in city pop sections without one.
      for (const n of mel) {
        if (Math.floor(n.s / 16) === i) ev.push({ t: 'lead', s: n.s % 16, d: n.d, m: n.m, v: n.v, inst: t.lead, j: br.range(-0.004, 0.008) });
      }
      if (sec.arp && !isOutro) {
        for (let st = 0; st < 16; st += 2) {
          const v = segAt(st).voicing;
          const up = v.map((m) => m + 12);
          const seq = up.concat(up.slice(1, -1).reverse());
          ev.push({ t: 'lead', s: st, d: 2, m: seq[arpIdx++ % seq.length], v: st % 4 === 0 ? 0.42 : 0.3, inst: 'bell' });
        }
      }

      const byStep = Array.from({ length: 16 }, () => []);
      for (const e of ev) byStep[e.s].push(e);
      bars.push({ section: si, byStep });
    }
  });
  t.bars = bars;
  return t;
}

function drumBar(t, sec, i, br, ev, { isIntro, isOutro, isFill }) {
  const hh = t.style === 'hiphop';
  const drums = [];
  const add = (type, s, v, extra) => drums.push({ t: type, s, v: clamp(v + br.range(-0.06, 0.06), 0.05, 1), j: br.range(-0.003, 0.003), ...extra });
  let kicks = [];

  if (isIntro) {
    if (hh && t.introHats && i >= 2) for (let s = 0; s < 16; s += 2) add('hat', s, s % 4 === 0 ? 0.3 : 0.22);
    if (!hh && i >= 2) for (let s = 0; s < 16; s++) add('shaker', s, s % 2 === 0 ? 0.4 : 0.25);
    if (i === sec.len - 1) add(hh ? 'snare' : 'clap', 12, 0.35);
    ev.push(...drums);
    return kicks;
  }

  kicks = (sec.drumAlt && i % 2 === 1 ? sec.kicksAlt : sec.kicks).slice();
  if (sec.lite && i < 4) kicks = [];
  if (i % 4 === 3 && br.chance(0.4)) kicks.push(br.pick(hh ? [13, 14, 15] : [11, 14, 15]));
  for (const s of kicks) add('kick', s, s === 0 ? 0.95 : 0.8);

  // Backbeat.
  for (const s of [4, 12]) {
    if (t.snare !== 'clap') add('snare', s, 0.85);
    if (t.snare !== 'snare') add('clap', s, 0.75);
  }
  if (hh) for (const s of [7, 15]) if (br.chance(0.25)) add('snare', s, 0.22);
  for (const s of t.rim) add('rim', s, 0.4);

  // Hats.
  const openAt14 = br.chance(hh ? 0.18 : 0.3);
  const hat = (s, v) => (s === 14 && openAt14 ? add('ohat', s, v + 0.05) : add('hat', s, v));
  switch (t.hats) {
    case 'eighths':
      for (let s = 0; s < 16; s += 2) hat(s, s % 4 === 0 ? 0.5 : 0.36);
      for (let s = 1; s < 16; s += 2) if (br.chance(0.12)) add('hat', s, 0.2);
      break;
    case 'lazy16':
      for (let s = 0; s < 16; s++) if (s % 2 === 0 || br.chance(0.7)) hat(s, s % 2 === 0 ? 0.42 : 0.18);
      break;
    case 'offbeat':
      for (let s = 2; s < 16; s += 4) hat(s, 0.45);
      for (let s = 0; s < 16; s += 4) if (br.chance(0.4)) add('hat', s, 0.2);
      break;
    case 'sixteenths':
      for (let s = 0; s < 16; s++) hat(s, [0.42, 0.18, 0.3, 0.18][s % 4]);
      break;
    case 'disco':
      for (let s = 0; s < 16; s += 2) add(s % 4 === 2 ? 'ohat' : 'hat', s, s % 4 === 2 ? 0.32 : 0.28);
      break;
    case 'shaker':
      for (let s = 0; s < 16; s += 2) hat(s, s % 4 === 0 ? 0.36 : 0.28);
      for (let s = 0; s < 16; s++) add('shaker', s, s % 2 === 0 ? 0.32 : 0.22);
      break;
  }

  if (isFill) {
    const fill = hh ? br.pick(['roll', 'drop', 'kick', 'none']) : br.pick(['toms', 'roll', 'none']);
    if (fill === 'drop') {
      for (let k = drums.length - 1; k >= 0; k--) if (drums[k].s >= 8) drums.splice(k, 1);
      kicks = kicks.filter((s) => s < 8);
    } else if (fill === 'roll') {
      for (let k = drums.length - 1; k >= 0; k--) if (drums[k].s >= 13 && drums[k].t !== 'kick') drums.splice(k, 1);
      [13, 14, 15].forEach((s, n) => add('snare', s, 0.35 + n * 0.17));
    } else if (fill === 'kick') {
      for (const s of [14, 15]) if (!kicks.includes(s)) (kicks.push(s), add('kick', s, 0.7));
    } else if (fill === 'toms') {
      for (let k = drums.length - 1; k >= 0; k--) if (drums[k].s >= 12 && drums[k].t !== 'kick') drums.splice(k, 1);
      [12, 13, 14, 15].forEach((s, n) => add('tom', s, 0.7, { m: [52, 49, 45, 41][n] }));
    }
  }
  if (isOutro) {
    for (let k = drums.length - 1; k >= 0; k--) if (drums[k].s >= 8) drums.splice(k, 1);
    kicks = kicks.filter((s) => s < 8);
  }
  ev.push(...drums);
  return kicks.sort((a, b) => a - b);
}

function bassBar(t, br, ev, segs, segAt, kicks, nextRoot, isOutro) {
  const hh = t.style === 'hiphop';
  const lo = hh ? 33 : 35;
  const midi = (pc) => lo + ((pc - lo + 120) % 12);
  const notes = [];
  const add = (s, d, m, v) => notes.push({ t: 'bass', s, d, m, v: clamp(v + br.range(-0.05, 0.05), 0.1, 1), j: br.range(-0.002, 0.006) });

  if (isOutro) {
    add(0, 8, midi(segs[0].chord.root), 0.9);
    ev.push(...notes);
    return;
  }

  if (t.bassMode === 'hold' || t.bassMode === 'kick') {
    const hitSet = new Set([0, ...segs.map((g) => g.step)]);
    if (t.bassMode === 'kick') for (const k of kicks) hitSet.add(k);
    else for (const g of segs) if (g.len >= 12 && br.chance(0.5)) hitSet.add(g.step + 10);
    const hits = [...hitSet].sort((a, b) => a - b);
    const approach = br.chance(0.35) && nextRoot !== segs[segs.length - 1].chord.root;
    hits.forEach((s, k) => {
      if (approach && s >= 14) return;
      const seg = segAt(s);
      let end = Math.min(k + 1 < hits.length ? hits[k + 1] : 16, seg.step + seg.len);
      if (approach) end = Math.min(end, 14);
      let m = midi(seg.chord.root);
      if (s !== seg.step && br.chance(0.3)) m += br.pick([7, 12]);
      add(s, Math.max(1, Math.min(end - s - (t.bassMode === 'kick' ? 0.5 : 1), 12)), m, s === 0 ? 0.95 : 0.8);
    });
    if (approach) {
      const target = midi(nextRoot);
      add(14, 2, target + br.pick([-1, 1, -5 + 12 * (target - 5 < lo ? 1 : 0)]), 0.7);
    }
  } else if (t.bassMode === 'octave') {
    for (let s = 0; s < 16; s += 2) {
      const m = midi(segAt(s).chord.root) + ((s / 2) % 2 ? 12 : 0);
      add(s, 1.2, m, s % 4 === 0 ? 0.85 : 0.62);
      if (br.chance(0.15)) add(s + 1, 0.8, midi(segAt(s + 1).chord.root) + 12, 0.38);
    }
  } else if (t.bassMode === 'synco') {
    for (const [s, iv, d] of [[0, 0, 3], [3, 0, 2], [6, 12, 2], [8, 0, 2], [11, 7, 2], [14, 12, 2]]) {
      const seg = segAt(s);
      let m = midi(seg.chord.root) + iv;
      if (s !== seg.step && s > 0 && segs.some((g) => g.step === s)) m = midi(seg.chord.root);
      add(s, d, m, s === 0 || s === 8 ? 0.9 : 0.7);
    }
    for (const g of segs) if (g.step > 0 && ![3, 6, 8, 11, 14].includes(g.step)) add(g.step, 2, midi(g.chord.root), 0.85);
  } else {
    // walking quarters
    let prev = midi(segs[0].chord.root);
    for (let q = 0; q < 4; q++) {
      const s = q * 4;
      const seg = segAt(s);
      const targetRoot = s + 4 < 16 ? segAt(s + 4).chord.root : nextRoot;
      let m;
      if (s === seg.step || q === 0) m = midi(seg.chord.root);
      else if (targetRoot !== seg.chord.root) m = midi(targetRoot) + br.pick([-1, 1]);
      else m = nearestTone([seg.chord.pcs[1], seg.chord.pcs[2]], prev + 3);
      add(s, 3, m, q === 0 ? 0.9 : 0.72);
      prev = m;
    }
  }
  ev.push(...notes);
}

function genMotif(r, hh) {
  const n = hh ? r.int(3, 6) : r.int(4, 8);
  const cand = [];
  for (let s = 0; s < 28; s++) cand.push([s, s % 4 === 0 ? 4 : s % 2 === 0 ? 3 : hh ? 0.6 : 1.6]);
  const pos = [];
  for (let k = 0; k < n && cand.length; k++) {
    const p = r.weighted(cand);
    pos.push(p);
    cand.splice(cand.findIndex((c) => c[0] === p), 1);
  }
  pos.sort((a, b) => a - b);
  const steps = [[0, 2], [1, 4], [-1, 4], [2, 2], [-2, 2], [3, 1], [-3, 1], [4, 0.4], [-4, 0.4]];
  return pos.map((p, k) => ({ p, delta: k === 0 ? 0 : r.weighted(steps) }));
}

function varyMotif(r, motif) {
  const v = motif.map((n) => ({ ...n }));
  const k = Math.max(1, v.length - r.int(1, 2));
  for (let i = k; i < v.length; i++) v[i].delta = r.pick([-2, -1, 1, 2, 3]);
  return v;
}

function composeMelody(t, r, sec) {
  const hh = t.style === 'hiphop';
  const [lo, hi] = LEAD_RANGE[t.lead];
  const motif = genMotif(r, hh);
  const variant = varyMotif(r, motif);
  const ending = motif.filter((n) => n.p < 16).concat([{ p: 16, delta: 0, land: true }]);
  const notes = [];
  let prev = null;
  const chunks = Math.max(1, Math.floor(sec.len / 2));
  for (let c = 0; c < chunks; c++) {
    const m = c === chunks - 1 && chunks > 1 ? ending : c % 2 === 1 ? variant : motif;
    m.forEach((n, k) => {
      const s = c * 32 + n.p;
      const { c: chord } = chordAt(sec.prog, s);
      let note;
      if (n.land) note = nearestTone([chord.root, chord.pcs[1]], prev ?? (lo + hi) / 2);
      else if (k === 0 || prev === null) note = nearestTone(chord.pcs, prev ?? Math.round((lo + hi) / 2));
      else note = scaleWalk(t.scale, prev, n.delta);
      if (n.p % 8 === 0 && !n.land) note = nearestTone(chord.pcs, note);
      while (note > hi) note -= 12;
      while (note < lo) note += 12;
      const nextP = k + 1 < m.length ? m[k + 1].p : null;
      const d = n.land ? r.int(8, 14) : nextP !== null ? Math.min(nextP - n.p, 8) : Math.min(r.int(3, 8), 32 - n.p);
      notes.push({ s, d, m: note, v: clamp(0.68 + (n.p % 4 === 0 ? 0.1 : 0) + r.range(-0.08, 0.08), 0.2, 1) });
      prev = note;
    });
  }
  return notes;
}

// ---------------------------------------------------------------- engine

export class LofiMusic {
  /**
   * @param {object} [opts]
   * @param {string|number} [opts.seed]  game seed; random if omitted
   * @param {BaseAudioContext} [opts.context]  share the game's AudioContext
   * @param {AudioNode} [opts.destination]  defaults to context.destination
   * @param {number} [opts.volume]  0..1
   * @param {'auto'|'hiphop'|'citypop'} [opts.style]
   */
  constructor(opts = {}) {
    this.ctx = opts.context || new (globalThis.AudioContext || globalThis.webkitAudioContext)();
    this._ownsContext = !opts.context;
    this.volume = opts.volume ?? 0.8;
    this.tempoScale = 1;
    this.muffle = 0;
    this.styleMode = opts.style || 'auto';
    this.playing = false;
    this._listeners = {};
    this._voices = [];
    this._markers = [];
    this._view = {};
    this._partOn = Object.fromEntries(PARTS.map((p) => [p, true]));
    this._build(opts.destination || this.ctx.destination);
    this.newGame(opts.seed);
  }

  // ---- public API

  /** Start or resume. Call from a click/tap handler the first time. */
  start() {
    if (this.playing) return;
    if (this.ctx.state !== 'running' && this.ctx.resume) this.ctx.resume();
    this.playing = true;
    const now = this.ctx.currentTime;
    const g = this.master.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(0, now);
    g.linearRampToValueAtTime(this.volume, now + 0.4);
    this._nextTime = now + 0.08;
    this._startVinyl(now);
    this._timer = setInterval(() => this._tick(), 25);
    this._tick();
  }

  /** Pause. start() continues from the same spot. */
  stop() {
    if (!this.playing) return;
    this.playing = false;
    clearInterval(this._timer);
    const now = this.ctx.currentTime;
    const g = this.master.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + 0.25);
    this._silenceVoices(now + 0.3);
    if (this._vinylSrc) this._vinylSrc.stop(now + 0.3);
    this._vinylSrc = null;
    this._markers = [];
  }

  /** New music for a new game. The same seed always gives the same music. */
  newGame(seed = randomSeed()) {
    this.seed = String(seed);
    this._trackIndex = -1;
    this._prevStyle = null;
    this._skip = false;
    this._view = {};
    this._markers = [];
    if (this.playing) {
      const now = this.ctx.currentTime;
      this._silenceVoices(now + 0.06);
      this.sweep.frequency.cancelScheduledValues(now);
      this.pump.gain.cancelScheduledValues(now);
      this.pump.gain.setValueAtTime(1, now);
      this._nextTime = now + 0.12;
    }
    this._nextTrack();
    return this.seed;
  }

  /** 'auto' alternates styles every track; 'hiphop' or 'citypop' locks one. */
  setStyle(mode) {
    this.styleMode = mode;
    if (mode !== 'auto' && this.track && this.track.style !== mode) this.skip();
  }

  /** Jump to the next track at the next bar line. */
  skip() {
    this._skip = true;
  }

  setVolume(v) {
    this.volume = clamp(v, 0, 1);
    if (this.playing) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
  }

  /** Multiplies the track's tempo. 1 = as composed. Handy for tying music to run speed. */
  setTempoScale(x) {
    this.tempoScale = clamp(x, 0.5, 2);
  }

  /** 0 = clear, 1 = heavily muffled (pause menu, game over, tunnels). */
  setMuffle(x) {
    this.muffle = clamp(x, 0, 1);
    this.muffleFilter.frequency.setTargetAtTime(this._open * Math.pow(300 / this._open, this.muffle), this.ctx.currentTime, 0.08);
  }

  setPart(part, on) {
    this._partOn[part] = on;
    this.parts[part].gain.setTargetAtTime(on ? PART_LEVEL[part] : 0, this.ctx.currentTime, 0.03);
  }

  isPartOn(part) {
    return this._partOn[part];
  }

  /** Listen for 'note' ({part, midi, time, dur, vel}) or 'track' (track info). Returns an unsubscribe function. */
  on(type, fn) {
    (this._listeners[type] ||= new Set()).add(fn);
    return () => this._listeners[type].delete(fn);
  }

  /** What is audible right now (scheduling runs slightly ahead of the speakers). */
  getState() {
    const now = this.ctx.currentTime;
    while (this._markers.length && this._markers[0].time <= now) Object.assign(this._view, this._markers.shift().data);
    const v = this._view;
    const tr = v.track || this.track;
    let barPos = 0;
    let secondsLeft = 0;
    if (tr && v.barTime !== undefined && this.playing) {
      const barDur = 240 / (tr.bpm * this.tempoScale);
      barPos = v.bar + clamp((now - v.barTime) / barDur, 0, 1);
      secondsLeft = Math.max(0, (tr.nBars - barPos) * barDur);
    }
    return {
      playing: this.playing,
      seed: this.seed,
      track: tr && this.trackInfo(tr),
      chord: v.chord || null,
      bar: barPos,
      progress: tr ? barPos / tr.nBars : 0,
      secondsLeft,
      tempo: tr ? tr.bpm * this.tempoScale : 0,
    };
  }

  trackInfo(tr = this.track) {
    return {
      index: tr.index,
      style: tr.style,
      styleLabel: STYLE_INFO[tr.style].label,
      styleJp: STYLE_INFO[tr.style].jp,
      title: tr.title,
      route: tr.route,
      key: tr.keyName,
      bpm: tr.bpm,
      bars: tr.nBars,
      lead: tr.lead,
      sections: tr.sections,
    };
  }

  /** Close the AudioContext if this engine created it. */
  destroy() {
    this.stop();
    if (this._ownsContext) this.ctx.close();
  }

  /** Render music to an AudioBuffer without playing it (tests, previews). */
  static async renderOffline({ seed, seconds = 30, sampleRate = 44100, style = 'auto' } = {}) {
    const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
    const m = new LofiMusic({ seed, context: ctx, style });
    m.playing = true;
    m.master.gain.value = m.volume;
    m._nextTime = 0.05;
    m._startVinyl(0);
    m._pump(seconds);
    return ctx.startRendering();
  }

  // ---- scheduling

  _emit(type, data) {
    const ls = this._listeners[type];
    if (ls) for (const fn of ls) fn(data);
  }

  _nextTrack() {
    this._trackIndex++;
    let style;
    if (this.styleMode !== 'auto') style = this.styleMode;
    else if (this._prevStyle) style = this._prevStyle === 'hiphop' ? 'citypop' : 'hiphop';
    else style = new Rng(hashSeed(this.seed, 'first')).chance(0.5) ? 'hiphop' : 'citypop';
    this._prevStyle = style;
    this.track = composeTrack(this.seed, this._trackIndex, style);
    this._bar = 0;
    this._step = 0;
  }

  _stepDur() {
    return 60 / (this.track.bpm * this.tempoScale) / 4;
  }

  _tick() {
    const hidden = typeof document !== 'undefined' && document.hidden;
    this._pump(this.ctx.currentTime + (hidden ? LOOKAHEAD_HIDDEN : LOOKAHEAD));
  }

  _pump(until) {
    if (this._nextTime < this.ctx.currentTime - 0.1) this._nextTime = this.ctx.currentTime + 0.02; // recover from a stall
    while (this._nextTime < until) {
      this._playStep(this._nextTime);
      this._nextTime += this._stepDur();
      if (++this._step === 16) {
        this._step = 0;
        if (++this._bar >= this.track.nBars || this._skip) {
          this._skip = false;
          this._nextTrack();
        }
      }
    }
    const now = this.ctx.currentTime;
    if (this._voices.length > 256) this._voices = this._voices.filter((v) => v.end > now);
    if (this._markers.length > 1024) this._markers.splice(0, this._markers.length - 1024);
  }

  _playStep(t0) {
    const tr = this.track;
    const step = this._step;
    const sd = this._stepDur();
    let t = t0;
    if (step % 2 === 1) t += tr.swing16 * sd;
    else if (step % 4 === 2) t += tr.swing8 * sd;
    if (step === 0) this._markers.push({ time: t0, data: { track: tr, bar: this._bar, barTime: t0 } });
    for (const ev of tr.bars[this._bar].byStep[step]) this._trigger(ev, Math.max(t + (ev.j || 0), t0), sd, tr);
  }

  _trigger(ev, t, sd, tr) {
    const note = (part, midi, dur, vel) => this._emit('note', { part, midi, time: t, dur, vel });
    switch (ev.t) {
      case 'start':
        this.toneFilter.frequency.setTargetAtTime(tr.tone, t, 0.3);
        this.vinylLevel.gain.setTargetAtTime(tr.crackle, t, 0.5);
        this._emit('track', { ...this.trackInfo(tr), time: t });
        break;
      case 'chord':
        this._markers.push({ time: t, data: { chord: ev.name } });
        break;
      case 'fx': {
        const f = this.sweep.frequency;
        if (ev.kind === 'close') {
          f.setValueAtTime(this._open, t);
          f.exponentialRampToValueAtTime(600, t + 15 * sd);
        } else {
          f.setValueAtTime(700, t);
          f.exponentialRampToValueAtTime(this._open, t + 24 * sd);
        }
        break;
      }
      case 'bell':
        this._tramBell(t);
        note('bell', 91, 0.4, 0.6);
        break;
      case 'keys':
        ev.n.forEach((m, i) => {
          this._ep(t + i * tr.strum, m, ev.d * sd, ev.v, tr.style === 'citypop', this.parts.keys);
          note('keys', m, ev.d * sd, ev.v);
        });
        break;
      case 'pad':
        this._pad(t, ev.n, ev.d * sd, ev.v);
        for (const m of ev.n) note('pad', m, ev.d * sd, ev.v);
        break;
      case 'bass':
        this._bass(t, ev.m, ev.d * sd, ev.v, tr.style);
        note('bass', ev.m, ev.d * sd, ev.v);
        break;
      case 'lead':
        this._lead(t, ev.m, ev.d * sd, ev.v, ev.inst);
        note('melody', ev.m, ev.d * sd, ev.v);
        break;
      default:
        this._drum(ev.t, t, ev.v, ev.m, tr.style);
        note('drums', ev.m || DRUM_NOTE[ev.t], 0.1, ev.v);
    }
  }

  // ---- audio graph

  _build(destination) {
    const c = this.ctx;
    const sr = c.sampleRate;
    this._open = Math.min(18000, sr * 0.45); // fully open filter, below Nyquist

    this.master = c.createGain();
    this.master.gain.value = 0;
    this.master.connect(destination);

    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;
    comp.connect(this.master);

    // Tape wow and flutter: a short delay line with a wobbling delay time.
    const wow = c.createDelay(0.05);
    wow.delayTime.value = 0.012;
    for (const [rate, depth] of [[0.33, 0.0016], [5.6, 0.00012]]) {
      const lfo = c.createOscillator();
      lfo.frequency.value = rate;
      const lg = c.createGain();
      lg.gain.value = depth;
      lfo.connect(lg).connect(wow.delayTime);
      lfo.start();
    }
    wow.connect(comp);

    this.sweep = c.createBiquadFilter();
    this.sweep.type = 'lowpass';
    this.sweep.frequency.value = this._open;
    this.sweep.Q.value = 2.5;
    this.sweep.connect(wow);

    this.muffleFilter = c.createBiquadFilter();
    this.muffleFilter.type = 'lowpass';
    this.muffleFilter.frequency.value = this._open;
    this.muffleFilter.Q.value = 0.5;
    this.muffleFilter.connect(this.sweep);

    this.toneFilter = c.createBiquadFilter();
    this.toneFilter.type = 'lowpass';
    this.toneFilter.frequency.value = 6000;
    this.toneFilter.Q.value = 0.4;
    this.toneFilter.connect(this.muffleFilter);

    const shaper = c.createWaveShaper();
    const curve = new Float32Array(2048);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(1.8 * x) / Math.tanh(1.8);
    }
    shaper.curve = curve;
    shaper.oversample = '2x';
    shaper.connect(this.toneFilter);

    const mix = c.createGain();
    mix.gain.value = 0.7;
    mix.connect(shaper);

    // Everything except drums ducks a little on each kick.
    this.pump = c.createGain();
    this.pump.connect(mix);

    const reverb = c.createConvolver();
    reverb.buffer = this._impulse(2.4);
    this.reverbIn = c.createGain();
    this.reverbIn.connect(reverb);
    const revOut = c.createGain();
    revOut.gain.value = 0.8;
    reverb.connect(revOut).connect(mix);

    this.parts = {};
    for (const p of PARTS) {
      const g = c.createGain();
      g.gain.value = PART_LEVEL[p];
      this.parts[p] = g;
      if (REVERB_SEND[p]) {
        const s = c.createGain();
        s.gain.value = REVERB_SEND[p];
        g.connect(s).connect(this.reverbIn);
      }
    }
    this.parts.drums.connect(mix);
    this.parts.bell.connect(mix);
    this.parts.bass.connect(this.pump);
    this.parts.pad.connect(this.pump);
    this.parts.melody.connect(this.pump);

    // Rhodes-style tremolo on the keys.
    const trem = c.createGain();
    const tl = c.createOscillator();
    tl.frequency.value = 4.2;
    const tg = c.createGain();
    tg.gain.value = 0.12;
    tl.connect(tg).connect(trem.gain);
    tl.start();
    const keysLp = c.createBiquadFilter();
    keysLp.type = 'lowpass';
    keysLp.frequency.value = 3200;
    this.parts.keys.connect(keysLp).connect(trem).connect(this.pump);

    // Vinyl crackle and hiss bypass the mix bus but not the muffle.
    this.vinylLevel = c.createGain();
    const vhp = c.createBiquadFilter();
    vhp.type = 'highpass';
    vhp.frequency.value = 300;
    this.parts.vinyl.connect(vhp).connect(this.vinylLevel).connect(this.muffleFilter);

    // Shared noise and vinyl buffers.
    this._noise = c.createBuffer(1, sr * 2, sr);
    const nd = this._noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this._vinylBuf = this._vinyl(6);
  }

  _impulse(seconds) {
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const x = i / len;
        const k = 0.5 - 0.42 * x; // darker as the tail decays
        lp += k * (Math.random() * 2 - 1 - lp);
        d[i] = lp * Math.pow(1 - x, 3) * (i < c.sampleRate * 0.01 ? i / (c.sampleRate * 0.01) : 1);
      }
    }
    return buf;
  }

  _vinyl(seconds) {
    const c = this.ctx;
    const sr = c.sampleRate;
    const len = Math.floor(sr * seconds);
    const buf = c.createBuffer(2, len, sr);
    const r = new Rng(12345);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        lp += 0.08 * (r.next() * 2 - 1 - lp);
        d[i] = lp * 0.15;
      }
      const pops = seconds * 9;
      for (let k = 0; k < pops; k++) {
        const at = Math.floor(r.next() * (len - 400));
        const big = r.chance(0.08);
        const amp = (big ? r.range(0.5, 0.9) : r.range(0.1, 0.35)) * (r.chance(0.5) ? 1 : -1);
        const decay = big ? 60 : 12;
        for (let j = 0; j < decay * 5; j++) d[at + j] += amp * Math.exp(-j / decay) * (j % 2 ? -0.6 : 1);
      }
    }
    return buf;
  }

  _startVinyl(t) {
    if (this._vinylSrc) return;
    const s = this.ctx.createBufferSource();
    s.buffer = this._vinylBuf;
    s.loop = true;
    s.connect(this.parts.vinyl);
    s.start(t);
    this._vinylSrc = s;
  }

  _voice(node, end) {
    node.stop(end);
    this._voices.push({ node, end });
  }

  _silenceVoices(when) {
    for (const v of this._voices) {
      if (v.end > when) {
        try {
          v.node.stop(when);
        } catch {
          /* already stopped */
        }
      }
    }
    this._voices = [];
  }

  _duck(t) {
    const g = this.pump.gain;
    g.setValueAtTime(1, t);
    g.linearRampToValueAtTime(0.78, t + 0.012);
    g.setTargetAtTime(1, t + 0.02, 0.09);
  }

  _osc(type, freq, t) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.start(t);
    return o;
  }

  _gain(v = 1) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    return g;
  }

  _filter(type, freq, q = 1) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  _noiseSrc(t, dur) {
    const s = this.ctx.createBufferSource();
    s.buffer = this._noise;
    s.start(t, Math.random() * 1.5, dur);
    return s;
  }

  // Exponential-ish decay envelope from peak to silence.
  _perc(g, t, peak, decay, attack = 0.002) {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0005, t + attack + decay);
  }

  // ---- instruments

  _drum(type, t, v, m, style) {
    const out = this.parts.drums;
    const hh = style === 'hiphop';
    switch (type) {
      case 'kick': {
        const o = this._osc('sine', hh ? 120 : 150, t);
        o.frequency.exponentialRampToValueAtTime(hh ? 44 : 50, t + 0.12);
        const g = this._gain(0);
        this._perc(g, t, v, hh ? 0.5 : 0.32, 0.003);
        o.connect(g).connect(out);
        this._voice(o, t + 0.6);
        const n = this._noiseSrc(t, 0.03);
        const ng = this._gain(0);
        this._perc(ng, t, v * 0.3, 0.02, 0.001);
        n.connect(this._filter('lowpass', 2500)).connect(ng).connect(out);
        this._duck(t);
        break;
      }
      case 'snare': {
        const n = this._noiseSrc(t, 0.3);
        const g = this._gain(0);
        this._perc(g, t, v * 0.55, hh ? 0.2 : 0.16);
        n.connect(this._filter('bandpass', hh ? 1500 : 1900, 0.7)).connect(g).connect(out);
        const o = this._osc('triangle', 185, t);
        o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
        const og = this._gain(0);
        this._perc(og, t, v * 0.45, 0.09);
        o.connect(og).connect(out);
        this._voice(o, t + 0.15);
        break;
      }
      case 'clap': {
        const n = this._noiseSrc(t, 0.3);
        const g = this._gain(0);
        g.gain.setValueAtTime(0, t);
        for (let k = 0; k < 3; k++) {
          const tt = t + k * 0.011;
          g.gain.setValueAtTime(v * 0.5, tt);
          g.gain.exponentialRampToValueAtTime(v * 0.06, tt + 0.009);
        }
        g.gain.setValueAtTime(v * 0.5, t + 0.033);
        g.gain.exponentialRampToValueAtTime(0.0005, t + 0.22);
        n.connect(this._filter('bandpass', 1150, 1.4)).connect(g).connect(out);
        break;
      }
      case 'hat':
      case 'ohat': {
        const open = type === 'ohat';
        const n = this._noiseSrc(t, open ? 0.4 : 0.07);
        const g = this._gain(0);
        this._perc(g, t, v * 0.32, open ? (hh ? 0.32 : 0.18) : 0.045, 0.001);
        n.connect(this._filter('highpass', 7200, 0.8)).connect(g).connect(out);
        break;
      }
      case 'rim': {
        const o = this._osc('triangle', 1700, t);
        const g = this._gain(0);
        this._perc(g, t, v * 0.5, 0.035, 0.001);
        o.connect(this._filter('bandpass', 1700, 3)).connect(g).connect(out);
        this._voice(o, t + 0.06);
        break;
      }
      case 'shaker': {
        const n = this._noiseSrc(t, 0.1);
        const g = this._gain(0);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(v * 0.18, t + 0.014);
        g.gain.exponentialRampToValueAtTime(0.0005, t + 0.075);
        n.connect(this._filter('bandpass', 6000, 0.9)).connect(g).connect(out);
        break;
      }
      case 'tom': {
        const f = mtof(m);
        const o = this._osc('sine', f, t);
        o.frequency.exponentialRampToValueAtTime(f * 0.75, t + 0.25);
        const g = this._gain(0);
        this._perc(g, t, v * 0.7, 0.32);
        o.connect(g).connect(out);
        this._voice(o, t + 0.4);
        break;
      }
    }
  }

  // FM electric piano. bright adds a DX7-style tine ping for city pop.
  _ep(t, m, dur, v, bright, out) {
    const f = mtof(m);
    const end = t + dur;
    const car = this._osc('sine', f, t);
    const mod = this._osc('sine', f, t);
    const mg = this._gain(0);
    mg.gain.setValueAtTime(f * (bright ? 2.4 : 1.5) * v, t);
    mg.gain.setTargetAtTime(f * 0.2, t, bright ? 0.15 : 0.35);
    mod.connect(mg).connect(car.frequency);
    const g = this._gain(0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v * 0.2, t + 0.005);
    g.gain.setTargetAtTime(0, t + 0.01, bright ? 1.1 : 1.6);
    g.gain.setTargetAtTime(0, end, 0.07);
    car.connect(g).connect(out);
    this._voice(car, end + 0.5);
    this._voice(mod, end + 0.5);
    if (bright) {
      const tine = this._osc('sine', Math.min(f * 7, 12000), t);
      const tg = this._gain(0);
      this._perc(tg, t, v * 0.025, 0.07, 0.001);
      tine.connect(tg).connect(out);
      this._voice(tine, t + 0.1);
    }
  }

  _fm(t, m, dur, v, { ratio, index, tau, amp, decay }, out) {
    const f = mtof(m);
    const end = t + dur;
    const car = this._osc('sine', f, t);
    const mod = this._osc('sine', f * ratio, t);
    const mg = this._gain(0);
    mg.gain.setValueAtTime(f * index * v, t);
    mg.gain.setTargetAtTime(f * index * 0.08, t, tau);
    mod.connect(mg).connect(car.frequency);
    const g = this._gain(0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v * amp, t + 0.004);
    g.gain.setTargetAtTime(0, t + 0.01, decay);
    g.gain.setTargetAtTime(0, end, 0.12);
    car.connect(g).connect(out);
    this._voice(car, end + 0.7);
    this._voice(mod, end + 0.7);
  }

  _pad(t, notes, dur, v) {
    const lp = this._filter('lowpass', 1400, 0.3);
    const g = this._gain(0);
    const peak = v * 0.055;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.4);
    g.gain.setValueAtTime(peak, Math.max(t + 0.4, t + dur - 0.05));
    g.gain.linearRampToValueAtTime(0, t + dur + 0.6);
    for (const m of notes) {
      for (const det of [-9, 9]) {
        const o = this._osc('sawtooth', mtof(m), t);
        o.detune.value = det;
        o.connect(lp);
        this._voice(o, t + dur + 0.7);
      }
    }
    lp.connect(g).connect(this.parts.pad);
  }

  _bass(t, m, dur, v, style) {
    const f = mtof(m);
    const end = t + dur;
    const hh = style === 'hiphop';
    const g = this._gain(0);
    const lp = this._filter('lowpass', hh ? 650 : 1600, hh ? 0.7 : 5);
    if (!hh) lp.frequency.exponentialRampToValueAtTime(330, t + 0.15);
    const o = this._osc(hh ? 'sine' : 'sawtooth', f, t);
    const sub = this._osc(hh ? 'triangle' : 'sine', f, t);
    const sg = this._gain(hh ? 0.35 : 0.8);
    o.connect(lp);
    sub.connect(sg).connect(lp);
    lp.connect(g).connect(this.parts.bass);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v * (hh ? 0.25 : 0.22), t + 0.008);
    g.gain.setTargetAtTime(v * (hh ? 0.18 : 0.14), t + 0.01, hh ? 0.3 : 0.15);
    g.gain.setTargetAtTime(0, end, 0.04);
    this._voice(o, end + 0.3);
    this._voice(sub, end + 0.3);
  }

  _lead(t, m, dur, v, inst) {
    const out = this.parts.melody;
    const f = mtof(m);
    const end = t + dur;
    switch (inst) {
      case 'epbell':
        return this._fm(t, m, dur, v, { ratio: 1, index: 2.5, tau: 0.2, amp: 0.22, decay: 1.2 }, out);
      case 'bell':
        return this._fm(t, m, dur, v, { ratio: 3.5, index: 1.6, tau: 0.12, amp: 0.2, decay: 0.9 }, out);
      case 'flute': {
        const o = this._osc('triangle', f, t);
        const s = this._osc('sine', f, t);
        const vib = this._osc('sine', 5.2, t);
        const vg = this._gain(0);
        vg.gain.setValueAtTime(0, t);
        vg.gain.linearRampToValueAtTime(f * 0.007, t + 0.35);
        vib.connect(vg);
        vg.connect(o.frequency);
        vg.connect(s.frequency);
        const g = this._gain(0);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(v * 0.2, t + 0.06);
        g.gain.setTargetAtTime(0, end, 0.08);
        o.connect(g);
        s.connect(g);
        g.connect(out);
        const n = this._noiseSrc(t, Math.min(dur, 0.3));
        const ng = this._gain(0);
        this._perc(ng, t, v * 0.1, 0.15, 0.02);
        n.connect(this._filter('bandpass', f * 1.5, 2)).connect(ng).connect(out);
        for (const x of [o, s, vib]) this._voice(x, end + 0.4);
        return;
      }
      case 'pluck': {
        const o = this._osc('sawtooth', f, t);
        const lp = this._filter('lowpass', f * 8, 3);
        lp.frequency.exponentialRampToValueAtTime(f * 1.6, t + 0.2);
        const g = this._gain(0);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(v * 0.26, t + 0.003);
        g.gain.setTargetAtTime(0, t + 0.005, 0.22);
        g.gain.setTargetAtTime(0, end, 0.05);
        o.connect(lp).connect(g).connect(out);
        this._voice(o, end + 0.3);
        return;
      }
      case 'square':
      case 'sawlead': {
        const sq = inst === 'square';
        const g = this._gain(0);
        const lp = this._filter('lowpass', sq ? f * 4 : f * 6, sq ? 0.7 : 1.5);
        if (!sq) lp.frequency.exponentialRampToValueAtTime(f * 2.5, t + 0.3);
        const glide = this._lastLead && t - this._lastLead.end < 0.15 ? this._lastLead.f : null;
        const oscs = sq ? [0] : [-8, 8];
        for (const det of oscs) {
          const o = this._osc(sq ? 'square' : 'sawtooth', glide || f, t);
          if (glide) o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
          o.detune.value = det;
          o.connect(lp);
          this._voice(o, end + 0.3);
        }
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(v * (sq ? 0.12 : 0.11), t + 0.012);
        g.gain.setTargetAtTime(v * (sq ? 0.09 : 0.08), t + 0.02, 0.2);
        g.gain.setTargetAtTime(0, end, 0.06);
        lp.connect(g).connect(out);
        this._lastLead = { f, end };
        return;
      }
    }
  }

  // The "ding ding" of a Melbourne tram's foot gong.
  _tramBell(t) {
    const partials = [[1, 1, 1.6], [2.0, 0.3, 0.9], [2.76, 0.45, 0.7], [5.4, 0.12, 0.3]];
    for (const at of [t, t + 0.24]) {
      for (const [ratio, amp, dec] of partials) {
        const o = this._osc('sine', 784 * ratio, at);
        const g = this._gain(0);
        this._perc(g, at, 0.12 * amp, dec, 0.002);
        o.connect(g).connect(this.parts.bell);
        this._voice(o, at + dec + 0.05);
      }
    }
  }
}

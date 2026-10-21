// Sound: one AudioContext shared by the lofi music engine and the synthesised
// sound effects, with one volume control (and mute) over both.

import { LofiMusic } from '../music/lofi.js';

const KEY = 'tram-surfer:sound';
export const VOLUME_STEPS = 5;

export class Sound {
  constructor() {
    this.ctx = null;
    this.music = null;
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* private mode */ }
    this.level = Number.isInteger(saved.level) ? Math.max(0, Math.min(VOLUME_STEPS, saved.level)) : 4;
    this.muted = !!saved.muted;
  }

  /** Must be called from a user gesture the first time. */
  unlock() {
    if (!this.ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.sfx = this.ctx.createGain();
      this.sfx.gain.value = 0.55;
      this.sfx.connect(this.master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.8;
      this.musicBus.connect(this.master);
      this.music = new LofiMusic({ context: this.ctx, destination: this.musicBus, volume: 1 });
      this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this._apply();
    }
    if (this.ctx.state !== 'running') this.ctx.resume();
  }

  get volume() {
    return this.muted ? 0 : this.level / VOLUME_STEPS;
  }

  setLevel(l) {
    this.level = Math.max(0, Math.min(VOLUME_STEPS, l));
    if (this.level > 0) this.muted = false;
    this._apply();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (!this.muted && this.level === 0) this.level = 3;
    this._apply();
  }

  _apply() {
    try { localStorage.setItem(KEY, JSON.stringify({ level: this.level, muted: this.muted })); } catch { /* ignore */ }
    if (!this.ctx) return;
    const v = this.volume;
    this.master.gain.setTargetAtTime(v * v, this.ctx.currentTime, 0.03);
  }

  // --- music -------------------------------------------------------------------

  newRun(seed) {
    if (!this.music) return;
    this.music.newGame(seed);
    this.music.setMuffle(0);
    this.music.setTempoScale(1);
    this.music.start();
  }
  muffle(x) { this.music?.setMuffle(x); }
  tempo(x) { this.music?.setTempoScale(x); }
  pauseMusic() { this.music?.stop(); }
  resumeMusic() { this.music?.start(); }

  // --- effects -------------------------------------------------------------------

  _env(node, t, a, peak, d) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0005, t + a + d);
    node.connect(g).connect(this.sfx);
    return g;
  }

  _tone(type, f0, f1, t, dur, peak = 0.3) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    this._env(o, t, 0.005, peak, dur);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  _noise(t, dur, type, f0, f1, peak = 0.3, q = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    s.connect(f);
    this._env(f, t, 0.01, peak, dur);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }

  play(name) {
    if (!this.ctx || this.volume === 0) return;
    const t = this.ctx.currentTime + 0.005;
    switch (name) {
      case 'coin':
        this._tone('square', 988, 988, t, 0.06, 0.12);
        this._tone('square', 1319, 1319, t + 0.06, 0.16, 0.12);
        break;
      case 'coin-blue':
        this._tone('square', 1319, 1319, t, 0.05, 0.12);
        this._tone('square', 1760, 1760, t + 0.05, 0.05, 0.12);
        this._tone('square', 2637, 2637, t + 0.1, 0.16, 0.1);
        break;
      case 'boing':
        this._tone('sine', 180, 720, t, 0.3, 0.4);
        this._tone('triangle', 90, 360, t, 0.25, 0.2);
        break;
      case 'jump':
        this._tone('triangle', 260, 640, t, 0.16, 0.35);
        this._noise(t, 0.15, 'bandpass', 900, 2400, 0.12, 2);
        break;
      case 'roll':
        this._noise(t, 0.3, 'bandpass', 2500, 500, 0.3, 1.5);
        break;
      case 'swish':
        this._noise(t, 0.12, 'highpass', 1800, 4000, 0.16);
        break;
      case 'land':
        this._tone('sine', 140, 60, t, 0.12, 0.35);
        break;
      case 'bump-wall':
        this._tone('sine', 120, 70, t, 0.1, 0.3);
        break;
      case 'stumble':
        this._tone('sine', 160, 50, t, 0.25, 0.5);
        this._noise(t, 0.2, 'lowpass', 1200, 200, 0.4);
        this._bark(t + 0.12);
        break;
      case 'crash':
        this._noise(t, 0.5, 'lowpass', 3000, 120, 0.6);
        this._tone('sine', 110, 40, t, 0.4, 0.6);
        this._chomp(t + 0.35);
        this._chomp(t + 0.6);
        break;
      case 'chomp':
        this._chomp(t);
        break;
      case 'horn':
        this._tone('sawtooth', 147, 147, t, 0.7, 0.16);
        this._tone('sawtooth', 185, 185, t, 0.7, 0.12);
        break;
      case 'bell':
        this._bell(t);
        this._bell(t + 0.22);
        break;
      case 'click':
        this._tone('square', 660, 660, t, 0.04, 0.1);
        break;
      case 'start':
        this._tone('square', 523, 523, t, 0.08, 0.12);
        this._tone('square', 784, 784, t + 0.08, 0.08, 0.12);
        this._tone('square', 1047, 1047, t + 0.16, 0.2, 0.12);
        break;
    }
  }

  _bell(t) {
    for (const [r, a, d] of [[1, 0.22, 0.9], [2.76, 0.1, 0.5], [5.4, 0.05, 0.25]]) this._tone('sine', 1150 * r, 1150 * r, t, d, a);
  }

  _bark(t) {
    this._tone('sawtooth', 520, 300, t, 0.09, 0.18);
    this._noise(t, 0.08, 'bandpass', 1400, 700, 0.2, 3);
  }

  _chomp(t) {
    this._noise(t, 0.07, 'bandpass', 900, 300, 0.5, 2);
    this._tone('square', 180, 90, t, 0.08, 0.2);
  }
}

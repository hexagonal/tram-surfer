// The run itself: the kid, the dingo, trams, ramps, barriers and coins, and
// the generator that lays them out ahead so there is always a way through.

import { LANES } from './street.js';
import { CLASSES } from './trams.js';
import { SCHEDULE, ZONE_SECONDS } from './zones.js';

const G = 30;            // gravity, m/s²
const JUMP_V = 9.6;      // ~1.5 m jump
const ROLL_TIME = 0.62;
const LANE_TIME = 0.16;
const STEP = 0.6;        // how far below a roof you can be and still land on it
const HALF_W = 1.33;     // half a tram's width
const DINGO_FAR = 14;
const DANGER_TIME = 20;  // after a stumble, a second one within this many seconds and you're caught
const SLOW_TIME = 2.5;   // a stumble knocks your speed down, recovering over this long
const SLOW_BY = 0.4;     // fraction of speed lost right after a stumble
const DINGO_WARN = 3.2;  // how close the dingo stays while you're in danger

const KINDS = [
  ['W', 'W'], ['W', 'Wcc'], ['Z', 'Z'], ['Z', 'Z'], ['E', 'E'], ['G', 'G'],
];
const FERRIES = [['F', 'ferry'], ['F', 'ferry2']];

const speedAt = (t) => 13 + 15 * (1 - Math.exp(-t / 160));

export class Run {
  constructor(seed, events = () => {}, { startZone = 'swanston' } = {}) {
    this.seed = seed;
    this.emit = events;
    let s = seed >>> 0 || 1;
    this.rand = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
    this.time = 0;
    this.speed = 13;
    this.dist = 0;
    this.score = 0;
    this.coins = 0;
    this.mult = 1;
    this.p = { lane: 1, prevLane: 1, x: 0, y: 0, vy: 0, z: 0, roll: 0, grounded: true, support: 0, laneT: 1 };
    this.dingo = { gap: 1.6, x: 0, y: 0, jumpT: 0, pounce: 0 };
    this.stumbleT = 0;   // seconds of danger left: stumble again before it runs out and you're caught
    this.slowT = 0;
    this.over = false;
    this.overT = 0;
    this.crash = null;
    this.trams = [];
    this.ramps = [];
    this.barriers = [];
    this.coinList = [];
    this.genZ = 25;
    this.slices = 0;
    // stretches of the run: Swanston St first, then the others at random
    this.zones = [{ id: startZone, z0: -100, z1: Infinity, plan: this.planLength(startZone, 0) }];
    this.seen = [startZone];
    this.genZone = startZone;
    this.camSupport = 0;
    this.generate();
  }

  pick(a) {
    return a[Math.floor(this.rand() * a.length)];
  }

  // ---------------------------------------------------------------------------
  // input

  move(dir) {
    if (this.over) return;
    const p = this.p;
    const lane = Math.max(0, Math.min(2, p.lane + dir));
    if (lane === p.lane) {
      this.emit('bump-wall');
      return;
    }
    p.prevLane = p.lane;
    p.lane = lane;
    p.laneT = 0;
    this.emit('swish');
  }

  jump() {
    if (this.over) return;
    const p = this.p;
    if (p.grounded) {
      p.vy = JUMP_V;
      p.grounded = false;
      p.roll = 0;
      this.emit('jump');
    }
  }

  roll() {
    if (this.over) return;
    const p = this.p;
    p.roll = ROLL_TIME;
    if (!p.grounded) p.vy = Math.min(p.vy, -18);
    this.emit('roll');
  }

  // ---------------------------------------------------------------------------
  // level generation

  generate() {
    while (this.genZ < this.p.z + 280) this.slice();
  }

  // ---------------------------------------------------------------------------
  // zones

  zoneAt(z) {
    const zs = this.zones;
    for (let i = zs.length - 1; i > 0; i--) if (z >= zs[i].z0) return zs[i].id;
    return zs[0].id;
  }

  /** Any zone but the last two seen, so none repeats until two others have come by. */
  nextZone() {
    const recent = this.seen.slice(-2);
    return this.pick(SCHEDULE.filter((id) => !recent.includes(id)));
  }

  /** Metres that will take about the zone's planned seconds to run, at the speed you'll be going then. */
  planLength(id, z0) {
    const tAt = this.time + Math.max(0, z0 - this.p.z) / Math.max(1, this.speed);
    let m = 0;
    for (let t = 0; t < ZONE_SECONDS[id]; t += 0.5) m += speedAt(tAt + t) * 0.5;
    return m;
  }

  get onRiver() {
    return this.genZone === 'yarra';
  }

  kind() {
    return this.pick(this.onRiver ? FERRIES : KINDS);
  }

  /** A low or high obstacle: roadworks barriers on the streets, crates and footbridges on the river. */
  barrier(ln, z, high) {
    if (!this.onRiver) return this.barriers.push({ x: LANES[ln], z, high });
    if (!high) return this.barriers.push({ x: LANES[ln], z, high: false, style: 'crate' });
    // a footbridge crosses the whole river
    if (this.barriers.some((b) => b.style === 'bridge' && b.z === z)) return;
    for (const x of LANES) this.barriers.push({ x, z, high: true, style: 'bridge' });
  }

  slice() {
    let zn = this.zones[this.zones.length - 1];
    if (this.genZ > zn.z0 + zn.plan) {
      // start the next zone with a clear run-in
      const z0 = this.genZ + 10;
      zn.z1 = z0;
      const id = this.nextZone();
      this.seen.push(id);
      zn = { id, z0, z1: Infinity, plan: this.planLength(id, z0) };
      this.zones.push(zn);
      this.genZ = z0 + 8;
    }
    this.genZone = zn.id;
    const gap = Math.max(14, this.speed * 1.2);
    const z = this.genZ + gap;
    const d = this.p.z;
    const roll = this.rand();
    this.slices++;
    if (this.slices <= 1) return this.slicePark(z, true);
    if (d > 250 && roll < 0.28) return this.sliceOncoming(z);
    if (roll < 0.62) return this.slicePark(z, false);
    return this.sliceBarriers(z);
  }

  coinLine(x, z0, z1, y = 0.45, step = 2.4) {
    for (let z = z0; z < z1; z += step) this.coinList.push({ x, y, z });
  }

  coinArc(x, zc, top, y0 = 0.45) {
    for (let k = -3; k <= 3; k++) {
      const u = k / 3.5;
      this.coinList.push({ x, y: y0 + top * (1 - u * u), z: zc + k * 1.8 });
    }
  }

  addTram(laneIdx, z, kindPair, vz = 0) {
    const [kind, livery] = kindPair;
    const K = CLASSES[kind];
    // H is the roof surface you run on (the roof plane sits just below the body top)
    const t = { kind, livery, x: LANES[laneIdx], z, L: K.L, H: K.H - 0.12, vz: 0, go: vz, moving: false };
    this.trams.push(t);
    return t;
  }

  slicePark(z, first) {
    // parked trams; one lane has a ramp up onto the roofs
    const lanes = [0, 1, 2].sort(() => this.rand() - 0.5);
    const rampLane = first ? 1 : lanes[0];
    // a full wall of trams (the ramp is the only way on) only once you've warmed up
    const maxTrams = z < 700 ? 2 : 3;
    const nTrams = first ? 1 : 1 + Math.floor(this.rand() * maxTrams);
    const rampLen = 9;
    let end = z;
    // ramp lane: ramp, then one or two trams nose to tail with a small hop
    const t1 = this.addTram(rampLane, z + rampLen, this.kind());
    this.ramps.push({ x: LANES[rampLane], z, len: rampLen, h: t1.H, tram: t1, gangplank: this.onRiver });
    for (let cz = z + 1; cz < z + rampLen; cz += 2) this.coinList.push({ x: LANES[rampLane], y: ((cz - z) / rampLen) * t1.H + 0.45, z: cz });
    this.coinLine(LANES[rampLane], t1.z + 1, t1.z + t1.L, t1.H + 0.3);
    end = t1.z + t1.L;
    if (!first && this.rand() < 0.5) {
      // nose to tail with a short hop between roofs
      const t2 = this.addTram(rampLane, end + 1.2 + this.rand(), this.kind());
      this.coinLine(LANES[rampLane], t2.z + 1, t2.z + t2.L, t2.H + 0.3);
      end = t2.z + t2.L;
    }
    // the other lanes: more parked trams to hop across, or barriers
    for (let i = 1; i < 3; i++) {
      const ln = lanes[i];
      if (first) {
        this.coinLine(LANES[ln], z + 4, z + 24);
        continue;
      }
      if (i < nTrams) {
        const t = this.addTram(ln, z + rampLen + this.rand() * 8, this.kind());
        end = Math.max(end, t.z + t.L);
      } else if (this.rand() < 0.6) {
        const bz = z + 6 + this.rand() * 14;
        const high = !this.onRiver && this.rand() < 0.4;
        this.barrier(ln, bz, high);
        if (!high) this.coinArc(LANES[ln], bz, 1.2);
      } else this.coinLine(LANES[ln], z + 4, z + 20);
    }
    this.genZ = end;
  }

  sliceBarriers(z) {
    let zz = z;
    const rows = 2 + Math.floor(this.rand() * 2);
    for (let r = 0; r < rows; r++) {
      if (this.onRiver && this.rand() < 0.35) {
        // a footbridge: roll under it in any lane
        this.barrier(0, zz, true);
        this.coinLine(LANES[Math.floor(this.rand() * 3)], zz - 5, zz + 6);
        zz += Math.max(14, this.speed * 1.2);
        continue;
      }
      const free = Math.floor(this.rand() * 3);
      for (let ln = 0; ln < 3; ln++) {
        const roll = this.rand();
        if (ln === free && roll < 0.7) {
          this.coinLine(LANES[ln], zz - 4, zz + 6);
          continue;
        }
        const high = !this.onRiver && roll < 0.45;
        this.barrier(ln, zz, high);
        if (!high && this.rand() < 0.5) this.coinArc(LANES[ln], zz, 1.2);
      }
      zz += Math.max(14, this.speed * 1.2);
    }
    this.genZ = zz;
  }

  sliceOncoming(z) {
    // a tram comes down the line at you; its lane is kept clear for it
    const ln = Math.floor(this.rand() * 3);
    const lead = 40;
    const t = this.addTram(ln, z + lead, this.kind(), -9 - this.rand() * 4);
    let end = t.z + t.L;
    const others = [0, 1, 2].filter((l) => l !== ln);
    const parkLane = this.rand() < 0.5 ? others[Math.floor(this.rand() * 2)] : -1;
    for (const o of others) {
      if (o === parkLane) {
        const pt = this.addTram(o, z + 8 + this.rand() * 10, this.kind());
        end = Math.max(end, pt.z + pt.L);
      } else {
        this.coinLine(LANES[o], z + 2, z + lead);
        if (this.rand() < 0.5) this.barrier(o, z + lead + 8, !this.onRiver && this.rand() < 0.5);
      }
    }
    this.genZ = end;
  }

  // ---------------------------------------------------------------------------
  // simulation

  /** Highest surface under (x, z) that the kid could be standing on from height y. */
  supportAt(x, z, y) {
    let s = 0;
    for (const t of this.trams) {
      if (Math.abs(x - t.x) < HALF_W && z >= t.z && z <= t.z + t.L && y >= t.H - STEP && t.H > s) s = t.H;
    }
    for (const r of this.ramps) {
      if (Math.abs(x - r.x) < 1.2 && z >= r.z && z <= r.z + r.len + 0.3) {
        const h = Math.min(r.h, ((z - r.z) / r.len) * r.h);
        if (y >= h - STEP && h > s) s = h;
      }
    }
    return s;
  }

  stumble() {
    const p = this.p;
    if (this.stumbleT > 0) return this.caught('stumble');
    this.emit('stumble');
    this.stumbleT = DANGER_TIME;
    this.slowT = SLOW_TIME;
    this.dingo.gap = Math.min(this.dingo.gap, 2.2);
    p.lane = p.prevLane;
    p.laneT = 0.3;
  }

  caught(why) {
    if (this.over) return;
    this.over = true;
    this.crash = why;
    this.overT = 0;
    this.emit('crash', why);
  }

  update(dt) {
    this.time += dt;
    if (this.over) {
      this.overT += dt;
      const dg = this.dingo;
      dg.gap = Math.max(0.2, dg.gap - dt * 10);
      dg.x += (this.p.x - dg.x) * Math.min(1, dt * 8);
      dg.pounce = Math.min(1, dg.pounce + dt * 2.5);
      for (const t of this.trams) if (t.moving) t.z += t.vz * dt * Math.max(0, 1 - this.overT * 2);
      return;
    }
    const p = this.p;
    this.speed = 13 + 15 * (1 - Math.exp(-this.time / 160));
    if (this.slowT > 0) this.slowT = Math.max(0, this.slowT - dt);
    const v = this.speed * (1 - SLOW_BY * (this.slowT / SLOW_TIME));
    const prevZ = p.z;
    p.z += v * dt;
    this.dist += v * dt;
    this.mult = Math.min(9, 1 + Math.floor(this.dist / 500));
    this.score += v * dt * this.mult;

    // trams wake up and roll towards you
    for (const t of this.trams) {
      if (!t.moving && t.go && t.z - p.z < 75) {
        t.moving = true;
        t.vz = t.go;
        this.emit(t.kind === 'F' ? 'horn' : 'bell', t);
      }
      if (t.moving) t.z += t.vz * dt;
    }

    // lanes
    const prevX = p.x;
    p.laneT = Math.min(1, p.laneT + dt / LANE_TIME);
    const tx = LANES[p.lane];
    const step = (3 / LANE_TIME) * dt;
    p.x += Math.max(-step, Math.min(step, tx - p.x));

    // vertical
    if (p.roll > 0) p.roll -= dt;
    p.vy -= G * dt;
    p.y += p.vy * dt;
    const sup = this.supportAt(p.x, p.z, p.y);
    if (p.y <= sup) {
      if (!p.grounded && p.vy < -6) this.emit('land');
      p.y = sup;
      p.vy = 0;
      p.grounded = true;
    } else if (p.y > sup + 0.05) p.grounded = false;
    p.support = sup;
    this.camSupport += (Math.min(3.4, sup) - this.camSupport) * Math.min(1, dt * 4);

    // collisions with tram bodies
    for (const t of this.trams) {
      if (Math.abs(p.x - t.x) >= HALF_W + 0.2) continue;
      const zf = t.z, zr = t.z + t.L;
      if (p.z + 0.3 < zf || p.z > zr) continue;
      if (p.y >= t.H - STEP) continue;
      const prevFront = zf - t.vz * dt;
      if (prevZ + 0.3 < prevFront + 0.05 || Math.abs(prevX - t.x) < HALF_W - 0.2) {
        return this.caught('tram');
      }
      p.x = prevX;
      this.stumble();
      break;
    }
    // ramp sides
    for (const r of this.ramps) {
      if (Math.abs(p.x - r.x) >= 1.4 || p.z < r.z || p.z > r.z + r.len) continue;
      const h = ((p.z - r.z) / r.len) * r.h;
      if (p.y < h - STEP - 0.2 && Math.abs(prevX - r.x) >= 1.2) {
        p.x = prevX;
        this.stumble();
        break;
      }
    }
    // barriers
    for (const b of this.barriers) {
      if (b.hit || Math.abs(p.x - b.x) >= 1.05 || Math.abs(p.z - b.z) > 0.4) continue;
      const head = p.y + (p.roll > 0 ? 0.75 : 1.55);
      if ((!b.high && p.y < 1.0) || (b.high && head > 1.5 && p.y < 2.1)) {
        b.hit = true;
        return this.caught('barrier');
      }
    }
    // coins
    for (const c of this.coinList) {
      if (c.taken) continue;
      if (Math.abs(c.z - p.z) < 0.9 && Math.abs(c.x - p.x) < 0.9 && Math.abs(c.y + 0.27 - (p.y + 0.7)) < 1.1) {
        c.taken = true;
        this.coins++;
        this.score += 10 * this.mult;
        this.emit('coin');
      }
    }

    // the dingo keeps coming
    const dg = this.dingo;
    // after a stumble he stays right behind you, in view, until the danger passes
    if (this.stumbleT > 0) {
      this.stumbleT = Math.max(0, this.stumbleT - dt);
      const want = this.slowT > 0 ? 2.2 : DINGO_WARN + Math.sin(this.time * 3) * 0.3;
      dg.gap += (want - dg.gap) * Math.min(1, dt * 2);
    } else dg.gap = Math.min(DINGO_FAR, dg.gap + dt * 1.1);
    dg.x += (p.x - dg.x) * Math.min(1, dt * 6);
    dg.y += (p.y - dg.y) * Math.min(1, dt * 5);

    // tidy up behind, build ahead
    const behind = p.z - 20;
    this.trams = this.trams.filter((t) => t.z + t.L > behind - 40);
    this.ramps = this.ramps.filter((r) => r.z + r.len > behind);
    this.barriers = this.barriers.filter((b) => b.z > behind);
    this.coinList = this.coinList.filter((c) => c.z > behind && !c.taken);
    while (this.zones.length > 1 && this.zones[1].z0 < behind - 60) this.zones.shift();
    this.generate();
  }

  camera() {
    const p = this.p;
    const k = this.camSupport / 3.4;
    return { x: p.x, y: 4.6 + 1.8 * k, z: p.z - 7.5, hor: Math.round(40 + 18 * k) };
  }
}

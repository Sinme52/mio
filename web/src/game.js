// One playable stage: owns the terrain, Mio, every creature and the camera.
import { Terrain } from './terrain.js';
import { Player, P } from './player.js';
import { FishSchool, Jelly, Shark, Follower, Particles, rand } from './entities.js';
import { Boss } from './boss.js';
import { clamp, damp, surfaceY, TAU } from './util.js';

class Emitter {
  constructor() { this.fns = []; }
  on(fn) { this.fns.push(fn); }
  emit(name, data) { for (const f of this.fns) f(name, data); }
}

export class World {
  constructor(level, progress = {}) {
    this.level = level;
    this.terrain = new Terrain(level);
    this.time = 0;
    this.events = new Emitter();
    this.events.on((n, d) => this.react(n, d));
    const [sx, sy] = progress.checkpoint || level.start;
    this.player = new Player(sx, sy);
    this.checkpoint = [sx, sy];
    this.stones = level.stones.map((s) => ({ ...s, read: false, glow: 0, prompt: 0 }));
    this.gates = level.gates.map((g) => ({ ...g, open: false, t: 0, hinted: -99 }));
    this.pods = level.pods.map((p, i) => ({ ...p, freed: false, t: rand(0, TAU), hinted: -99, i }));
    this.pearls = level.pearls.map(([x, y], i) => ({ x, y, i, taken: false, t: rand(0, TAU) }));
    this.schools = level.fish.map((f) => new FishSchool(f));
    this.jellies = level.jellies.map(([x, y]) => new Jelly(x, y));
    this.sharks = level.sharks.map((s) => new Shark(s));
    this.followers = [];
    this.particles = new Particles();
    this.rings = [];
    this.creatures = level.creatures.map((c) => ({ ...c, dir: 1, bob: rand(0, TAU) }));
    this.vents = level.vents.map(([x, y]) => this.makeVent(x, y));
    this.boss = level.arena ? new Boss(level.arena) : null;
    this.exit = level.exit ? { x: level.exit[0], y: level.exit[1], t: 0, hinted: -99 } : null;
    this.decor = this.buildDecor();
    this.snow = this.buildSnow();
    const v = this.viewSize(16 / 9, 1);
    this.cam = { x: sx, y: sy, zoom: 1, shake: 0, hw: v[0], hh: v[1] };
    this.state = 'play';
    this.stats = { pearls: 0, pods: 0, hurt: 0, eaten: 0 };
    this.flash = 0;
    this.slow = 0;
    this.restore(progress);
  }

  // Keep pearls/pods already collected when restarting from a checkpoint.
  restore(p) {
    for (const i of p.pearls || []) if (this.pearls[i]) { this.pearls[i].taken = true; this.stats.pearls++; }
    for (const i of p.pods || []) {
      const pod = this.pods[i];
      if (!pod) continue;
      pod.freed = true;
      this.followers.push(new Follower(this.player.x - 80, this.player.y, this.followers.length));
      this.stats.pods++;
    }
    for (const i of p.gates || []) if (this.gates[i]) this.gates[i].open = true;
    for (const i of p.stones || []) if (this.stones[i]) this.stones[i].read = true;
  }

  progress() {
    return {
      checkpoint: this.checkpoint,
      pearls: this.pearls.filter((p) => p.taken).map((p) => p.i),
      pods: this.pods.filter((p) => p.freed).map((p) => p.i),
      gates: this.gates.map((g, i) => (g.open ? i : -1)).filter((i) => i >= 0),
      stones: this.stones.map((s, i) => (s.read ? i : -1)).filter((i) => i >= 0),
    };
  }

  makeVent(x, y0) {
    let y = y0;
    while (y < this.level.height && this.terrain.dist(x, y) > 6) y += 4;
    let top = y - 30;
    while (top > -100 && this.terrain.dist(x, top) > 4 && top > surfaceY(x, 0)) top -= 8;
    return { x, y, top, t: 0 };
  }

  buildDecor() {
    const d = this.level.decor;
    if (!d) return [];
    const pts = this.terrain.surfacePoints(d.step, 'floor', 40);
    const out = [];
    for (const [px, py] of pts) {
      if (rand() < 0.25) continue;
      const x = px + rand(-d.step / 2, d.step / 2);
      if (this.terrain.dist(x, py - 10) < 0) continue;
      let h = rand(d.h[0], d.h[1]);
      if (d.kind === 'kelp') h = Math.min(h, py - 70);
      if (h < 12) continue;
      out.push({ x, y: py + 8, h, kind: d.kind, ph: rand(0, TAU), w: d.kind === 'kelp' ? rand(26, 40) : rand(4, 8),
        front: d.kind === 'kelp' ? rand() < 0.16 : rand() < 0.1, bend: 0, tone: rand(0.7, 1.1) });
    }
    out.sort((a, b) => a.x - b.x);
    return out;
  }

  buildSnow() {
    const mk = (n, p, s0, s1, a0, a1, tex) => Array.from({ length: n }, () => ({
      x: rand(0, 2400), y: rand(0, 1500), s: rand(s0, s1), a: rand(a0, a1), ph: rand(0, TAU), p, tex,
    }));
    return { far: mk(160, 0.6, 1.5, 3, 0.2, 0.45, 'dot'), near: mk(90, 1, 2.5, 5, 0.25, 0.5, 'dot'),
      bokeh: mk(26, 1.6, 16, 40, 0.05, 0.12, 'glow') };
  }

  viewSize(aspect, zoom) {
    const hh = 360 * zoom;
    return [hh * aspect, hh];
  }

  // ---------------------------------------------------------------- update
  update(dt, input, aspect) {
    if (this.slow > 0) { this.slow -= dt; dt *= 0.35; }
    this.time += dt;
    const pl = this.player;
    pl.inVent = false;
    for (const v of this.vents) {
      v.t += dt;
      if (Math.abs(pl.x - v.x) < 48 && pl.y < v.y + 10 && pl.y > v.top - 10) { pl.inVent = true; if (!pl.airborne) pl.vy -= 90 * dt; }
      if (rand() < dt * 18) {
        const sp = rand(110, 170);
        this.particles.spawn({ x: v.x + rand(-14, 14), y: v.y - 4, vx: rand(-10, 10), vy: -sp, life: (v.y - v.top) / sp,
          size: rand(4, 12), tex: 'bubble', add: false, col: [0.9, 0.98, 1, 0.75], kind: 'bubble' });
      }
    }
    if (!pl.dead) pl.update(dt, input, this);

    for (const s of this.schools) s.update(dt, this);
    for (const j of this.jellies) j.update(dt, this);
    for (const s of this.sharks) s.update(dt, this);
    this.sharks = this.sharks.filter((s) => s.gone < 6);
    for (const f of this.followers) f.update(dt, this);
    if (this.boss) this.boss.update(dt, this);
    this.particles.update(dt, this.time);
    this.updateRings(dt);

    for (const c of this.creatures) {
      c.x += c.speed * c.dir * dt;
      const sx = c.x - this.cam.x * c.p;
      const range = this.cam.hw + c.size;
      if (sx > range + 600) c.dir = -1;
      if (sx < -range - 600) c.dir = 1;
      c.bob += dt;
    }

    // Interactions.
    for (const s of this.stones) {
      s.glow = damp(s.glow, s.read ? 0.5 : 1, 2, dt);
      const d = Math.hypot(pl.x - s.x, pl.y - s.y);
      s.prompt = damp(s.prompt, !s.read && d < 380 ? 1 : 0, 4, dt);
      // A stone speaks on its own the first time Mio comes close.
      if (!s.read && d < 170 && !pl.dead) this.readStone(s);
    }
    for (const g of this.gates) if (g.open) g.t += dt;
    for (const p of this.pearls) {
      p.t += dt;
      if (!p.taken && Math.hypot(pl.x - p.x, pl.y - p.y) < 44) { p.taken = true; this.stats.pearls++; this.events.emit('pearl', p); }
    }
    for (const p of this.pods) p.t += dt;
    if (this.exit) {
      this.exit.t += dt;
      const d = Math.hypot(pl.x - this.exit.x, pl.y - this.exit.y);
      if (d < 120 && this.state === 'play') {
        if (this.stats.pods >= this.pods.length) { this.state = 'cleared'; this.events.emit('clear', this); }
        else if (this.time - this.exit.hinted > 6) { this.exit.hinted = this.time; this.events.emit('exitLocked', this); }
      }
    }

    // Bubbles trail when swimming fast; breath bubbles now and then.
    if (!pl.airborne && pl.speed > 380 && rand() < dt * 30) this.particles.bubbles(pl.x - Math.cos(pl.angle) * 50, pl.y - Math.sin(pl.angle) * 50, 1, 6, 40);
    if (!pl.airborne && rand() < dt * 0.6) this.particles.bubbles(...pl.head(), 2, 3, 40);

    this.updateCamera(dt, aspect);
    this.flash = Math.max(0, this.flash - dt * 2);
  }

  updateCamera(dt, aspect) {
    const pl = this.player, c = this.cam;
    const look = pl.airborne ? 0.15 : 0.32;
    const tx = pl.x + pl.vx * look, ty = pl.y + pl.vy * look * 0.7;
    c.x = damp(c.x, tx, 3.2, dt);
    c.y = damp(c.y, ty, 3.2, dt);
    const zt = 1 + clamp((pl.speed - 250) / 900, 0, 0.12) + (this.boss && this.boss.state !== 'dormant' && this.boss.state !== 'dying' ? 0.35 : 0);
    c.zoom = damp(c.zoom, zt, 1.2, dt);
    const [hw, hh] = this.viewSize(aspect, c.zoom);
    c.hw = hw; c.hh = hh;
    const W = this.level.width;
    c.x = W > hw * 2 - 300 ? clamp(c.x, hw - 150, W - hw + 150) : W / 2;
    c.y = clamp(c.y, -hh * 0.6, this.level.height - hh * 0.4);
    c.shake = Math.max(0, c.shake - dt * 2.5);
  }

  camView(shakeOn) {
    const c = this.cam, s = shakeOn ? c.shake * c.shake * 18 : 0;
    return [c.x + rand(-s, s), c.y + rand(-s, s), c.hw, c.hh];
  }

  // ---------------------------------------------------------------- voice
  updateRings(dt) {
    for (const r of this.rings) {
      r.r += r.speed * dt;
      r.k = Math.max(0, 1 - r.r / r.max) * (r.charged ? 1.3 : 1);
      const hit = (key, x, y, rad = 0) => {
        if (r.hit.has(key)) return false;
        if (Math.hypot(x - r.x, y - r.y) - rad > r.r) return false;
        r.hit.add(key);
        return true;
      };
      this.stones.forEach((s, i) => {
        if (hit(`s${i}`, s.x, s.y) && Math.hypot(s.x - r.x, s.y - r.y) < 420) this.readStone(s);
      });
      this.gates.forEach((g, i) => {
        if (g.open) return;
        const gy = clamp(r.y, g.y0, g.y1);
        if (!hit(`g${i}`, g.x, gy)) return;
        if (r.charged) { g.open = true; this.events.emit('gate', g); }
        else if (this.time - g.hinted > 8) { g.hinted = this.time; this.events.emit('gateHint', g); }
      });
      this.pods.forEach((p, i) => {
        if (p.freed || !hit(`p${i}`, p.x, p.y)) return;
        if (r.charged) this.freePod(p);
        else if (this.time - p.hinted > 8) { p.hinted = this.time; this.events.emit('podHint', p); }
      });
      this.jellies.forEach((j, i) => { if (hit(`j${i}`, j.x, j.y)) j.stun = r.charged ? 4 : 2.5; });
      this.sharks.forEach((s, i) => {
        if (r.charged && hit(`k${i}`, s.x, s.y)) { s.stun = 1.6; s.cool = 2; }
      });
    }
    this.rings = this.rings.filter((r) => r.r < r.max);
    if (this.boss) {
      for (const r of this.rings) if (r.charged && r.r > 30) this.boss.sing(r.x, r.y, r.r);
    }
  }

  readStone(s) {
    s.read = true;
    this.checkpoint = [s.x, s.y + 60];
    this.events.emit('stone', s);
  }

  freePod(p) {
    p.freed = true;
    this.stats.pods++;
    this.followers.push(new Follower(p.x, p.y, this.followers.length));
    this.events.emit('pod', p);
  }

  collideGates(body, r) {
    for (const g of this.gates) {
      if (g.open || body.y < g.y0 - r || body.y > g.y1 + r) continue;
      const dx = body.x - g.x;
      if (Math.abs(dx) < r + 18) {
        const s = dx >= 0 ? 1 : -1;
        body.x = g.x + s * (r + 18);
        if (body.vx * s < 0) body.vx = -body.vx * 0.2;
      }
    }
  }

  respawn() {
    const pl = new Player(...this.checkpoint);
    pl.invuln = 2.5;
    this.player = pl;
    this.followers.forEach((f, i) => { f.x = pl.x - 60 - i * 40; f.y = pl.y; });
    if (this.boss && this.boss.state !== 'dying') {
      const b = new Boss(this.level.arena);
      b.cores.forEach((c, i) => { c.alive = this.boss.cores[i].alive; });
      if (b.coresLeft === 0) b.cores.forEach((c) => { c.alive = true; });
      this.boss = b;
    }
    this.state = 'play';
  }

  // ---------------------------------------------------------------- reactions (visual side effects)
  react(name, d) {
    const pt = this.particles, pl = this.player, c = this.cam;
    switch (name) {
      case 'sonar':
        this.rings.push({ x: d.x, y: d.y, r: 0, max: 560, speed: 1050, k: 1, charged: false, hit: new Set() });
        break;
      case 'song':
        this.rings.push({ x: d.x, y: d.y, r: 0, max: 760, speed: 900, k: 1.3, charged: true, hit: new Set() });
        this.rings.push({ x: d.x, y: d.y, r: -90, max: 760, speed: 900, k: 1, charged: false, hit: new Set(), echo: true });
        pt.burst(d.x, d.y, 26, { col: [0.6, 1, 0.95, 1], speed: 260, size: 14, life: 1.1 });
        break;
      case 'dash':
        pt.bubbles(d.x, d.y, 10, 14, 90);
        break;
      case 'leap':
      case 'splash': {
        const x = d.x, y = name === 'leap' ? surfaceY(d.x, this.time) : d.y;
        const k = name === 'leap' ? 1 : d.k;
        for (let i = 0; i < 26 * k; i++) {
          pt.spawn({ x: x + rand(-20, 20), y, vx: rand(-180, 180), vy: -rand(150, 520) * k, grav: 1100, drag: 0.4,
            life: rand(0.5, 1.1), size: rand(4, 10), tex: 'dot', add: false, col: [0.92, 0.98, 1, 0.9], layer: 'near' });
        }
        pt.bubbles(x, y + 20, 14 * k, 30, 90);
        c.shake = Math.max(c.shake, 0.25 * k);
        break;
      }
      case 'hurt':
        this.stats.hurt++;
        c.shake = 0.8;
        pt.burst(pl.x, pl.y, 14, { col: [1, 0.5, 0.45, 1], speed: 180, size: 12 });
        break;
      case 'eat':
        this.stats.eaten++;
        pl.heal(1);
        pt.burst(d.x, d.y, 8, { col: [1, 1, 0.8, 1], speed: 90, size: 7, life: 0.6 });
        break;
      case 'pearl':
        pt.burst(d.x, d.y, 18, { col: [1, 0.95, 1, 1], speed: 160, size: 10, tex: 'star' });
        break;
      case 'gate':
        for (let y = d.y0; y < d.y1; y += 30) pt.burst(d.x, y, 3, { col: [0.5, 1, 1, 1], speed: 260, size: 18, tex: 'star', life: 1.4 });
        c.shake = 0.6; this.flash = 0.35;
        break;
      case 'pod':
        pt.burst(d.x, d.y, 40, { col: [0.8, 0.6, 1, 1], speed: 300, size: 16, life: 1.6 });
        pt.burst(d.x, d.y, 20, { col: [1, 1, 1, 1], speed: 120, size: 10, tex: 'star', life: 1.4 });
        this.flash = 0.4; this.slow = 0.6;
        break;
      case 'jellyPop':
        pt.burst(d.x, d.y, 20, { col: [...d.hue, 1], speed: 140, size: 12 });
        break;
      case 'sharkHit':
        c.shake = 0.6;
        pt.bubbles(d.x, d.y, 16, 30, 100);
        this.slow = 0.12;
        break;
      case 'coreBreak':
        c.shake = 1.0; this.flash = 0.6; this.slow = 0.8;
        pt.burst(d.x, d.y, 60, { col: [0.85, 0.7, 1, 1], speed: 420, size: 18, life: 1.8 });
        pt.burst(d.x, d.y, 30, { col: [1, 1, 1, 1], speed: 200, size: 12, tex: 'star', life: 1.6 });
        break;
      case 'bossWake':
        c.shake = 1.2;
        break;
      case 'bossLunge':
        c.shake = 0.5;
        break;
      case 'bossDefeated':
        this.flash = 1;
        for (const p of this.pods) if (!p.freed) this.freePod(p);
        for (let i = 0; i < 4; i++) this.followers.push(new Follower(this.boss.head.x + i * 40, this.boss.head.y, this.followers.length));
        break;
      default: break;
    }
  }
}

export { P };

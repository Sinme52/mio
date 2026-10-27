// Sea life and effects: fish schools, jellyfish, sharks, freed pod members, particles.
import { angDiff, clamp, damp, rng, surfaceY, TAU } from './util.js';

const R = rng(1234);
export const rand = (a = 0, b = 1) => a + (b - a) * R();

// ---------------------------------------------------------------- particles
export class Particles {
  constructor() { this.list = []; }

  spawn(p) {
    if (this.list.length > 2500) return;
    this.list.push({ vx: 0, vy: 0, grav: 0, drag: 0, rot: 0, spin: 0, layer: 'near', tex: 'glow', add: true,
      col: [1, 1, 1, 1], size: 10, grow: 0, life: 1, ...p, age: 0 });
  }

  burst(x, y, n, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(o.minSpeed ?? 20, o.speed ?? 160);
      this.spawn({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.5, 1) * (o.life ?? 1),
        size: rand(0.6, 1.2) * (o.size ?? 10), drag: o.drag ?? 2, col: o.col ?? [0.6, 0.95, 1, 1],
        tex: o.tex ?? 'glow', add: o.add ?? true, grav: o.grav ?? 0, grow: o.grow ?? 0, layer: o.layer ?? 'near' });
    }
  }

  bubbles(x, y, n, spread = 12, speed = 60) {
    for (let i = 0; i < n; i++) {
      this.spawn({ x: x + rand(-spread, spread), y: y + rand(-spread, spread), vx: rand(-20, 20), vy: -rand(20, speed),
        grav: -120, drag: 1.5, life: rand(0.8, 2.2), size: rand(4, 11), tex: 'bubble', add: false,
        col: [0.85, 0.97, 1, 0.8], kind: 'bubble' });
    }
  }

  update(dt, time) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.age += dt;
      if (p.age >= p.life) { L[i] = L[L.length - 1]; L.pop(); continue; }
      p.vy += p.grav * dt;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vy *= d;
      if (p.kind === 'bubble') p.vx += Math.sin(time * 6 + p.y * 0.05) * 30 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.spin * dt;
      p.size += p.grow * dt;
      if (p.kind === 'bubble' && p.y < surfaceY(p.x, time)) p.age = p.life;
    }
  }
}

// ---------------------------------------------------------------- fish
export class FishSchool {
  constructor(spec) {
    this.home = [spec.x, spec.y];
    this.cx = spec.x; this.cy = spec.y;
    this.kind = spec.kind;
    this.n = spec.n;
    this.fish = [];
    this.wander = rand(0, TAU);
    this.respawn = 0;
    for (let i = 0; i < spec.n; i++) this.add(true);
  }

  add(initial) {
    const a = rand(0, TAU), r = rand(0, initial ? 80 : 30);
    this.fish.push({ x: this.cx + Math.cos(a) * r, y: this.cy + Math.sin(a) * r, vx: rand(-40, 40), vy: rand(-20, 20),
      size: rand(0.75, 1.2), ph: rand(0, TAU), alive: true });
  }

  update(dt, world) {
    const pl = world.player;
    this.wander += rand(-1, 1) * dt;
    const tx = this.home[0] + Math.cos(this.wander) * 220, ty = this.home[1] + Math.sin(this.wander * 0.7) * 80;
    this.cx = damp(this.cx, tx, 0.4, dt); this.cy = damp(this.cy, ty, 0.4, dt);
    let mx = 0, my = 0;
    for (const f of this.fish) { mx += f.x; my += f.y; }
    const n = this.fish.length || 1;
    mx /= n; my /= n;
    for (let i = 0; i < this.fish.length; i++) {
      const f = this.fish[i];
      let ax = (this.cx - f.x) * 0.6 + (mx - f.x) * 0.3, ay = (this.cy - f.y) * 0.6 + (my - f.y) * 0.3;
      for (let j = Math.max(0, i - 4); j < Math.min(this.fish.length, i + 5); j++) {
        if (i === j) continue;
        const o = this.fish[j], dx = f.x - o.x, dy = f.y - o.y, d2 = dx * dx + dy * dy;
        if (d2 < 400 && d2 > 0.01) { ax += dx / d2 * 2400; ay += dy / d2 * 2400; }
      }
      const px = f.x - pl.x, py = f.y - pl.y, pd = Math.hypot(px, py);
      if (pd < 170 && pd > 1) { ax += px / pd * 2600 * (1 - pd / 170); ay += py / pd * 2600 * (1 - pd / 170); }
      f.vx += ax * dt; f.vy += ay * dt;
      const sp = Math.hypot(f.vx, f.vy), max = pd < 170 ? 330 : 150;
      if (sp > max) { f.vx *= max / sp; f.vy *= max / sp; }
      f.x += f.vx * dt; f.y += f.vy * dt;
      const surf = surfaceY(f.x, world.time) + 20;
      if (f.y < surf) { f.y = surf; f.vy = Math.abs(f.vy); }
      world.terrain.collide(f, 8);
      f.ph += dt * (8 + sp * 0.05);
      // Mio eats fish she touches.
      const [hx, hy] = pl.head();
      if (!pl.airborne && Math.hypot(f.x - hx, f.y - hy) < 26) {
        world.events.emit('eat', f);
        this.fish.splice(i, 1); i--;
      }
    }
    if (this.fish.length < this.n) {
      this.respawn += dt;
      if (this.respawn > 4 && Math.hypot(this.cx - pl.x, this.cy - pl.y) > 900) { this.respawn = 0; this.add(false); }
    }
  }
}

// ---------------------------------------------------------------- jellyfish
export class Jelly {
  constructor(x, y) {
    this.x = x; this.y = y; this.home = [x, y];
    this.vx = 0; this.vy = 0; this.t = rand(0, 3); this.pulse = 0;
    this.stun = 0; this.dead = 0; this.size = rand(34, 48);
    this.hue = R() < 0.5 ? [1.0, 0.55, 0.85] : [0.55, 0.85, 1.0];
    this.tent = Array.from({ length: 5 }, (_, i) => ({ off: (i - 2) * 0.22, ph: rand(0, TAU), len: rand(1.6, 2.6) }));
  }

  update(dt, world) {
    if (this.dead > 0) {
      this.dead -= dt;
      if (this.dead <= 0 && Math.hypot(this.home[0] - world.player.x, this.home[1] - world.player.y) > 800) {
        this.x = this.home[0]; this.y = this.home[1]; this.vx = this.vy = 0;
      } else if (this.dead <= 0) this.dead = 1;
      return;
    }
    this.t += dt;
    this.stun = Math.max(0, this.stun - dt);
    const period = 2.6;
    const ph = (this.t % period) / period;
    if (ph < 0.18) this.vy -= 160 * dt / 0.18 * 0.5;
    this.pulse = ph < 0.18 ? ph / 0.18 : 1 - (ph - 0.18) / 0.82;
    this.vy += 28 * dt;
    this.vx += (this.home[0] - this.x) * 0.05 * dt;
    this.vy += (this.home[1] - this.y) * 0.08 * dt;
    this.vx *= Math.exp(-0.8 * dt); this.vy *= Math.exp(-1.2 * dt);
    this.x += this.vx * dt; this.y += this.vy * dt;
    const surf = surfaceY(this.x, world.time) + 30;
    if (this.y < surf) { this.y = surf; this.vy = Math.abs(this.vy); }
    world.terrain.collide(this, this.size * 0.6);
    const pl = world.player;
    const d = Math.hypot(pl.x - this.x, pl.y - this.y);
    if (d < this.size * 0.75 + 22 && !pl.airborne) {
      if (pl.dashing) {
        this.dead = 25;
        world.events.emit('jellyPop', this);
      } else if (this.stun <= 0) {
        pl.hurt(1, world, [this.x, this.y]);
      }
    }
  }
}

// ---------------------------------------------------------------- sharks
// Sharks are poor at climbing or diving: they keep within 20 degrees of horizontal and turn around
// with a slow sideways sweep instead of looping up or down.
const SHARK_PITCH = (20 * Math.PI) / 180;
const SHARK_PITCH_RATE = 0.9;
const SHARK_REVERSE_TIME = 0.7;

export class Shark {
  constructor(s) {
    this.x = s.x; this.y = s.y; this.home = [s.x, s.y]; this.range = s.range;
    this.vx = 120; this.vy = 0;
    this.facing = 1; this.elev = 0; this.angle = 0; this.flip = 1; this.turnT = -1;
    this.hp = 3; this.stun = 0; this.cool = 0; this.state = 'patrol'; this.phase = 0; this.dir = 1; this.gone = 0;
    this.len = 230;
  }

  headingAngle() { return this.facing > 0 ? this.elev : Math.PI - this.elev; }

  turnPose() {
    if (this.turnT < 0) return { len: 1, curl: 0 };
    return { len: Math.max(0.22, Math.abs(Math.cos(this.turnT * Math.PI))), curl: Math.sin(this.turnT * Math.PI) };
  }

  // Steer toward the direction (tx, ty) within the shark's limits. A reversal only starts once the
  // target is more than minTurn units behind, so prey right above or below does not cause dithering.
  steer(tx, ty, dt, minTurn = 1e-3) {
    if (Math.abs(tx) > minTurn && Math.sign(tx) !== this.facing && this.turnT < 0) this.turnT = 0;
    if (this.turnT >= 0) {
      const before = this.turnT;
      this.turnT += dt / SHARK_REVERSE_TIME;
      if (before < 0.5 && this.turnT >= 0.5) this.facing = -this.facing;
      if (this.turnT >= 1) this.turnT = -1;
    }
    const want = clamp(Math.atan2(ty, Math.max(Math.abs(tx), 1e-3)), -SHARK_PITCH, SHARK_PITCH);
    this.elev += clamp(want - this.elev, -SHARK_PITCH_RATE * dt, SHARK_PITCH_RATE * dt);
    this.angle = this.headingAngle();
    this.flip = this.facing;
  }

  update(dt, world) {
    if (this.hp <= 0) {
      this.gone += dt;
      this.steer(this.dir, 0.35, dt);
      this.vx = damp(this.vx, Math.cos(this.angle) * 380, 2, dt); this.vy = damp(this.vy, Math.sin(this.angle) * 380, 1, dt);
      this.x += this.vx * dt; this.y += this.vy * dt;
      return;
    }
    const pl = world.player;
    this.stun = Math.max(0, this.stun - dt);
    this.cool = Math.max(0, this.cool - dt);
    const dx = pl.x - this.x, dy = pl.y - this.y, d = Math.hypot(dx, dy);
    const surf = surfaceY(this.x, world.time);
    let tx, ty, speed;
    const homeD = Math.hypot(this.x - this.home[0], this.y - this.home[1]);
    if (this.stun > 0) {
      tx = this.facing; ty = 0; speed = 40;
    } else if (this.cool <= 0 && d < (this.state === 'chase' ? 620 : 420) && !pl.airborne && pl.y > surf + 30 && homeD < this.range * 2.2) {
      // Notices prey within 420 units, and keeps after it out to 620 while it sweeps around.
      this.state = 'chase'; tx = dx; ty = dy; speed = 265;
    } else {
      if (this.state === 'chase') world.events.emit('sharkGiveUp', this);
      this.state = 'patrol';
      if (Math.abs(this.x - this.home[0]) > this.range) this.dir = this.x > this.home[0] ? -1 : 1;
      tx = this.dir; ty = (this.home[1] - this.y) * 0.01 + Math.sin(world.time * 0.7) * 0.2; speed = this.cool > 0 ? 300 : 130;
      if (this.cool > 0) { tx = -dx; ty = -dy; }
    }
    this.steer(tx, ty, dt, this.state === 'chase' ? 90 : 1e-3);
    // Turning around costs speed: the shark sweeps wide and slows through the middle of the turn.
    if (this.turnT >= 0) speed *= Math.max(0.25, Math.abs(Math.cos(this.turnT * Math.PI)));
    this.vx = damp(this.vx, Math.cos(this.angle) * speed, 2, dt);
    this.vy = damp(this.vy, Math.sin(this.angle) * speed, 2, dt);
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (this.y < surf + 40) { this.y = surf + 40; this.vy = Math.abs(this.vy); }
    const hit = world.terrain.collide(this, 30, 0.2);
    if (hit && this.state === 'patrol' && hit[0] * this.facing < -0.5) this.dir = -this.facing;
    world.collideGates(this, 30);
    this.phase += dt * (4 + Math.hypot(this.vx, this.vy) * 0.02);

    // Contact: Mio's charge hurts the shark, otherwise the shark bites.
    const hx = this.x + Math.cos(this.angle) * 70, hy = this.y + Math.sin(this.angle) * 70;
    const near = Math.min(d, Math.hypot(pl.x - hx, pl.y - hy));
    if (near < 58 && !pl.airborne) {
      if (pl.dashing && this.stun <= 0) {
        this.hp--; this.stun = 0.9; this.cool = 2.5;
        this.vx += pl.vx * 0.6; this.vy += pl.vy * 0.6;
        pl.vx *= -0.3; pl.vy *= -0.3; pl.dashT = 0;
        world.events.emit('sharkHit', this);
        if (this.hp <= 0) { this.dir = pl.x < this.x ? 1 : -1; world.events.emit('sharkFlee', this); }
      } else if (this.stun <= 0 && this.cool <= 0) {
        if (pl.hurt(1, world, [this.x, this.y])) { this.cool = 1.8; world.events.emit('bite', this); }
      }
    }
  }
}

// ---------------------------------------------------------------- freed pod members
export class Follower {
  constructor(x, y, index) {
    this.x = x; this.y = y; this.vx = 0; this.vy = -60; this.index = index;
    this.angle = -Math.PI / 2; this.flip = 1; this.flipTarget = 1; this.phase = rand(0, TAU); this.bend = 0;
    this.airborne = false;
  }

  update(dt, world) {
    const pl = world.player;
    const k = this.index + 1;
    const back = Math.atan2(-Math.sin(pl.angle), -Math.cos(pl.angle));
    const side = (k % 2 ? 1 : -1) * (40 + 18 * k);
    const tx = pl.x + Math.cos(back) * (70 + 55 * k) + Math.cos(back + Math.PI / 2) * side * 0.6;
    const ty = pl.y + Math.sin(back) * (70 + 55 * k) + Math.sin(back + Math.PI / 2) * side * 0.6 + Math.sin(world.time * 1.3 + k) * 20;
    const surf = surfaceY(this.x, world.time);
    if (this.airborne) {
      this.vy += 1150 * dt;
      if (this.y > surf + 4) this.airborne = false;
    } else {
      const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy);
      const sp = Math.min(d * 2.2, d > 700 ? 900 : 420);
      this.vx = damp(this.vx, (dx / (d || 1)) * sp, 2.2, dt);
      this.vy = damp(this.vy, (dy / (d || 1)) * sp, 2.2, dt);
      if (this.y < surf + 2) {
        if (pl.airborne && this.vy < -200) this.airborne = true; else { this.y = surf + 2; if (this.vy < 0) this.vy = 0; }
      }
      // If left far behind in a maze, catch up.
      if (d > 1400) { this.x = pl.x - Math.cos(pl.angle) * 120; this.y = pl.y - Math.sin(pl.angle) * 120; }
    }
    this.x += this.vx * dt; this.y += this.vy * dt;
    world.terrain.collide(this, 16);
    const sp = Math.hypot(this.vx, this.vy);
    if (sp > 30) {
      const prev = this.angle;
      this.angle += clamp(angDiff(this.angle, Math.atan2(this.vy, this.vx)), -5 * dt, 5 * dt);
      this.bend = damp(this.bend, clamp(angDiff(prev, this.angle) / dt, -4, 4) * 0.06, 8, dt);
    }
    this.phase += dt * (3 + sp * 0.022);
    const c = Math.cos(this.angle);
    if (c > 0.25) this.flipTarget = 1; else if (c < -0.25) this.flipTarget = -1;
    this.flip = damp(this.flip, this.flipTarget, 8, dt);
  }
}

// The Silence: an abyssal leviathan whose stolen songs glow as cores along its back.
// Wake a core with a Song, then ram it with a dash while it shines.
import { angDiff, clamp, damp } from './util.js';
import { rand } from './entities.js';

const N = 46, SPACING = 22;

export class Boss {
  constructor(arena) {
    this.arena = arena;
    this.rx = 920; this.ry = 430;
    this.pts = [];
    for (let i = 0; i < N; i++) this.pts.push({ x: arena.cx + 300 - i * SPACING, y: arena.cy + 380 });
    this.angle = Math.PI;
    this.speed = 120;
    this.state = 'dormant';
    this.t = 0; this.stateT = 0; this.nextAttack = 4;
    this.cores = [9, 17, 25, 33].map((seg) => ({ seg, alive: true, exposed: 0, flash: 0 }));
    this.waves = [];
    this.stun = 0; this.eye = 0; this.dissolve = 0; this.flip = -1;
    this.lungeDir = 0;
  }

  get head() { return this.pts[0]; }
  get coresLeft() { return this.cores.filter((c) => c.alive).length; }
  coreRadius() { return 34; }

  width(i) {
    const t = i / (N - 1);
    return 46 * (1 - t * 0.75);
  }

  update(dt, world) {
    const pl = world.player, A = this.arena;
    this.t += dt; this.stateT += dt;
    this.stun = Math.max(0, this.stun - dt);
    for (const c of this.cores) { c.exposed = Math.max(0, c.exposed - dt); c.flash = Math.max(0, c.flash - dt); }

    let tx, ty, speed = 230, turn = 2.0;
    const h = this.head;
    switch (this.state) {
      case 'dormant':
        tx = A.cx + Math.cos(this.t * 0.3) * 500; ty = A.cy + 420; speed = 70;
        if (pl.x > A.x0 && pl.y > A.y0) { this.state = 'intro'; this.stateT = 0; world.events.emit('bossWake', this); }
        break;
      case 'intro':
        tx = A.cx; ty = A.cy - 200; speed = 260;
        if (this.stateT > 3.2) this.toRoam();
        break;
      case 'roam': {
        const k = this.t * 0.32;
        tx = A.cx + Math.sin(k) * this.rx * 0.85; ty = A.cy + Math.sin(k * 2) * this.ry * 0.7;
        this.nextAttack -= dt;
        if (this.nextAttack <= 0 && this.stun <= 0) {
          const pick = rand() < 0.55 ? 'telegraph' : 'wave';
          this.state = pick; this.stateT = 0;
          if (pick === 'wave') world.events.emit('bossWave', this);
        }
        break;
      }
      case 'telegraph':
        tx = pl.x; ty = pl.y; speed = 90; turn = 3.0;
        this.eye = Math.min(1, this.eye + dt * 1.5);
        if (this.stateT > 0.9) {
          this.state = 'lunge'; this.stateT = 0;
          this.lungeDir = Math.atan2(pl.y - h.y, pl.x - h.x);
          world.events.emit('bossLunge', this);
        }
        break;
      case 'lunge':
        tx = h.x + Math.cos(this.lungeDir) * 100; ty = h.y + Math.sin(this.lungeDir) * 100; speed = 760; turn = 0.8;
        if (this.stateT > 1.0) this.toRoam();
        break;
      case 'wave':
        tx = h.x + Math.cos(this.angle) * 50; ty = h.y + Math.sin(this.angle) * 50; speed = 60;
        if (this.stateT > 0.6 && !this.waved) {
          this.waved = true;
          this.waves.push({ x: h.x, y: h.y, r: 20, max: 900, speed: 300 });
          if (this.coresLeft <= 2) this.waves.push({ x: h.x, y: h.y, r: -140, max: 900, speed: 300 });
        }
        if (this.stateT > 1.4) this.toRoam();
        break;
      case 'dying':
        tx = A.cx; ty = A.cy; speed = 40;
        this.dissolve = Math.min(1, this.stateT / 4);
        if (this.stateT > 4.5 && !this.reported) { this.reported = true; world.events.emit('bossDefeated', this); }
        break;
      default: break;
    }
    if (this.state !== 'telegraph') this.eye = Math.max(0, this.eye - dt * 2);
    if (this.stun > 0) speed *= 0.3;

    // Stay inside the cavern.
    const ex = (h.x - A.cx) / (this.rx + 80), ey = (h.y - A.cy) / (this.ry + 60);
    if (ex * ex + ey * ey > 1) { tx = A.cx; ty = A.cy; turn = 3; }

    const want = Math.atan2(ty - h.y, tx - h.x);
    this.angle += clamp(angDiff(this.angle, want), -turn * dt, turn * dt);
    this.speed = damp(this.speed, speed, 3, dt);
    h.x += Math.cos(this.angle) * this.speed * dt;
    h.y += Math.sin(this.angle) * this.speed * dt;
    for (let i = 1; i < N; i++) {
      const a = this.pts[i - 1], b = this.pts[i];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      // A slow undulation travels down the body.
      const wob = Math.sin(this.t * 3 - i * 0.35) * 0.8;
      b.x = a.x + (dx / d) * SPACING - (dy / d) * wob;
      b.y = a.y + (dy / d) * SPACING + (dx / d) * wob;
    }
    const dirx = h.x - this.pts[N - 1].x;
    this.flip = damp(this.flip, dirx >= 0 ? 1 : -1, 1.5, dt);

    for (const w of this.waves) w.r += w.speed * dt;
    this.waves = this.waves.filter((w) => w.r < w.max);
    if (this.state === 'dormant' || this.state === 'dying') return;

    // Silence waves hurt unless Mio dashes through them.
    for (const w of this.waves) {
      const d = Math.hypot(pl.x - w.x, pl.y - w.y);
      if (w.r > 0 && Math.abs(d - w.r) < 26 && !pl.dashing) pl.hurt(1, world, [w.x, w.y]);
    }
    // Cores first: a dash into a shining core sets its song free.
    for (const c of this.cores) {
      if (!c.alive) continue;
      const p = this.pts[c.seg];
      const d = Math.hypot(pl.x - p.x, pl.y - p.y);
      if (c.exposed > 0 && pl.dashing && d < 70) {
        c.alive = false; c.flash = 1;
        this.stun = 1.6; pl.dashT = 0; pl.vx *= -0.4; pl.vy *= -0.4; pl.invuln = Math.max(pl.invuln, 1.0);
        world.events.emit('coreBreak', { x: p.x, y: p.y, left: this.coresLeft });
        if (this.coresLeft === 0) { this.state = 'dying'; this.stateT = 0; this.waves = []; }
        else this.nextAttack = 2.5;
        return;
      }
    }
    for (let i = 0; i < N; i += 2) {
      const p = this.pts[i];
      if (Math.hypot(pl.x - p.x, pl.y - p.y) < this.width(i) + 16) { pl.hurt(1, world, [p.x, p.y]); break; }
    }
  }

  toRoam() {
    this.state = 'roam'; this.stateT = 0; this.waved = false;
    const rage = 4 - this.coresLeft;
    this.nextAttack = rand(4.5, 6.5) - rage * 0.8;
  }

  // Song rings wake the cores they reach.
  sing(x, y, radius) {
    let any = false;
    for (const c of this.cores) {
      if (!c.alive) continue;
      const p = this.pts[c.seg];
      if (Math.hypot(p.x - x, p.y - y) < radius) { c.exposed = 5.5; c.flash = 0.5; any = true; }
    }
    return any;
  }
}

export const BOSS_LEN = N * SPACING;

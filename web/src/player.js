// Mio: swimming, leaping, breathing, calling (sonar) and singing (charged sonar), dashing.
import { angDiff, clamp, damp, surfaceY } from './util.js';

export const P = {
  cruise: 310, dash: 760, dashTime: 0.34, dashCd: 0.5, turn: 4.6, turnDash: 2.8,
  radius: 20, airTime: 42, gravity: 1150, jumpSpeed: 250, maxHealth: 6, chargeTime: 0.85,
};

export class Player {
  constructor(x, y) {
    this.x = x; this.y = y; this.vx = 60; this.vy = 0;
    this.angle = 0; this.flipTarget = 1; this.flip = 1;
    this.health = P.maxHealth; this.air = 1;
    this.invuln = 0; this.dashT = 0; this.dashCd = 0;
    this.charge = 0; this.holding = 0;
    this.airborne = false; this.phase = 0; this.bend = 0; this.spin = 0;
    this.suffocate = 0; this.breathing = false; this.inVent = false;
    this.dead = false; this.hurtFlash = 0; this.speed = 0;
  }

  get dashing() { return this.dashT > 0; }

  head() {
    return [this.x + Math.cos(this.angle) * 34, this.y + Math.sin(this.angle) * 34];
  }

  update(dt, input, world) {
    const ev = world.events;
    this.invuln = Math.max(0, this.invuln - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    const surf = surfaceY(this.x, world.time);
    const wasAir = this.airborne;

    if (!this.airborne) {
      const ix = input.ax, iy = input.ay;
      const steering = Math.hypot(ix, iy) > 0.15;
      if (input.pressed('dash') && this.dashCd <= 0) {
        if (steering) this.angle = this.angle + clamp(angDiff(this.angle, Math.atan2(iy, ix)), -0.9, 0.9);
        this.dashT = P.dashTime; this.dashCd = P.dashCd + P.dashTime;
        const s = Math.max(Math.hypot(this.vx, this.vy), P.dash);
        this.vx = Math.cos(this.angle) * s; this.vy = Math.sin(this.angle) * s;
        ev.emit('dash', this);
      }
      const prevAngle = this.angle;
      if (steering) {
        const want = Math.atan2(iy, ix);
        const rate = (this.dashing ? P.turnDash : P.turn) * dt;
        this.angle += clamp(angDiff(this.angle, want), -rate, rate);
      } else if (this.speed > 40) {
        this.angle += clamp(angDiff(this.angle, Math.atan2(this.vy, this.vx)), -P.turn * dt, P.turn * dt);
      }
      const target = this.dashing ? P.dash : steering ? P.cruise * Math.min(1, Math.hypot(ix, iy) * 1.2) : 0;
      const tx = Math.cos(this.angle) * target, ty = Math.sin(this.angle) * target;
      const rate = this.dashing ? 8 : steering ? 2.6 : 1.1;
      this.vx = damp(this.vx, tx, rate, dt);
      this.vy = damp(this.vy, ty, rate, dt);
      this.bend = damp(this.bend, clamp(angDiff(prevAngle, this.angle) / dt, -4, 4) * 0.06, 10, dt);
      this.dashT = Math.max(0, this.dashT - dt);

      // Surface: leap out if fast enough, otherwise bob there and breathe.
      if (this.y < surf + 2) {
        if (this.vy < -P.jumpSpeed) {
          this.airborne = true;
          ev.emit('leap', this);
        } else {
          this.y = surf + 2;
          if (this.vy < 0) this.vy *= 0.2;
        }
      }
    } else {
      this.vy += P.gravity * dt;
      this.vx += input.ax * 160 * dt;
      this.angle = Math.atan2(this.vy, this.vx);
      this.bend = damp(this.bend, 0, 4, dt);
      if (input.pressed('dash') && this.spin <= 0) { this.spin = 1; ev.emit('trick', this); }
      if (this.y > surf + 4) {
        this.airborne = false;
        this.dashT = 0;
        const k = clamp(Math.abs(this.vy) / 700, 0.4, 1.5);
        this.vx *= 0.75; this.vy *= 0.45;
        ev.emit('splash', { x: this.x, y: surf, k });
      }
    }
    this.spin = Math.max(0, this.spin - dt * 1.6);

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.speed = Math.hypot(this.vx, this.vy);
    if (world.terrain.collide(this, P.radius, 0.1) && this.dashing && this.speed > 200) ev.emit('bump', this);
    world.collideGates(this, P.radius);
    if (this.x < 30) { this.x = 30; this.vx = Math.abs(this.vx) * 0.3; }
    if (this.x > world.level.width - 30) { this.x = world.level.width - 30; this.vx = -Math.abs(this.vx) * 0.3; }

    // Body animation: fluke beat speeds up with swimming effort.
    this.phase += dt * (3 + this.speed * 0.022 + (this.dashing ? 8 : 0)) * (this.airborne ? 0.3 : 1);
    const c = Math.cos(this.angle);
    if (c > 0.25) this.flipTarget = 1; else if (c < -0.25) this.flipTarget = -1;
    this.flip = damp(this.flip, this.flipTarget, 9, dt);

    // Breath.
    const [, hy] = this.head();
    this.breathing = this.airborne || hy < surfaceY(this.x, world.time) + 10;
    if (this.breathing) {
      if (this.air < 0.98 && !this.wasBreathing) ev.emit('breath', this);
      this.air = Math.min(1, this.air + dt * 0.6);
    } else if (this.inVent) {
      this.air = Math.min(1, this.air + dt * 0.4);
    } else {
      this.air = Math.max(0, this.air - dt / P.airTime);
    }
    this.wasBreathing = this.breathing;
    if (this.air <= 0) {
      this.suffocate += dt;
      if (this.suffocate > 2.2) { this.suffocate = 0; this.hurt(1, world, null, true); }
    } else this.suffocate = 0;

    // Voice: tap = sonar call, hold = song. After a dialog closes, wait for the button to be let go.
    const muted = this.mute;
    if (muted && !input.held('sonar')) this.mute = false;
    if (!muted && input.held('sonar')) {
      this.holding += dt;
      if (this.holding > 0.18) {
        const before = this.charge;
        this.charge = Math.min(1, this.charge + dt / P.chargeTime);
        if (Math.floor(before * 6) !== Math.floor(this.charge * 6)) ev.emit('charge', this.charge);
      }
    }
    if (!muted && input.released('sonar')) {
      const [hx, hy2] = this.head();
      if (this.charge >= 1) ev.emit('song', { x: hx, y: hy2 });
      else ev.emit('sonar', { x: hx, y: hy2 });
      this.charge = 0; this.holding = 0;
    }
    if (!wasAir && this.airborne) this.charge = 0;
  }

  hurt(n, world, from, ignoreInvuln = false) {
    if (this.dead || (!ignoreInvuln && this.invuln > 0)) return false;
    this.health -= n;
    this.invuln = 1.4;
    this.hurtFlash = 0.35;
    if (from) {
      const dx = this.x - from[0], dy = this.y - from[1];
      const l = Math.hypot(dx, dy) || 1;
      this.vx = (dx / l) * 420; this.vy = (dy / l) * 420;
    }
    world.events.emit('hurt', this);
    if (this.health <= 0) { this.health = 0; this.dead = true; world.events.emit('death', this); }
    return true;
  }

  heal(n) { this.health = Math.min(P.maxHealth, this.health + n); }
}

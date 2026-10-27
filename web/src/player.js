// Mio: swimming, leaping, breathing, calling (sonar) and singing (charged sonar), dashing.
import { angDiff, clamp, damp, surfaceY } from './util.js';

export const P = {
  cruise: 310, dash: 760, dashTime: 0.34, dashCd: 0.5, turn: 4.6, turnDash: 2.8,
  radius: 20, airTime: 42, gravity: 950, jumpSpeed: 250, maxHealth: 6, chargeTime: 0.85,
  // Turning around (left <-> right) is a short animated half-roll rather than an instant mirror.
  reverseTime: 0.42, reverseTimeDash: 0.26,
  // Breaching at full speed launches Mio high; only jumps this high get a somersault at the top.
  breachBoost: 1.85, maxLaunch: 1400, length: 185, spinHeight: 185 * 4, spinTime: 0.95,
};

export class Player {
  constructor(x, y) {
    this.x = x; this.y = y; this.vx = 60; this.vy = 0;
    // Heading = facing (+1 right / -1 left) and elevation (pitch, +down); angle is derived from both.
    this.facing = 1; this.elev = 0; this.angle = 0; this.flip = 1;
    this.turnT = -1; this.turnDur = P.reverseTime;
    this.jumpHeight = 0; this.spinT = -1; this.spinStart = 0;
    this.health = P.maxHealth; this.air = 1;
    this.invuln = 0; this.dashT = 0; this.dashCd = 0;
    this.charge = 0; this.holding = 0;
    this.airborne = false; this.phase = 0; this.bend = 0;
    this.suffocate = 0; this.breathing = false; this.inVent = false;
    this.dead = false; this.hurtFlash = 0; this.speed = 0;
  }

  get dashing() { return this.dashT > 0; }

  headingAngle() { return this.facing > 0 ? this.elev : Math.PI - this.elev; }

  // How the body looks mid-reversal: it swings away from the camera, so it appears shorter,
  // and rolls over at the halfway point (where the facing flips).
  turnPose() {
    if (this.turnT < 0) return { len: 1, curl: 0 };
    const p = this.turnT;
    return { len: Math.max(0.22, Math.abs(Math.cos(p * Math.PI))), curl: Math.sin(p * Math.PI) };
  }

  // Extra rotation of the somersault (0 when not spinning), eased in and out.
  spinAngle() {
    if (this.spinT < 0) return 0;
    const t = this.spinT;
    return t * t * (3 - 2 * t) * Math.PI * 2 * this.facing;
  }

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
      const wantFacing = Math.abs(ix) > 0.25 ? Math.sign(ix) : this.facing;
      // Pitch the player asks for, measured from the direction they want to face.
      let wantElev = this.elev;
      if (steering) wantElev = Math.atan2(iy, Math.max(Math.abs(ix), 1e-4));
      else if (this.speed > 40) wantElev = Math.atan2(this.vy, Math.max(Math.abs(this.vx), 1e-4));

      if (input.pressed('dash') && this.dashCd <= 0) {
        // A dash snaps straight into the new direction: finish the second half of the turn.
        if (wantFacing !== this.facing) { this.facing = wantFacing; this.turnT = 0.5; this.turnDur = P.reverseTimeDash; }
        if (steering) this.elev += clamp(wantElev - this.elev, -0.9, 0.9);
        this.dashT = P.dashTime; this.dashCd = P.dashCd + P.dashTime;
        const a = this.headingAngle();
        const sp = Math.max(Math.hypot(this.vx, this.vy), P.dash);
        this.vx = Math.cos(a) * sp; this.vy = Math.sin(a) * sp;
        ev.emit('dash', this);
      }
      if (wantFacing !== this.facing && this.turnT < 0) {
        this.turnT = 0;
        this.turnDur = this.dashing ? P.reverseTimeDash : P.reverseTime;
      }
      if (this.turnT >= 0) {
        const before = this.turnT;
        this.turnT += dt / this.turnDur;
        if (before < 0.5 && this.turnT >= 0.5) this.facing = -this.facing;
        if (this.turnT >= 1) this.turnT = -1;
      }
      const prevElev = this.elev;
      const rate = (this.dashing ? P.turnDash : P.turn) * dt;
      this.elev = clamp(this.elev + clamp(wantElev - this.elev, -rate, rate), -Math.PI / 2, Math.PI / 2);
      this.angle = this.headingAngle();
      // Body curves along the turn: the faster the pitch changes, the stronger the arc.
      const pitchRate = ((this.elev - prevElev) / dt) * this.facing;
      this.bend = damp(this.bend, clamp(pitchRate * 0.13, -0.75, 0.75), 9, dt);

      // Mid-reversal Mio slows down, then pushes off the other way.
      const reversing = this.turnT >= 0 ? Math.max(0.15, Math.abs(Math.cos(this.turnT * Math.PI))) : 1;
      const target = (this.dashing ? P.dash : steering ? P.cruise * Math.min(1, Math.hypot(ix, iy) * 1.2) : 0) * reversing;
      const tx = Math.cos(this.angle) * target, ty = Math.sin(this.angle) * target;
      const k = this.dashing ? 8 : this.turnT >= 0 ? 4.5 : steering ? 2.6 : 1.1;
      this.vx = damp(this.vx, tx, k, dt);
      this.vy = damp(this.vy, ty, k, dt);
      this.dashT = Math.max(0, this.dashT - dt);

      // Surface: leap out if fast enough, otherwise bob there and breathe.
      if (this.y < surf + 2) {
        if (this.vy < -P.jumpSpeed) {
          const exitSpeed = -this.vy;
          // A full-speed breach turns into a soaring leap.
          const boost = 1 + (P.breachBoost - 1) * clamp((exitSpeed - P.cruise) / ((P.dash - P.cruise) * 0.8), 0, 1);
          this.vy = Math.max(-P.maxLaunch, this.vy * boost);
          this.vx *= 0.9 + 0.1 * boost;
          this.airborne = true;
          this.turnT = -1;
          this.jumpHeight = (this.vy * this.vy) / (2 * P.gravity);
          this.spinT = -1;
          ev.emit('leap', { x: this.x, y: surf, k: exitSpeed / 650 });
        } else {
          this.y = surf + 2;
          if (this.vy < 0) this.vy *= 0.2;
        }
      }
    } else {
      this.vy += P.gravity * dt;
      this.vx += input.ax * 160 * dt;
      this.facing = this.vx >= 0 ? 1 : -1;
      this.angle = Math.atan2(this.vy, this.vx);
      this.elev = Math.atan2(this.vy, Math.abs(this.vx));
      this.bend = damp(this.bend, 0, 4, dt);
      // Big leaps get a somersault centred on the top of the arc.
      if (this.jumpHeight >= P.spinHeight && this.spinT < 0 && this.vy > -P.gravity * P.spinTime / 2) {
        this.spinT = 0;
        ev.emit('trick', this);
      }
      if (this.spinT >= 0) this.spinT = Math.min(1, this.spinT + dt / P.spinTime);
      if (this.y > surf + 4) {
        this.airborne = false;
        this.dashT = 0;
        this.spinT = -1;
        const entrySpeed = Math.hypot(this.vx, this.vy);
        this.vx *= 0.75; this.vy *= 0.45;
        ev.emit('splash', { x: this.x, y: surf, k: entrySpeed / 650 });
      }
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.speed = Math.hypot(this.vx, this.vy);
    if (world.terrain.collide(this, P.radius, 0.1) && this.dashing && this.speed > 200) ev.emit('bump', this);
    world.collideGates(this, P.radius);
    if (this.x < 30) { this.x = 30; this.vx = Math.abs(this.vx) * 0.3; }
    if (this.x > world.level.width - 30) { this.x = world.level.width - 30; this.vx = -Math.abs(this.vx) * 0.3; }

    // Body animation: fluke beat speeds up with swimming effort.
    this.phase += dt * (3 + this.speed * 0.022 + (this.dashing ? 8 : 0)) * (this.airborne ? 0.3 : 1);
    this.flip = this.facing;

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

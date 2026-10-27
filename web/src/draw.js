// Pushes everything in a World into the renderer's sprite batch.
import { surfaceY, TAU, clamp } from './util.js';
import { BOSS_LEN } from './boss.js';

// Bend a side-view sprite (head at the right edge of the image) along a swimming spine.
// o: x, y, angle, flip (1 = belly down when facing right, -1 mirrored), len, phase, amp, bend, col, segs, pivot,
//    lenScale (foreshortening while turning towards/away from the camera), thick (height multiplier)
function body(b, img, o) {
  const len = o.len, h = len * (img.h / img.w) * (o.thick ?? 1);
  const ls = o.lenScale ?? 1;
  const segs = o.segs ?? 14, pivot = o.pivot ?? 0.5;
  const c = Math.cos(o.angle), s = Math.sin(o.angle);
  const spine = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const lx = (u - pivot) * len * ls;
    const tail = 1 - u;
    const wave = o.amp * (tail * tail) * Math.sin(o.phase - tail * 3.2) + o.amp * 0.12 * Math.sin(o.phase + 1.2);
    const ly = wave * Math.sign(o.flip || 1) - (o.bend || 0) * (lx * lx) / len;
    spine.push([lx, ly]);
  }
  const rows = [];
  const fl = o.flip;
  for (let i = 0; i <= segs; i++) {
    const a = spine[Math.max(i - 1, 0)], bb = spine[Math.min(i + 1, segs)];
    let tx = bb[0] - a[0], ty = bb[1] - a[1];
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const nx = ty, ny = -tx;
    const [lx, ly] = spine[i];
    const top = [lx + nx * h * 0.5 * fl, ly + ny * h * 0.5 * fl];
    const bot = [lx - nx * h * 0.5 * fl, ly - ny * h * 0.5 * fl];
    const W = (p) => [o.x + p[0] * c - p[1] * s, o.y + p[0] * s + p[1] * c];
    const u = i / segs;
    rows.push([[...W(top), u, 0], [...W(bot), u, 1]]);
  }
  b.state(img, o.fog ?? 0.12);
  b.strip(rows, o.col ?? [1, 1, 1, 1]);
}

// Painted frames of the dolphin turning toward the viewer, by how far it has turned (degrees from side-on).
// Heights are in world units, chosen so the frames match the 185-unit side-view sprite.
const TURN_FRAMES = [
  { from: 15, img: 'mio_turn30', h: 82 },
  { from: 45, img: 'mio_turn60', h: 92 },
  { from: 75, img: 'mio_front', h: 90 },
];

// theta: 0 = side-on facing `side` (+1 right, -1 left) ... 90 = facing the camera. Returns false when
// the side-view mesh should be drawn instead (nearly side-on).
function turnFrame(b, I, x, y, theta, side, elev, scale, col) {
  let f = null;
  for (const fr of TURN_FRAMES) if (theta >= fr.from) f = fr;
  if (!f) return false;
  const img = I[f.img];
  const h = f.h * scale, w = h * (img.w / img.h);
  // Frames are painted facing right; mirror them when facing left. Pitch follows the swim angle,
  // less so when seen from the front.
  const pitch = elev * (f.img === 'mio_front' ? 0.25 : 0.8) * side;
  b.state(img, 0.05);
  b.quad(x, y, w, h, pitch, col, false, side < 0 ? [1, 0, 0, 1] : null);
  return true;
}

function glow(b, tex, x, y, size, col, a = 1) {
  b.state(tex, 0);
  b.quad(x, y, size, size, 0, [col[0], col[1], col[2], a], true);
}

export class Drawer {
  constructor(renderer) {
    this.r = renderer;
  }

  get T() { return this.r.tex; }
  get I() { return this.r.images; }

  bind(world) {
    this.w = world;
    return {
      creature: (b, c) => this.creature(b, c),
      particles: (b, layer) => this.particles(b, layer),
      decor: (b, which) => this.decor(b, which),
      world: (b) => this.world(b),
      lights: (b) => this.lights(b),
    };
  }

  inView(x, y, m = 200) {
    const c = this.w.cam;
    return Math.abs(x - c.x) < c.hw + m && Math.abs(y - c.y) < c.hh + m;
  }

  creature(b, c) {
    const img = this.I[c.img];
    const h = c.size * (img.h / img.w);
    const x = c.x, y = c.y + Math.sin(c.bob * 0.6) * 18;
    b.state(img, 0.6, c.p);
    const uv = c.dir < 0 ? [1, 0, 0, 1] : null;
    const fade = clamp(1 - (c.p < 0.25 ? 0.25 : 0), 0, 1);
    b.quad(x, y, c.size, h, Math.sin(c.bob * 0.4) * 0.04, [1, 1, 1, 0.85 * fade], false, uv);
  }

  particles(b, layer) {
    const w = this.w, cam = w.cam;
    if (layer === 'far' || layer === 'near' || layer === 'bokeh') {
      const field = w.snow[layer];
      const bio = w.level.key === 'abyss' || w.level.key === 'temple';
      const tex = this.T[field[0].tex];
      b.state(tex, 0);
      for (const s of field) {
        const W = 2400, H = 1500;
        const sx = ((s.x + Math.sin(w.time * 0.2 + s.ph) * 30 - cam.x * s.p) % W + W) % W - W / 2;
        const sy = ((s.y + w.time * 6 - cam.y * s.p) % H + H) % H - H / 2;
        const x = cam.x + sx, y = cam.y + sy;
        const surf = surfaceY(x, w.time);
        if (y < surf + 10) continue;
        const tw = 0.6 + 0.4 * Math.sin(w.time * 1.5 + s.ph);
        const col = bio && layer !== 'far' ? (s.ph > 3 ? [0.4, 1, 0.95] : [0.75, 0.55, 1]) : [0.85, 0.95, 1];
        b.quad(x, y, s.s, s.s, 0, [col[0], col[1], col[2], s.a * tw * (bio ? 1.6 : 1)], layer === 'bokeh' || bio);
      }
    }
    if (layer === 'near') {
      for (const p of w.particles.list) {
        if (!this.inView(p.x, p.y, 100)) continue;
        const k = 1 - p.age / p.life;
        const fade = Math.min(1, k * 2.5) * Math.min(1, p.age * 12);
        b.state(this.T[p.tex], p.add ? 0 : 0.1);
        if (p.kind === 'drop') {
          // Spray droplets stretch along their flight path.
          const v = Math.hypot(p.vx, p.vy);
          b.quad(p.x, p.y, p.size * (1 + v * 0.004), p.size * 0.8, Math.atan2(p.vy, p.vx), [p.col[0], p.col[1], p.col[2], p.col[3] * fade], false);
        } else {
          b.quad(p.x, p.y, p.size, p.size, p.rot, [p.col[0], p.col[1], p.col[2], p.col[3] * fade], p.add);
        }
      }
    }
  }

  decor(b, which) {
    const w = this.w, cam = w.cam, t = w.time, pl = w.player;
    const L = w.level.decor;
    if (!L) return;
    const front = which === 'front';
    for (const d of w.decor) {
      if (d.front !== front) continue;
      if (Math.abs(d.x - cam.x) > cam.hw + 120 || d.y - d.h > cam.y + cam.hh + 50 || d.y < cam.y - cam.hh - 50) continue;
      // Plants lean away from Mio as she swims through them.
      const px = pl.x - d.x, py = pl.y - (d.y - d.h * 0.6);
      const near = Math.abs(px) < 120 && Math.abs(py) < d.h * 0.6 + 40;
      d.bend += ((near ? -Math.sign(px) * (1 - Math.abs(px) / 120) * 0.6 : 0) - d.bend) * 0.05;
      if (d.kind === 'crystal') {
        const img = this.I.crystal;
        b.state(img, 0.1);
        b.quad(d.x, d.y - d.h * 0.45, d.h * (img.w / img.h), d.h, Math.sin(d.ph) * 0.25, [0.8, 1, 1, 0.95]);
        continue;
      }
      const segs = d.kind === 'kelp' ? 12 : 5;
      const rows = [];
      let x = d.x, y = d.y;
      for (let i = 0; i <= segs; i++) {
        const k = i / segs;
        const sway = (Math.sin(t * 0.9 + d.ph + k * 2.2) * 0.18 + Math.sin(t * 2.1 + d.ph * 2 + k * 4) * 0.04 + d.bend) * k;
        const ang = -Math.PI / 2 + sway * (d.kind === 'kelp' ? 0.9 : 1.6);
        if (i > 0) { x += Math.cos(ang) * d.h / segs; y += Math.sin(ang) * d.h / segs; }
        const wd = d.w * (d.kind === 'kelp' ? (0.55 + 0.45 * Math.sin(k * 3.1)) : (1 - k * 0.7));
        const nx = -Math.sin(ang), ny = Math.cos(ang);
        const v = (k * d.h) / 220 + d.ph;
        rows.push([[x - nx * wd, y - ny * wd, 0, v], [x + nx * wd, y + ny * wd, 1, v]]);
      }
      const tex = d.kind === 'kelp' ? this.T.kelp : this.T.line;
      const tone = d.tone * (front ? 0.35 : 1);
      b.state(tex, front ? 0 : 0.35);
      b.strip(rows, [L.color[0] * tone, L.color[1] * tone, L.color[2] * tone, front ? 0.88 : 1]);
      if (d.kind === 'worms' || d.kind === 'grass') {
        const tip = rows[rows.length - 1][0];
        const a = d.kind === 'worms' ? 0.9 : 0.35;
        glow(b, this.T.glow, tip[0], tip[1], d.kind === 'worms' ? 22 : 12, L.tip, a * (0.7 + 0.3 * Math.sin(t * 2 + d.ph)));
      }
    }
  }

  world(b) {
    const w = this.w, t = w.time, T = this.T, I = this.I, pl = w.player;

    // Exit current: a slowly turning vortex of light.
    if (w.exit && this.inView(w.exit.x, w.exit.y, 400)) {
      const e = w.exit, open = w.stats.pods >= w.pods.length;
      const a = open ? 1 : 0.35;
      for (let i = 0; i < 3; i++) {
        b.state(T.ring, 0);
        const s = 180 + i * 70 + Math.sin(t * 2 + i) * 12;
        b.quad(e.x, e.y, s, s, t * (0.5 + i * 0.3), [0.6, 0.95, 1, 0.35 * a], true);
      }
      glow(b, T.glow, e.x, e.y, 360, [0.5, 0.9, 1], 0.45 * a);
      for (let i = 0; i < 10; i++) {
        const ang = t * 1.4 + i * TAU / 10, r = 70 + 30 * Math.sin(t * 2 + i);
        glow(b, T.star, e.x + Math.cos(ang) * r, e.y + Math.sin(ang) * r, 18, [0.8, 1, 1], a);
      }
    }

    for (const v of w.vents) {
      if (!this.inView(v.x, v.y, 300)) continue;
      glow(b, T.glow, v.x, v.y, 120, [1, 0.6, 0.3], 0.5 + 0.2 * Math.sin(t * 3));
    }

    for (const s of w.stones) {
      if (!this.inView(s.x, s.y, 300)) continue;
      const img = I.crystal, h = 120, y = s.y + Math.sin(t * 1.2 + s.x) * 6;
      glow(b, T.glow, s.x, y, 260, [0.4, 0.95, 1], 0.35 * s.glow);
      b.state(img, 0.1);
      b.quad(s.x, y, h * (img.w / img.h), h, Math.sin(t * 0.7) * 0.05, [1, 1, 1, 1]);
      if (s.prompt > 0.02) {
        const k = (t * 0.8) % 1;
        b.state(T.ring, 0);
        b.quad(s.x, y, 120 + k * 160, 120 + k * 160, 0, [0.6, 1, 1, s.prompt * (1 - k) * 0.6], true);
      }
    }

    for (const g of w.gates) {
      if (g.open && g.t > 1) continue;
      if (Math.abs(g.x - w.cam.x) > w.cam.hw + 200) continue;
      const img = I.crystal;
      const a = g.open ? 1 - g.t : 1;
      b.state(T.line, 0);
      b.quad(g.x, (g.y0 + g.y1) / 2, 46, g.y1 - g.y0, 0, [0.45, 0.95, 1, 0.35 * a], true);
      for (let y = g.y0, i = 0; y < g.y1; y += 70, i++) {
        const s = 90 + (i % 3) * 12;
        b.state(img, 0.1);
        b.quad(g.x + Math.sin(i * 2.1) * 8, y + 35, s * (img.w / img.h), s, Math.sin(i * 1.7) * 0.25, [0.85, 1, 1, 0.9 * a]);
      }
    }

    for (const p of w.pearls) {
      if (p.taken || !this.inView(p.x, p.y)) continue;
      glow(b, T.glow, p.x, p.y, 60, [1, 0.95, 1], 0.4 + 0.2 * Math.sin(p.t * 3));
      b.state(T.pearl, 0);
      b.quad(p.x, p.y + Math.sin(p.t * 2) * 4, 22, 22, 0, [1, 1, 1, 1]);
      if ((p.t % 2.5) < 0.4) glow(b, T.star, p.x - 5, p.y - 6, 26 * Math.sin((p.t % 2.5) / 0.4 * Math.PI), [1, 1, 1], 1);
    }

    for (const p of w.pods) {
      if (p.freed || !this.inView(p.x, p.y)) continue;
      const img = I.mio;
      body(b, img, { x: p.x, y: p.y, angle: Math.sin(p.t * 0.5) * 0.2, flip: 1, len: 150, phase: p.t * 1.5, amp: 4, col: [0.6, 0.6, 0.75, 1] });
      b.state(T.orb, 0);
      const s = 200 + Math.sin(p.t * 1.5) * 8;
      b.quad(p.x, p.y, s, s, p.t * 0.3, [1, 1, 1, 0.82]);
      glow(b, T.glow, p.x, p.y, 280, [0.55, 0.35, 0.9], 0.3);
    }

    for (const s of w.schools) {
      const img = I[s.kind];
      if (!this.inView(s.cx, s.cy, 500)) continue;
      b.state(img, 0.2);
      const len = s.kind === 'fish_a' ? 30 : 24;
      for (const f of s.fish) {
        const a = Math.atan2(f.vy, f.vx);
        const left = Math.cos(a) < 0;
        const L = len * f.size;
        b.quad(f.x, f.y, L * (1 + Math.sin(f.ph) * 0.04), L * (img.h / img.w), a, [1, 1, 1, 1], false, left ? [0, 1, 1, 0] : null);
      }
    }

    for (const j of w.jellies) {
      if (j.dead > 0 || !this.inView(j.x, j.y)) continue;
      const sz = j.size, sq = 1 + j.pulse * 0.18, col = j.hue;
      const stun = j.stun > 0 ? 0.4 : 1;
      // Tentacles trail below the bell.
      b.state(T.line, 0);
      for (const tn of j.tent) {
        const rows = [];
        const n = 8;
        for (let i = 0; i <= n; i++) {
          const k = i / n;
          const x = j.x + tn.off * sz * 1.4 + Math.sin(w.time * 2 + tn.ph + k * 3) * 10 * k - j.vx * 0.15 * k;
          const y = j.y + sz * 0.3 + k * sz * tn.len - j.vy * 0.1 * k;
          rows.push([[x - 3, y, 0, k, 1 - k * 0.8], [x + 3, y, 1, k, 1 - k * 0.8]]);
        }
        b.strip(rows, [col[0], col[1], col[2], 0.5 * stun], true);
      }
      b.state(T.bell, 0.05);
      b.quad(j.x, j.y, sz * 2 / sq, sz * 1.5 * sq, Math.sin(w.time * 0.8 + j.home[0]) * 0.12, [col[0], col[1], col[2], 0.75 * stun]);
      glow(b, T.glow, j.x, j.y, sz * 3, col, 0.45 * stun * (0.6 + j.pulse * 0.6));
    }

    for (const s of w.sharks) {
      if (!this.inView(s.x, s.y, 300)) continue;
      const fade = s.hp <= 0 ? Math.max(0, 1 - s.gone / 3) : 1;
      const hit = s.stun > 0 ? 0.5 + 0.5 * Math.sin(w.time * 40) : 1;
      const pose = s.turnPose();
      body(b, I.shark, { x: s.x, y: s.y, angle: s.angle, flip: s.facing, lenScale: pose.len, thick: 1 + pose.curl * 0.15, bend: -pose.curl * 0.35, len: s.len, phase: s.phase, amp: 7, col: [hit, hit, hit, fade], pivot: 0.45 });
    }

    if (w.boss) this.boss(b, w.boss);

    for (const f of w.followers) {
      if (!this.inView(f.x, f.y)) continue;
      // Pod members turn with the same painted frames (their flip eases from +1 to -1).
      const fl = clamp(f.flip, -1, 1), th = (Math.acos(fl) * 180) / Math.PI;
      const fElev = Math.atan2(Math.sin(f.angle), Math.abs(Math.cos(f.angle)));
      if (turnFrame(b, I, f.x, f.y, Math.min(th, 180 - th), th < 90 ? 1 : -1, fElev, 150 / 185, [0.85, 0.92, 1, 1])) continue;
      body(b, I.mio, { x: f.x, y: f.y, angle: f.angle, flip: Math.sign(f.flip) || 1, len: 150, phase: f.phase, amp: 10, bend: f.bend, col: [0.85, 0.92, 1, 1] });
    }

    // Mio.
    if (!pl.dead || pl.hurtFlash > 0) {
      const blink = pl.invuln > 0 && Math.floor(pl.invuln * 12) % 2 === 0 ? 0.45 : 1;
      const red = pl.hurtFlash > 0 ? 1 : 0;
      const col = [1, 1 - red * 0.5, 1 - red * 0.5, blink];
      // Turning around plays the painted turn frames; otherwise the side view bends as it swims.
      const theta = pl.turnT >= 0 ? Math.min(pl.turnT, 1 - pl.turnT) * 180 : 0;
      if (!turnFrame(b, I, pl.x, pl.y, theta, pl.facing, pl.elev, 1, col)) {
        body(b, I.mio, { x: pl.x, y: pl.y, angle: pl.angle + pl.spinAngle(), flip: pl.flip, len: 185, phase: pl.phase,
          amp: pl.airborne ? 3 : 11, bend: pl.bend, col, fog: 0.05 });
      }
      if (pl.charge > 0) {
        const [hx, hy] = pl.head();
        const k = pl.charge;
        glow(b, T.glow, hx, hy, 40 + 120 * k, [0.5, 1, 0.95], 0.3 + 0.5 * k);
        if (k >= 1) { b.state(T.ring, 0); b.quad(hx, hy, 90 + Math.sin(w.time * 20) * 6, 90, 0, [0.7, 1, 1, 0.7], true); }
      }
    }

    // Sonar rings.
    for (const r of w.rings) {
      if (r.r <= 0) continue;
      b.state(T.ring, 0);
      const col = r.charged ? [0.55, 1, 0.9] : [0.6, 0.85, 1];
      b.quad(r.x, r.y, r.r * 2.1, r.r * 2.1, 0, [col[0], col[1], col[2], 0.55 * r.k], true);
    }
  }

  boss(b, boss) {
    const img = this.I.leviathan, T = this.T, w = this.w;
    const pts = boss.pts, n = pts.length;
    const h = BOSS_LEN * (img.h / img.w) * 1.15;
    const fl = boss.flip;
    const rows = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(i - 1, 0)], c = pts[Math.min(i + 1, n - 1)];
      // Tangent points from tail to head.
      let tx = a.x - c.x, ty = a.y - c.y;
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const nx = ty, ny = -tx;
      const u = 1 - i / (n - 1);
      const p = pts[i];
      rows.push([[p.x + nx * h * 0.5 * fl, p.y + ny * h * 0.5 * fl, u, 0], [p.x - nx * h * 0.5 * fl, p.y - ny * h * 0.5 * fl, u, 1]]);
    }
    rows.reverse();
    const a = 1 - boss.dissolve;
    if (a <= 0.01) return;
    const hurt = boss.stun > 0 ? 0.6 + 0.4 * Math.sin(w.time * 30) : 1;
    b.state(img, 0.1);
    b.strip(rows, [hurt, hurt, hurt, a]);
    for (const c of boss.cores) {
      const p = pts[c.seg];
      if (!c.alive) continue;
      const ex = c.exposed > 0 ? 1 : 0;
      const pulse = 0.6 + 0.4 * Math.sin(w.time * (ex ? 10 : 3) + c.seg);
      glow(b, T.glow, p.x, p.y, 70 + ex * 120, ex ? [1, 0.9, 1] : [0.55, 0.35, 0.95], (0.5 + ex * 0.5) * pulse * a);
      if (ex) glow(b, T.star, p.x, p.y, 60, [1, 1, 1], pulse * a);
    }
    const hd = pts[0];
    const ea = boss.eye;
    if (ea > 0) glow(b, T.glow, hd.x + Math.cos(boss.angle) * 30, hd.y + Math.sin(boss.angle) * 30, 90 + 90 * ea, [1, 0.3, 0.6], ea);
    for (const wv of boss.waves) {
      if (wv.r <= 0) continue;
      const k = 1 - wv.r / wv.max;
      b.state(T.ring, 0);
      b.quad(wv.x, wv.y, wv.r * 2.2, wv.r * 2.2, 0, [0.05, 0.0, 0.12, 0.85 * k]);
      b.quad(wv.x, wv.y, wv.r * 2.1, wv.r * 2.1, 0, [0.6, 0.3, 1, 0.5 * k], true);
    }
  }

  lights(b) {
    const w = this.w, T = this.T, pl = w.player, pal = w.level.palette, t = w.time;
    const L = (x, y, s, col, a) => { if (this.inView(x, y, s)) glow(b, T.glow, x, y, s, col, a); };
    L(pl.x, pl.y, pal.light * 2.4, [0.55, 0.8, 0.9], 0.85);
    for (const f of w.followers) L(f.x, f.y, 300, [0.5, 0.75, 0.9], 0.5);
    for (const r of w.rings) {
      if (r.r <= 0) continue;
      b.state(T.ring, 0);
      b.quad(r.x, r.y, r.r * 2.2, r.r * 2.2, 0, [0.6, 0.95, 1, 1.4 * r.k], true);
      L(r.x, r.y, r.r * 1.6, [0.3, 0.6, 0.7], 0.6 * r.k);
    }
    for (const s of w.stones) L(s.x, s.y, 520, [0.35, 0.9, 1], 0.8 * s.glow);
    for (const p of w.pods) if (!p.freed) L(p.x, p.y, 420, [0.6, 0.35, 1], 0.7);
    for (const j of w.jellies) if (j.dead <= 0) L(j.x, j.y, 260, j.hue, 0.5 + 0.4 * j.pulse);
    for (const v of w.vents) L(v.x, v.y - 60, 420, [1, 0.55, 0.25], 0.7);
    for (const p of w.pearls) if (!p.taken) L(p.x, p.y, 120, [1, 0.95, 1], 0.6);
    for (const g of w.gates) if (!g.open) L(g.x, (g.y0 + g.y1) / 2, Math.min(900, g.y1 - g.y0), [0.4, 0.95, 1], 0.5);
    if (w.exit) L(w.exit.x, w.exit.y, 700, [0.6, 0.95, 1], 1);
    if (w.level.decor && (w.level.decor.kind === 'worms' || w.level.decor.kind === 'crystal')) {
      for (const d of w.decor) if (Math.abs(d.x - w.cam.x) < w.cam.hw + 100) L(d.x, d.y - d.h, 110, w.level.decor.tip, 0.5 + 0.2 * Math.sin(t + d.ph));
    }
    for (const p of w.particles.list) if (p.add && p.size > 12) L(p.x, p.y, p.size * 4, p.col, 0.3 * (1 - p.age / p.life));
    if (w.boss) {
      const bo = w.boss;
      for (const c of bo.cores) if (c.alive) L(bo.pts[c.seg].x, bo.pts[c.seg].y, c.exposed > 0 ? 520 : 260, [0.7, 0.45, 1], 0.9 * (1 - bo.dissolve));
      for (const wv of bo.waves) if (wv.r > 0) { b.state(T.ring, 0); b.quad(wv.x, wv.y, wv.r * 2.2, wv.r * 2.2, 0, [0.6, 0.3, 1, 1 - wv.r / wv.max], true); }
      if (bo.dissolve > 0) L(bo.pts[20].x, bo.pts[20].y, 2000 * bo.dissolve, [0.8, 0.9, 1], bo.dissolve);
    }
  }
}

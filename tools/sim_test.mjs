// Headless gameplay smoke test: drives each stage with scripted input and checks that
// pods can be freed, gates opened, the exit reached and the boss defeated, without NaNs.
import { World } from '../web/src/game.js';
import { LEVELS } from '../web/src/levels.js';

class FakeInput {
  constructor() { this.ax = 0; this.ay = 0; this.now = {}; this.prev = {}; }
  set(keys) { this.prev = this.now; this.now = keys; }
  held(k) { return !!this.now[k]; }
  pressed(k) { return !!this.now[k] && !this.prev[k]; }
  released(k) { return !this.now[k] && !!this.prev[k]; }
}

const dt = 1 / 60;
let failures = 0;
const fail = (m) => { failures++; console.log('  ✗ ' + m); };

function run(w, inp, secs, script) {
  for (let i = 0; i < secs / dt; i++) {
    if (script) script(i * dt); else inp.set({ ...inp.now });
    w.update(dt, inp, 16 / 9);
    const p = w.player;
    if (!Number.isFinite(p.x + p.y + p.vx + p.vy)) { fail(`NaN player at t=${w.time}`); return false; }
  }
  return true;
}

function sing(w, inp) {
  inp.set({ sonar: true });
  for (let i = 0; i < 70; i++) { w.update(dt, inp, 16 / 9); inp.set({ sonar: true }); }
  inp.set({});
  w.update(dt, inp, 16 / 9);
  for (let i = 0; i < 60; i++) { inp.set({}); w.update(dt, inp, 16 / 9); }
}

for (const L of LEVELS) {
  const w = new World(L);
  const inp = new FakeInput();
  const events = {};
  w.events.on((n) => { events[n] = (events[n] || 0) + 1; });
  console.log(`stage ${L.id}`);
  // Free swim with changing directions and occasional dashes/calls.
  run(w, inp, 30, (t) => {
    inp.ax = Math.cos(t * 0.7); inp.ay = Math.sin(t * 1.3);
    inp.set({ dash: Math.floor(t * 2) % 5 === 0, sonar: Math.floor(t * 3) % 7 === 0 });
  });
  w.player.health = 6; w.player.dead = false;
  // Visit each stone, gate and pod and sing.
  for (const s of w.stones) { Object.assign(w.player, { x: s.x - 80, y: s.y }); inp.ax = inp.ay = 0; sing(w, inp); }
  if (!events.stone) fail('no stone dialog');
  for (const g of w.gates) { Object.assign(w.player, { x: g.x - 150, y: Math.max(g.y0 + 100, 100) }); sing(w, inp); if (!g.open) fail(`gate at ${g.x} did not open`); }
  for (const p of w.pods) { Object.assign(w.player, { x: p.x - 150, y: p.y, vx: 0, vy: 0 }); sing(w, inp); if (!p.freed) fail(`pod at ${p.x},${p.y} not freed`); }
  for (const p of w.pearls) { Object.assign(w.player, { x: p.x, y: p.y }); run(w, inp, 0.1); }
  if (w.stats.pearls !== w.pearls.length) fail(`pearls ${w.stats.pearls}/${w.pearls.length}`);
  if (w.exit) {
    Object.assign(w.player, { x: w.exit.x - 60, y: w.exit.y, dead: false, health: 6 });
    run(w, inp, 0.5);
    if (w.state !== 'cleared') fail('exit did not clear the stage');
  }
  if (w.boss) {
    const b = w.boss, A = L.arena;
    Object.assign(w.player, { x: A.cx - 600, y: A.cy, dead: false, health: 6 });
    run(w, inp, 4);
    if (b.state === 'dormant') fail('boss did not wake');
    let guard = 0;
    while (b.coresLeft > 0 && guard++ < 40) {
      const c = b.cores.find((c) => c.alive);
      const p = b.pts[c.seg];
      Object.assign(w.player, { x: p.x - 200, y: p.y, vx: 0, vy: 0, invuln: 99, health: 6, dead: false, air: 1 });
      sing(w, inp);
      const q = b.pts[c.seg];
      Object.assign(w.player, { x: q.x - 60, y: q.y, angle: 0, invuln: 99 });
      inp.ax = 1; inp.ay = 0;
      inp.set({ dash: true }); w.update(dt, inp, 16 / 9); inp.set({}); w.update(dt, inp, 16 / 9);
      inp.ax = 0;
      run(w, inp, 0.2);
    }
    if (b.coresLeft > 0) fail(`boss still has ${b.coresLeft} cores`);
    run(w, inp, 6);
    if (!events.bossDefeated) fail('boss not defeated');
  }
  // Drowning and respawn.
  Object.assign(w.player, { x: L.start[0], y: 300, air: 0, invuln: 0, dead: false, health: 2 });
  w.state = 'play';
  run(w, inp, 6);
  if (!w.player.dead) fail('player did not drown');
  w.respawn();
  run(w, inp, 2);
  console.log('  events:', Object.entries(events).map(([k, v]) => `${k}:${v}`).join(' '));
}
console.log(failures ? `${failures} failures` : 'sim OK');
process.exitCode = failures ? 1 : 0;

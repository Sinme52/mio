// Builds every stage's terrain and checks that all goals are reachable by the dolphin.
// Usage: node tools/validate_levels.mjs [--png]  (--png writes previews to the scratch dir given by OUT)
import { LEVELS } from '../web/src/levels.js';
import { Terrain } from '../web/src/terrain.js';
import { writeFileSync } from 'node:fs';

const CLEAR = 24;
let bad = 0;
for (const L of LEVELS) {
  const t = new Terrain(L);
  const ok = t.reachable(L.start, CLEAR);
  const check = (what, x, y) => {
    const d = t.dist(x, y);
    const r = ok(x, y);
    if (!r || d < 10) { bad++; console.log(`  ✗ ${what} (${x},${y}) dist=${d.toFixed(0)} reachable=${r}`); }
  };
  console.log(`stage ${L.id} ${L.key}: grid ${t.w}x${t.h} built in ${t.buildMs.toFixed(0)}ms`);
  for (const s of L.stones) check(`stone ${s.msg}`, s.x, s.y);
  L.pods.forEach((p, i) => check(`pod ${i}`, p.x, p.y));
  L.pearls.forEach((p, i) => check(`pearl ${i}`, p[0], p[1]));
  if (L.exit) check('exit', ...L.exit);
  if (L.arena) check('arena', L.arena.cx, L.arena.cy);
  L.fish.forEach((f, i) => check(`fish ${i}`, f.x, f.y));
  L.jellies.forEach((j, i) => check(`jelly ${i}`, j[0], j[1]));
  L.sharks.forEach((s, i) => check(`shark ${i}`, s.x, s.y));
  if (process.env.OUT) {
    // Simple PGM preview: rock dark, water light, reachable area tinted.
    const { w, h } = t;
    const buf = Buffer.alloc(w * h * 3);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = j * w + i, x = t.x0 + (i + 0.5) * 16, y = t.y0 + (j + 0.5) * 16;
      const solid = t.dens[k] > 0.5;
      const reach = !solid && ok(x, y);
      const c = solid ? [60, 50, 45] : reach ? (y < 0 ? [200, 220, 255] : [90, 170, 210]) : [30, 60, 90];
      buf.set(c, k * 3);
    }
    const mark = (x, y, c) => {
      const i0 = Math.floor((x - t.x0) / 16), j0 = Math.floor((y - t.y0) / 16);
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
        const i = i0 + di, j = j0 + dj;
        if (i >= 0 && j >= 0 && i < w && j < h) buf.set(c, (j * w + i) * 3);
      }
    };
    L.stones.forEach(s => mark(s.x, s.y, [0, 255, 255]));
    L.pods.forEach(p => mark(p.x, p.y, [255, 0, 255]));
    L.pearls.forEach(p => mark(p[0], p[1], [255, 255, 255]));
    L.gates.forEach(g => { for (let y = g.y0; y < g.y1; y += 16) mark(g.x, y, [255, 255, 0]); });
    if (L.exit) mark(...L.exit, [0, 255, 0]);
    mark(...L.start, [255, 128, 0]);
    writeFileSync(`${process.env.OUT}/level${L.id}.ppm`, Buffer.concat([Buffer.from(`P6 ${w} ${h} 255\n`), buf]));
  }
}
console.log(bad ? `${bad} problems` : 'all stages OK');
process.exitCode = bad ? 1 : 0;

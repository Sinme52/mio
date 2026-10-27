// Level geometry: a density grid built from designer shapes plus noise, and a signed distance field
// used for collision. Pure data, no DOM/GL, so it can run in Node for level validation.
import { clamp, fbm, segDist, curveY, smoothstep } from './util.js';

export const CELL = 16;
const FAR = 1e9;

// Felzenszwalb & Huttenlocher 1D squared distance transform.
function edt1d(f, n, d, v, z) {
  let k = 0;
  v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  const inter = (q, r) => ((f[q] + q * q) - (f[r] + r * r)) / (2 * q - 2 * r);
  for (let q = 1; q < n; q++) {
    let s = inter(q, v[k]);
    while (s <= z[k]) { k--; s = inter(q, v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const r = v[k];
    d[q] = (q - r) * (q - r) + f[r];
  }
}

// Euclidean distance (in cells) from every cell to the nearest cell where mask is true.
function edt(mask, w, h) {
  const g = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = mask[i] ? 0 : FAR;
  const n = Math.max(w, h);
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = g[y * w + x];
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) g[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = g[y * w + x];
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) g[y * w + x] = Math.sqrt(d[x]);
  }
  return g;
}

function shapeOpenness(s, x, y) {
  // Positive inside the shape (distance to its border), negative outside.
  if (s.type === 'capsule') return s.r - segDist(x, y, s.a[0], s.a[1], s.b[0], s.b[1]);
  if (s.type === 'ellipse') {
    const dx = (x - s.c[0]) / s.r[0], dy = (y - s.c[1]) / s.r[1];
    return (1 - Math.hypot(dx, dy)) * Math.min(s.r[0], s.r[1]);
  }
  if (s.type === 'rect') {
    const dx = Math.max(s.x0 - x, x - s.x1), dy = Math.max(s.y0 - y, y - s.y1);
    return -Math.max(dx, dy);
  }
  throw new Error(`unknown shape ${s.type}`);
}

export class Terrain {
  constructor(level) {
    const t0 = performance.now();
    this.x0 = -256;
    this.y0 = -512;
    this.w = Math.ceil((level.width + 512) / CELL);
    this.h = Math.ceil((level.height + 768) / CELL);
    const { w, h } = this;
    const dens = new Float32Array(w * h);
    const amp = level.noise ?? 22;
    const seed = level.seed ?? 1;
    for (let j = 0; j < h; j++) {
      const y = this.y0 + (j + 0.5) * CELL;
      for (let i = 0; i < w; i++) {
        const x = this.x0 + (i + 0.5) * CELL;
        let open = -FAR;
        if (level.floor) open = curveY(level.floor, x) - y;
        if (level.ceiling) {
          for (const c of level.ceiling) {
            if (x > c.x0 && x < c.x1) {
              const edgeFade = Math.min(x - c.x0, c.x1 - x);
              open = Math.min(open, Math.max(y - curveY(c.y, x), -edgeFade));
            }
          }
        }
        for (const s of level.open || []) open = Math.max(open, shapeOpenness(s, x, y));
        for (const s of level.solid || []) open = Math.min(open, -shapeOpenness(s, x, y));
        // Nothing solid outside the level's sides or under its bottom is reachable anyway.
        open = Math.min(open, x + 200, level.width + 200 - x, level.height - y);
        const n = (fbm(x * 0.006, y * 0.006, 4, seed) - 0.5) * 2 * amp + (fbm(x * 0.03, y * 0.03, 3, seed + 5) - 0.5) * 0.7 * amp;
        dens[j * w + i] = smoothstep(-10, 10, -(open + n));
      }
    }
    // The sky never holds rock unless a shape puts it there on purpose (islands are solid shapes).
    this.dens = dens;
    const solid = new Uint8Array(w * h), open = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) { solid[i] = dens[i] > 0.5 ? 1 : 0; open[i] = 1 - solid[i]; }
    const toSolid = edt(solid, w, h), toOpen = edt(open, w, h);
    const sdf = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) sdf[i] = (solid[i] ? -(toOpen[i] - 0.5) : toSolid[i] - 0.5) * CELL;
    this.sdf = sdf;
    // RGBA texture: density, depth inside rock, distance to rock from water.
    const tex = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      tex[i * 4] = Math.round(dens[i] * 255);
      tex[i * 4 + 1] = Math.round(clamp((toOpen[i] - 0.5) / 7, 0, 1) * 255);
      tex[i * 4 + 2] = Math.round(clamp(toSolid[i] / 12, 0, 1) * 255);
      tex[i * 4 + 3] = 255;
    }
    this.texData = tex;
    this.buildMs = performance.now() - t0;
  }

  get rect() { return [this.x0, this.y0, this.w * CELL, this.h * CELL]; }

  // Bilinear sample of the signed distance (world units, positive in water/air).
  dist(x, y) {
    const gx = (x - this.x0) / CELL - 0.5, gy = (y - this.y0) / CELL - 0.5;
    if (gy < 0) return Math.max(this.sampleRaw(gx, 0), -gy * CELL);
    if (gx < 0 || gx > this.w - 1 || gy > this.h - 1) return -CELL * 4;
    return this.sampleRaw(gx, gy);
  }

  sampleRaw(gx, gy) {
    const { w, h, sdf } = this;
    const ix = clamp(Math.floor(gx), 0, w - 2), iy = clamp(Math.floor(gy), 0, h - 2);
    const fx = clamp(gx - ix, 0, 1), fy = clamp(gy - iy, 0, 1);
    const i = iy * w + ix;
    const a = sdf[i] + (sdf[i + 1] - sdf[i]) * fx;
    const b = sdf[i + w] + (sdf[i + w + 1] - sdf[i + w]) * fx;
    return a + (b - a) * fy;
  }

  normal(x, y) {
    const e = CELL * 0.5;
    const nx = this.dist(x + e, y) - this.dist(x - e, y);
    const ny = this.dist(x, y + e) - this.dist(x, y - e);
    const l = Math.hypot(nx, ny) || 1;
    return [nx / l, ny / l];
  }

  // Push a circle out of rock. Returns the contact normal or null.
  collide(body, r, bounce = 0) {
    let hit = null;
    for (let it = 0; it < 3; it++) {
      const d = this.dist(body.x, body.y);
      if (d >= r) break;
      const [nx, ny] = this.normal(body.x, body.y);
      body.x += nx * (r - d);
      body.y += ny * (r - d);
      const vn = body.vx * nx + body.vy * ny;
      if (vn < 0) { body.vx -= nx * vn * (1 + bounce); body.vy -= ny * vn * (1 + bounce); }
      hit = [nx, ny];
    }
    return hit;
  }

  // Points on rock surfaces in the water, for placing plants and corals.
  // kind 'floor' = rock below open water, 'ceiling' = rock above open water.
  surfacePoints(step, kind, minY = 30) {
    const pts = [];
    const { w, h, dens } = this;
    const stride = Math.max(1, Math.round(step / CELL));
    for (let i = 2; i < w - 2; i += stride) {
      for (let j = 1; j < h - 1; j++) {
        const a = dens[(j - 1) * w + i] > 0.5, b = dens[j * w + i] > 0.5;
        const y = this.y0 + j * CELL;
        if (y < minY) continue;
        if (kind === 'floor' && !a && b) pts.push([this.x0 + (i + 0.5) * CELL, y]);
        if (kind === 'ceiling' && a && !b) pts.push([this.x0 + (i + 0.5) * CELL, y]);
      }
    }
    return pts;
  }

  // Breadth-first search over cells with at least `clear` units of room; used to validate levels.
  reachable(from, clear) {
    const { w, h, sdf } = this;
    const seen = new Uint8Array(w * h);
    const ci = (x, y) => Math.floor((y - this.y0) / CELL) * w + Math.floor((x - this.x0) / CELL);
    const start = ci(from[0], from[1]);
    const q = [start];
    seen[start] = 1;
    while (q.length) {
      const c = q.pop();
      const x = c % w, y = (c - x) / w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (seen[n] || sdf[n] < clear) continue;
        seen[n] = 1;
        q.push(n);
      }
    }
    return (x, y) => seen[ci(x, y)] === 1;
  }
}

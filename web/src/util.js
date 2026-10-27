// Small math helpers, seeded random numbers and value noise (shared by terrain generation and gameplay).

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
export const len = (x, y) => Math.hypot(x, y);

export function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function rng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function hash(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 144665);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function vnoise(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}

export function fbm(x, y, oct = 4, seed = 0) {
  let v = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    v += a * vnoise(x * f, y * f, seed + i * 17);
    n += a; a *= 0.5; f *= 2.03;
  }
  return v / n;
}

// Distance from point p to segment ab.
export function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}

// Catmull-Rom interpolation through sorted [x, y] control points.
export function curveY(points, x) {
  if (x <= points[0][0]) return points[0][1];
  const n = points.length;
  if (x >= points[n - 1][0]) return points[n - 1][1];
  let i = 0;
  while (points[i + 1][0] < x) i++;
  const p0 = points[Math.max(i - 1, 0)][1], p1 = points[i][1];
  const p2 = points[i + 1][1], p3 = points[Math.min(i + 2, n - 1)][1];
  const t = (x - points[i][0]) / (points[i + 1][0] - points[i][0]);
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

// The animated sea surface. Must match surfaceY() in shaders.js.
export const WAVE_AMP = 6;
export function surfaceY(x, t) {
  return WAVE_AMP * (0.6 * Math.sin(x * 0.011 + t * 1.3) + 0.3 * Math.sin(x * 0.023 - t * 1.9) + 0.1 * Math.sin(x * 0.047 + t * 2.7));
}

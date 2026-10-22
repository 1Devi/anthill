'use strict';
// Shared math helpers, seeded RNG, value noise and a spatial hash.

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const chance = (p) => Math.random() < p;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const dist2 = (ax, ay, bx, by) => {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
};
const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));

// Shortest signed angle difference from → to.
function angDiff(from, to) {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d < -Math.PI) d += TAU;
  return d;
}

function turnTowards(a, target, maxStep) {
  return a + clamp(angDiff(a, target), -maxStep, maxStep);
}

function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Value noise with fbm. Returns n(x, y) in [0, 1] plus n.fbm(x, y, octaves).
function makeNoise2D(seed) {
  const rng = mulberry32(seed);
  const vals = new Float32Array(256);
  const perm = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    vals[i] = rng();
    perm[i] = i;
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = perm[i];
    perm[i] = perm[j];
    perm[j] = t;
  }
  const h = (i, j) => vals[perm[(perm[i & 255] + j) & 255]];
  const sm = (t) => t * t * (3 - 2 * t);
  function n(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = sm(x - xi), yf = sm(y - yi);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return lerp(lerp(a, b, xf), lerp(c, d, xf), yf);
  }
  n.fbm = (x, y, oct = 4) => {
    let s = 0, amp = 1, f = 1, norm = 0;
    for (let o = 0; o < oct; o++) {
      s += amp * n(x * f, y * f);
      norm += amp;
      amp *= 0.5;
      f *= 2.03;
    }
    return s / norm;
  };
  return n;
}

// Uniform bucket grid for fast neighbour lookups.
class SpatialHash {
  constructor(w, h, cs) {
    this.cs = cs;
    this.cols = Math.ceil(w / cs);
    this.rows = Math.ceil(h / cs);
    this.buckets = Array.from({ length: this.cols * this.rows }, () => []);
    this.used = [];
  }

  clear() {
    for (const i of this.used) this.buckets[i].length = 0;
    this.used.length = 0;
  }

  insert(e) {
    const cx = clamp((e.x / this.cs) | 0, 0, this.cols - 1);
    const cy = clamp((e.y / this.cs) | 0, 0, this.rows - 1);
    const b = this.buckets[cy * this.cols + cx];
    if (b.length === 0) this.used.push(cy * this.cols + cx);
    b.push(e);
  }

  query(x, y, r, fn) {
    const cs = this.cs;
    const x0 = clamp(((x - r) / cs) | 0, 0, this.cols - 1);
    const x1 = clamp(((x + r) / cs) | 0, 0, this.cols - 1);
    const y0 = clamp(((y - r) / cs) | 0, 0, this.rows - 1);
    const y1 = clamp(((y + r) / cs) | 0, 0, this.rows - 1);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const b = this.buckets[cy * this.cols + cx];
        for (let i = 0; i < b.length; i++) fn(b[i]);
      }
    }
  }
}

// Point on a quadratic Bezier curve.
function bezierPoint(t, x1, y1, cx, cy, x2, y2) {
  const u = 1 - t;
  return {
    x: u * u * x1 + 2 * u * t * cx + t * t * x2,
    y: u * u * y1 + 2 * u * t * cy + t * t * y2,
  };
}

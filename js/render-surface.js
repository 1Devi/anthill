'use strict';
// Top-down surface renderer: terrain, rocks, pheromone glow, food, nests, ants and spiders.

const WS = 1.5; // pixels per world unit for the baked terrain / rock layers
const SNOW_Q = 3; // world units per pixel of the snow cover
const OS = 4; // pixels per world unit for cached object sprites
const SNOW_LEVELS = 4; // snow cover is drawn from this many depths, from a few drifts to a full blanket
const FS = 4; // pixels per world unit for cached food piles

const PHERO_COLORS = {
  home: [90, 160, 255],
  food: [120, 255, 110],
  alarm: [255, 70, 50],
  rivalHome: [200, 110, 255],
  rivalFood: [255, 170, 60],
};

// How the season looks: a colour wash over the meadow and how much snow lies on it. A new season
// fades in over the first part of its first day; snow builds up early in winter and melts in spring.
const SEASON_TINT = {
  spring: [150, 215, 120, 0.05],
  summer: [255, 220, 130, 0.04],
  autumn: [214, 124, 40, 0.14],
  winter: [196, 214, 240, 0.12],
};

function seasonLook(w) {
  const s = w.seasonInfo(), k = s.first ? 1 : clamp(s.frac / 0.15, 0, 1);
  const a = SEASON_TINT[s.prev.id], b = SEASON_TINT[s.def.id];
  let snow = 0;
  if (s.def.cold) snow = clamp(s.frac / 0.3, 0, 1);
  else if (s.prev.cold && !s.first) snow = clamp(1 - s.frac / 0.25, 0, 1);
  return { id: s.def.id, prev: s.prev.id, k, snow, falling: s.def.cold, tint: a.map((v, i) => lerp(v, b[i], k)) };
}

const CRUMB_COLORS = {
  seeds: ['#d9b26a', '#c99a4e', '#e6c784', '#b88a45'],
  berries: ['#b2223a', '#8e1b4a', '#c43b3b', '#a3123a'],
  sugar: ['#f6f3ea', '#ece6d6', '#fffdf6'],
  corpse: ['#2a1a12', '#3a2518', '#1e130c'],
  prey: ['#5a3b33', '#7b4e3e', '#3b2a26', '#8a5a44'],
  surplus: ['#d9b26a', '#c99a4e', '#e6c784', '#b2223a', '#b88a45', '#c43b3b'],
};

class SurfaceRenderer {
  constructor() {
    this.w = null;
    this.frame = 0;
    this.foodCache = new Map();
    this.drops = [];
    this.flakes = [];
    this.leaves = [];
    this.ripples = [];
    this.objCache = new Map();
  }

  build(w) {
    this.w = w;
    this.bg = this.makeBackground(w);
    this.walls = document.createElement('canvas');
    this.walls.width = w.W * WS;
    this.walls.height = w.H * WS;
    this.paintWalls(0, 0, w.W, w.H);
    w.wallDirty.length = 0;
    this.phero = document.createElement('canvas');
    this.phero.width = w.gw;
    this.phero.height = w.gh;
    this.pctx = this.phero.getContext('2d');
    this.pimg = this.pctx.createImageData(w.gw, w.gh);
    // A slightly blurred copy at grid resolution hides the cell stair-steps once scaled up.
    this.psoft = document.createElement('canvas');
    this.psoft.width = w.gw;
    this.psoft.height = w.gh;
    this.psctx = this.psoft.getContext('2d');
    this.psctx.filter = 'blur(0.7px)';
    this.foodCache.clear();
    this.mounds = new Map(w.colonies.map((c) => [c, this.makeMound(c)]));
    this.snowField = null; // made the first time snow falls
    this.snowLevels = [];
    this.objCache.clear();
    this.water = document.createElement('canvas');
    this.water.width = w.gw * 2;
    this.water.height = w.gh * 2;
    this.waterVersion = -1;
    this.waterLevel = -1;
    this.wetCells = [];
    this.ripples.length = 0;
  }

  // ---------- meadow objects ----------

  drawLeaf(ctx, o) {
    const rng = mulberry32(o.seed), r = o.size, autumn = rng() < 0.35;
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(o.a);
    const leaf = () => {
      ctx.beginPath();
      ctx.moveTo(-r, 0);
      ctx.bezierCurveTo(-r * 0.4, -r * 0.62, r * 0.5, -r * 0.5, r, 0);
      ctx.bezierCurveTo(r * 0.5, r * 0.5, -r * 0.4, r * 0.62, -r, 0);
    };
    ctx.translate(0.8, 1.2);
    leaf();
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fill();
    ctx.translate(-0.8, -1.2);
    leaf();
    ctx.fillStyle = autumn ? `hsl(${30 + rng() * 20},${45 + rng() * 15}%,${32 + rng() * 10}%)` : `hsl(${85 + rng() * 35},${30 + rng() * 20}%,${26 + rng() * 10}%)`;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,240,200,0.28)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(-r * 1.15, 0);
    ctx.lineTo(r * 0.92, 0);
    for (let k = -3; k <= 3; k++) {
      if (!k) continue;
      const x = (k / 4) * r * 0.8;
      ctx.moveTo(x, 0);
      ctx.lineTo(x + r * 0.22, Math.sign(k) * r * 0.32 * (1 - Math.abs(k) / 5));
      ctx.moveTo(x, 0);
      ctx.lineTo(x + r * 0.22, -Math.sign(k) * r * 0.32 * (1 - Math.abs(k) / 5));
    }
    ctx.stroke();
    ctx.restore();
  }

  // Twigs, pine cones, mushrooms and flowers, each drawn once into its own small canvas.
  objectSprite(o) {
    let e = this.objCache.get(o);
    if (e) return e;
    const R = o.type === 'twig' ? o.size / 2 + 22 : o.size * 1.6 + 4, size = Math.ceil(R * 2 * OS);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    ctx.setTransform(OS, 0, 0, OS, R * OS, R * OS);
    const rng = mulberry32(o.seed);
    if (o.type === 'twig') this.drawTwig(ctx, o, rng);
    else if (o.type === 'cone') this.drawCone(ctx, o, rng);
    else if (o.type === 'mushrooms') this.drawMushrooms(ctx, o, rng);
    else this.drawFlower(ctx, o, rng);
    e = { canvas: c, R };
    this.objCache.set(o, e);
    return e;
  }

  drawTwig(ctx, o, rng) {
    const L = o.size, Wd = CFG.OBJECTS.twig.width;
    ctx.rotate(o.a);
    const pts = [];
    for (let d = -L / 2; d <= L / 2 + 0.1; d += L / 8) pts.push([d, (rng() - 0.5) * 2.4]);
    const stroke = (w, color, dx = 0, dy = 0, list = pts) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      ctx.beginPath();
      list.forEach(([x, y], i) => (i ? ctx.lineTo(x + dx, y + dy) : ctx.moveTo(x + dx, y + dy)));
      ctx.stroke();
    };
    ctx.lineCap = ctx.lineJoin = 'round';
    // Side shoots first, so the main stick lies over their bases.
    const shoots = [];
    for (let k = 0; k < 2 + Math.floor(rng() * 2); k++) {
      const at = (rng() - 0.5) * L * 0.7, side = rng() < 0.5 ? -1 : 1, len = 12 + rng() * 22, a = side * (0.5 + rng() * 0.5);
      shoots.push([[at, 0], [at + Math.cos(a) * len * 0.5, Math.sin(a) * len * 0.5], [at + Math.cos(a) * len, Math.sin(a) * len + side * 2]]);
    }
    for (const sh of shoots) stroke(Wd * 0.45 + 1, 'rgba(0,0,0,0.25)', 1.2, 1.8, sh);
    stroke(Wd + 1.5, 'rgba(0,0,0,0.3)', 1.6, 2.4);
    for (const sh of shoots) stroke(Wd * 0.45, '#5e4129', 0, 0, sh);
    stroke(Wd, '#5a3e27');
    stroke(Wd * 0.55, '#77553a', 0, -Wd * 0.12);
    stroke(Wd * 0.18, 'rgba(255,225,180,0.35)', 0, -Wd * 0.28);
    // Bark grooves and knots.
    ctx.strokeStyle = 'rgba(30,18,8,0.45)';
    ctx.lineWidth = 0.6;
    for (let k = 0; k < L / 6; k++) {
      const x = (rng() - 0.5) * L * 0.95, y = (rng() - 0.5) * Wd * 0.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 3 + rng() * 5, y + (rng() - 0.5) * 0.6);
      ctx.stroke();
    }
    for (let k = 0; k < 2; k++) {
      ctx.fillStyle = '#3e2a19';
      ctx.beginPath();
      ctx.ellipse((rng() - 0.5) * L * 0.8, (rng() - 0.5) * Wd * 0.3, 1.6, 1.1, 0, 0, TAU);
      ctx.fill();
    }
    // A pale broken end.
    ctx.fillStyle = '#c9a477';
    ctx.beginPath();
    ctx.ellipse(pts[pts.length - 1][0], pts[pts.length - 1][1], 1.2, Wd * 0.45, 0, 0, TAU);
    ctx.fill();
  }

  drawCone(ctx, o, rng) {
    const r = o.size;
    ctx.rotate(o.a);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(1.5, 2, r * 1.35, r * 0.95, 0, 0, TAU);
    ctx.fill();
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 1, 0, 0, r * 1.4);
    g.addColorStop(0, '#8a5f39');
    g.addColorStop(1, '#4a3020');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.3, r * 0.92, 0, 0, TAU);
    ctx.fill();
    // Rows of woody scales, smaller towards the tip.
    for (let row = 0; row < 6; row++) {
      const x = -r * 1.05 + row * r * 0.42, w = r * (0.95 - Math.abs(row - 2) * 0.12);
      for (let k = -2; k <= 2; k++) {
        const y = k * w * 0.36 + (row % 2) * w * 0.18;
        if (Math.abs(y) > w * 0.8) continue;
        ctx.fillStyle = `rgb(${(110 + rng() * 30) | 0},${(72 + rng() * 20) | 0},${(42 + rng() * 14) | 0})`;
        ctx.beginPath();
        ctx.ellipse(x, y, r * 0.24, r * 0.17, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(30,18,8,0.55)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.arc(x - r * 0.05, y, r * 0.2, -1.2, 1.2);
        ctx.stroke();
      }
    }
  }

  drawMushrooms(ctx, o, rng) {
    const r = o.size, red = rng() < 0.3, caps = [];
    for (let k = 0; k < 3 + Math.floor(rng() * 3); k++) {
      const a = rng() * TAU, d = rng() * r * 0.55;
      caps.push([Math.cos(a) * d, Math.sin(a) * d, r * (0.32 + rng() * 0.25)]);
    }
    caps.sort((p, q) => p[2] - q[2]);
    for (const [x, y, cr] of caps) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.arc(x + 1.2, y + 1.8, cr, 0, TAU);
      ctx.fill();
    }
    for (const [x, y, cr] of caps) {
      const g = ctx.createRadialGradient(x - cr * 0.35, y - cr * 0.35, cr * 0.1, x, y, cr);
      if (red) {
        g.addColorStop(0, '#e2553a');
        g.addColorStop(1, '#9c2416');
      } else {
        g.addColorStop(0, '#d6b48a');
        g.addColorStop(0.7, '#a77c50');
        g.addColorStop(1, '#7a5634');
      }
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, cr, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = red ? 'rgba(255,230,210,0.45)' : 'rgba(250,235,210,0.55)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.arc(x, y, cr * 0.92, 0, TAU);
      ctx.stroke();
      if (red) {
        ctx.fillStyle = 'rgba(255,250,240,0.92)';
        for (let k = 0; k < 4; k++) {
          ctx.beginPath();
          ctx.arc(x + (rng() - 0.5) * cr * 1.2, y + (rng() - 0.5) * cr * 1.2, 0.5 + rng() * cr * 0.12, 0, TAU);
          ctx.fill();
        }
      }
    }
  }

  drawFlower(ctx, o, rng) {
    const r = o.size, petals = 5 + Math.floor(rng() * 2);
    const [petal, heart] = [['#f6f2e6', '#f2c53d'], ['#f4d24a', '#d9822b'], ['#e9a3c9', '#f4d24a'], ['#b9a3f0', '#f4e3a0']][Math.floor(rng() * 4)];
    ctx.rotate(o.a);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.arc(1, 1.5, r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = petal;
    for (let k = 0; k < petals; k++) {
      const a = (k / petals) * TAU;
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.5, r * 0.3, a, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = heart;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.3, 0, TAU);
    ctx.fill();
  }

  // ---------- puddles ----------

  // Puddles drawn from the smooth low-ground field at twice the grid resolution, so the shores are
  // round: a muddy rim, light shallows, a deeper middle. Redrawn every few percent of wetness.
  updateWater() {
    const w = this.w, level = w.wetLevel ? Math.max(1, w.wetLevel - (w.wetLevel % 3)) : 0;
    if (this.waterLevel === level && this.waterVersion === w.waterVersion) return;
    if (this.waterLevel !== level || !level) {
      const gw = w.gw, gh = w.gh, W2 = gw * 2, H2 = gh * 2;
      if (this.water.width !== W2) {
        this.water.width = W2;
        this.water.height = H2;
      }
      const ctx = this.water.getContext('2d'), img = ctx.createImageData(W2, H2), d = img.data;
      if (level && w.lowland) {
        const low = w.lowland, walls = w.walls, th = w.floodAt[level];
        for (let py = 0; py < H2; py++) {
          const fy = clamp((py + 0.5) / 2 - 0.5, 0, gh - 1.001), cy = fy | 0, ty = fy - cy;
          for (let px = 0; px < W2; px++) {
            const fx = clamp((px + 0.5) / 2 - 0.5, 0, gw - 1.001), cx = fx | 0, tx = fx - cx, k = cy * gw + cx;
            if (walls[((py >> 1) * gw) + (px >> 1)]) continue;
            const v = lerp(lerp(low[k], low[k + 1], tx), lerp(low[k + gw], low[k + gw + 1], tx), ty) - th, o = (py * W2 + px) * 4;
            // About one pixel of the field's slope: enough to antialias the shore.
            if (v > -0.03) {
              const t = clamp(v / 0.08, 0, 1), cover = clamp((v + 0.03) / 0.03, 0, 1);
              d[o] = lerp(92, 38, t);
              d[o + 1] = lerp(132, 78, t);
              d[o + 2] = lerp(158, 118, t);
              d[o + 3] = lerp(205, 240, t) * cover;
            } else if (v > -0.07) {
              d[o] = 50;
              d[o + 1] = 36;
              d[o + 2] = 24;
              d[o + 3] = 110 * (1 - (-0.03 - v) / 0.04);
            }
          }
        }
      }
      ctx.putImageData(img, 0, 0);
      this.waterLevel = level;
    }
    this.waterVersion = w.waterVersion;
    this.wetCells.length = 0;
    for (let i = 0; i < w.water.length; i++) if (w.water[i]) this.wetCells.push(i);
  }

  drawPuddles(ctx, raining) {
    const w = this.w;
    this.updateWater();
    if (!this.wetCells.length) {
      this.ripples.length = 0;
      return;
    }
    ctx.drawImage(this.water, 0, 0, w.W, w.H);
    if (raining) {
      for (let k = 0; k < 4 && this.ripples.length < 90; k++) {
        const i = this.wetCells[(Math.random() * this.wetCells.length) | 0];
        this.ripples.push({ x: ((i % w.gw) + Math.random()) * CFG.CELL, y: (((i / w.gw) | 0) + Math.random()) * CFG.CELL, t: 0 });
      }
    }
    ctx.lineWidth = 0.6;
    for (const r of this.ripples) {
      r.t += 1 / 60;
      ctx.strokeStyle = `rgba(210,230,245,${0.6 * (1 - r.t / 0.9)})`;
      ctx.beginPath();
      ctx.arc(r.x, r.y, 1 + r.t * 7, 0, TAU);
      ctx.stroke();
    }
    this.ripples = this.ripples.filter((r) => r.t < 0.9);
  }

  // Snow cover at one depth (1..SNOW_LEVELS): drifts with crisp edges, a superset of the shallower ones.
  snowLevel(level) {
    if (this.snowLevels[level]) return this.snowLevels[level];
    const w = this.w, lw = Math.ceil(w.W / SNOW_Q), lh = Math.ceil(w.H / SNOW_Q);
    if (!this.snowField) {
      const noise = makeNoise2D(w.seed ^ 0x5a0f);
      this.snowField = new Float32Array(lw * lh);
      for (let y = 0; y < lh; y++) {
        for (let x = 0; x < lw; x++) {
          const n = noise.fbm(x * SNOW_Q * 0.011, y * SNOW_Q * 0.011, 4) * 0.9 + noise(x * SNOW_Q * 0.07, y * SNOW_Q * 0.07) * 0.1;
          this.snowField[y * lw + x] = clamp((n - 0.5) * 3.2 + 0.5, 0, 1);
        }
      }
    }
    // Even the deepest snow leaves a few bare patches of brown earth.
    const t = 1 - (level / SNOW_LEVELS) * 0.86, c = document.createElement('canvas');
    c.width = lw;
    c.height = lh;
    const ctx = c.getContext('2d'), img = ctx.createImageData(lw, lh);
    for (let i = 0; i < lw * lh; i++) {
      const n = this.snowField[i], a = clamp((n - t + 0.05) / 0.1, 0, 1);
      img.data[i * 4] = 238 + n * 10;
      img.data[i * 4 + 1] = 243 + n * 8;
      img.data[i * 4 + 2] = 255;
      img.data[i * 4 + 3] = a * 240;
    }
    ctx.putImageData(img, 0, 0);
    return (this.snowLevels[level] = c);
  }

  drawObject(ctx, o) {
    const s = this.objectSprite(o);
    ctx.drawImage(s.canvas, o.x - s.R, o.y - s.R, s.R * 2, s.R * 2);
  }

  // Deeper snow covers more ground; partial depths blend the two nearest levels.
  drawSnow(ctx, amount, alpha = 1) {
    const x = amount * SNOW_LEVELS, lo = Math.floor(x), f = x - lo, w = this.w;
    ctx.globalAlpha = alpha;
    if (lo >= 1) ctx.drawImage(this.snowLevel(lo), 0, 0, w.W, w.H);
    if (lo < SNOW_LEVELS && f > 0.02) {
      ctx.globalAlpha = f * alpha;
      ctx.drawImage(this.snowLevel(lo + 1), 0, 0, w.W, w.H);
    }
    ctx.globalAlpha = 1;
  }

  // ---------- baked layers ----------

  makeBackground(w) {
    const noise = makeNoise2D(w.seed ^ 0x5eed);
    const lw = w.W / 2, lh = w.H / 2;
    const low = document.createElement('canvas');
    low.width = lw;
    low.height = lh;
    const lctx = low.getContext('2d');
    const img = lctx.createImageData(lw, lh);
    for (let y = 0; y < lh; y++) {
      for (let x = 0; x < lw; x++) {
        const n = noise.fbm(x * 0.02, y * 0.02, 4);
        const d = noise(x * 0.18 + 100, y * 0.18);
        const g = clamp((noise.fbm(x * 0.012 + 50, y * 0.012 + 50, 3) - 0.52) * 4, 0, 1);
        const t = clamp(n * 1.3 - 0.15 + (d - 0.5) * 0.25, 0, 1);
        let r = lerp(78, 140, t), gg = lerp(60, 116, t), b = lerp(40, 78, t);
        r = lerp(r, 82, g * 0.75);
        gg = lerp(gg, 104, g * 0.75);
        b = lerp(b, 48, g * 0.75);
        const i = (y * lw + x) * 4;
        img.data[i] = r;
        img.data[i + 1] = gg;
        img.data[i + 2] = b;
        img.data[i + 3] = 255;
      }
    }
    lctx.putImageData(img, 0, 0);

    const c = document.createElement('canvas');
    c.width = w.W * WS;
    c.height = w.H * WS;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(low, 0, 0, c.width, c.height);
    ctx.scale(WS, WS);

    const rng = mulberry32(w.seed);
    const R = (a, b) => a + rng() * (b - a);
    // Sand grains.
    for (let i = 0; i < 30000 * w.areaK; i++) {
      const light = rng() < 0.5;
      ctx.fillStyle = light ? `rgba(230,205,160,${R(0.08, 0.3)})` : `rgba(30,20,10,${R(0.08, 0.3)})`;
      const s = R(0.3, 0.9);
      ctx.fillRect(R(0, w.W), R(0, w.H), s, s);
    }
    // Pebbles.
    for (let i = 0; i < 500 * w.areaK; i++) {
      const x = R(0, w.W), y = R(0, w.H), rx = R(0.8, 2.6), ry = rx * R(0.6, 1), rot = R(0, TAU);
      const v = Math.floor(R(110, 175));
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(x + 0.5, y + 0.7, rx, ry, rot, 0, TAU);
      ctx.fill();
      ctx.fillStyle = `rgb(${v},${v - 8},${v - 20})`;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.ellipse(x - rx * 0.3, y - ry * 0.3, rx * 0.4, ry * 0.35, rot, 0, TAU);
      ctx.fill();
    }
    // Grass tufts where the soil is greener.
    ctx.lineCap = 'round';
    for (let i = 0; i < 1400 * w.areaK; i++) {
      const x = R(0, w.W), y = R(0, w.H);
      const g = noise.fbm((x / 2) * 0.012 + 50, (y / 2) * 0.012 + 50, 3);
      if (g < 0.5 && rng() > 0.15) continue;
      const blades = 3 + Math.floor(rng() * 5);
      for (let b = 0; b < blades; b++) {
        const a = -Math.PI / 2 + R(-0.9, 0.9), len = R(3, 8);
        ctx.strokeStyle = `rgba(${Math.floor(R(70, 120))},${Math.floor(R(110, 160))},${Math.floor(R(40, 70))},${R(0.5, 0.9)})`;
        ctx.lineWidth = R(0.4, 0.9);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + R(-1, 1), y + Math.sin(a) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len);
        ctx.stroke();
      }
    }
    // Fallen leaves and twigs.
    for (let i = 0; i < 45 * w.areaK; i++) {
      const x = R(0, w.W), y = R(0, w.H), len = R(8, 16), rot = R(0, TAU);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      const hue = R(25, 55);
      ctx.fillStyle = `hsla(${hue},55%,${R(28, 40)}%,0.85)`;
      ctx.beginPath();
      ctx.moveTo(-len / 2, 0);
      ctx.quadraticCurveTo(0, -len * 0.38, len / 2, 0);
      ctx.quadraticCurveTo(0, len * 0.38, -len / 2, 0);
      ctx.fill();
      ctx.strokeStyle = 'rgba(40,25,10,0.5)';
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      ctx.moveTo(-len / 2 - 2, 0);
      ctx.lineTo(len / 2, 0);
      ctx.stroke();
      ctx.restore();
    }
    for (let i = 0; i < 30 * w.areaK; i++) {
      const x = R(0, w.W), y = R(0, w.H), len = R(10, 26), a = R(0, TAU);
      ctx.strokeStyle = `rgba(${Math.floor(R(70, 100))},${Math.floor(R(50, 70))},35,0.9)`;
      ctx.lineWidth = R(0.8, 1.6);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.stroke();
    }
    // Big fallen leaves lying on the meadow (scenery from the world's objects).
    for (const o of w.objects) if (o.type === 'leaf') this.drawLeaf(ctx, o);
    return c;
  }

  paintWalls(x0, y0, x1, y1) {
    const w = this.w, C = CFG.CELL;
    const ctx = this.walls.getContext('2d');
    ctx.setTransform(WS, 0, 0, WS, 0, 0);
    const cx0 = Math.max(0, Math.floor(x0 / C) - 3), cx1 = Math.min(w.gw - 1, Math.ceil(x1 / C) + 3);
    const cy0 = Math.max(0, Math.floor(y0 / C) - 3), cy1 = Math.min(w.gh - 1, Math.ceil(y1 / C) + 3);
    // Repaint (clip) a slightly smaller area than we redraw, so neighbouring blobs stay intact.
    const rx = Math.max(0, (Math.floor(x0 / C) - 2) * C), ry = Math.max(0, (Math.floor(y0 / C) - 2) * C);
    const rw = Math.min(w.W, (Math.ceil(x1 / C) + 2) * C) - rx, rh = Math.min(w.H, (Math.ceil(y1 / C) + 2) * C) - ry;
    ctx.save();
    ctx.beginPath();
    ctx.rect(rx, ry, rw, rh);
    ctx.clip();
    ctx.clearRect(rx, ry, rw, rh);
    const wall = (cx, cy) => cx >= 0 && cy >= 0 && cx < w.gw && cy < w.gh && w.walls[cy * w.gw + cx] === 1;
    const hash = (cx, cy) => ((Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663)) >>> 0) % 1000 / 1000;
    const tone = this.rockNoise || (this.rockNoise = makeNoise2D(w.seed ^ 0x70c));
    const pass = (fn) => {
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) if (wall(cx, cy)) fn(cx, cy, (cx + 0.5) * C, (cy + 0.5) * C);
    };
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    pass((cx, cy, x, y) => {
      ctx.beginPath();
      ctx.arc(x + 1.6, y + 2.2, C * 1.0, 0, TAU);
      ctx.fill();
    });
    ctx.fillStyle = '#4a4239';
    pass((cx, cy, x, y) => {
      ctx.beginPath();
      ctx.arc(x, y, C * 0.98, 0, TAU);
      ctx.fill();
    });
    pass((cx, cy, x, y) => {
      const t = tone.fbm(x * 0.02, y * 0.02, 3), v = 88 + t * 80 + hash(cx, cy) * 8;
      ctx.fillStyle = `rgb(${v | 0},${(v - 7) | 0},${(v - 18) | 0})`;
      ctx.beginPath();
      ctx.arc(x, y, C * 0.78, 0, TAU);
      ctx.fill();
    });
    ctx.fillStyle = 'rgba(255,248,230,0.16)';
    pass((cx, cy, x, y) => {
      if (wall(cx, cy - 1) && wall(cx - 1, cy)) return;
      ctx.beginPath();
      ctx.arc(x - 0.8, y - 1.1, C * 0.5, 0, TAU);
      ctx.fill();
    });
    ctx.fillStyle = 'rgba(30,22,14,0.35)';
    pass((cx, cy, x, y) => {
      const h = hash(cx, cy);
      if (h < 0.35) ctx.fillRect(x + (h - 0.2) * 6, y + (hash(cy, cx) - 0.5) * 4, 0.9, 0.9);
    });
    ctx.restore();
  }

  makeMound(col) {
    const R = 34, size = R * 2 * FS;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    ctx.scale(FS, FS);
    ctx.translate(R, R);
    const g = ctx.createRadialGradient(0, 0, 6, 0, 0, R);
    g.addColorStop(0, 'rgba(150,118,78,1)');
    g.addColorStop(0.55, 'rgba(160,128,86,0.9)');
    g.addColorStop(1, 'rgba(150,120,80,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.fill();
    const tint = Sprites.PAL[col.palette].mound;
    for (let i = 0; i < 700; i++) {
      const a = rand(0, TAU), d = 7 + Math.pow(Math.random(), 0.7) * (R - 9);
      const v = rand(-30, 40);
      ctx.fillStyle = `rgba(${(tint[0] + v + 60) | 0},${(tint[1] + v + 50) | 0},${(tint[2] + v + 30) | 0},${rand(0.4, 0.9)})`;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * d, Math.sin(a) * d, rand(0.3, 0.9), 0, TAU);
      ctx.fill();
    }
    const h = ctx.createRadialGradient(0, 0, 0, 0, 0, 9);
    h.addColorStop(0, '#000');
    h.addColorStop(0.6, '#120b06');
    h.addColorStop(1, 'rgba(40,28,16,0)');
    ctx.fillStyle = h;
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, TAU);
    ctx.fill();
    return { canvas: c, R };
  }

  foodSprite(f) {
    if (f.kind === 'fruit' || f.kind === 'beetle') return this.findSprite(f);
    const vis = f.visible;
    let e = this.foodCache.get(f.id);
    if (e && e.vis === vis && e.crumbs === f.crumbs) return e;
    const R = f.r0 + 3, size = Math.ceil(R * 2 * FS);
    const c = e && e.canvas.width === size ? e.canvas : document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    ctx.setTransform(FS, 0, 0, FS, R * FS, R * FS);
    const cols = CRUMB_COLORS[f.kind] || CRUMB_COLORS.seeds;
    for (let i = vis - 1; i >= 0; i--) {
      const k = f.crumbs[i];
      ctx.save();
      ctx.translate(k.x, k.y);
      ctx.rotate(k.rot);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(0.3, 0.4, 1.6, 1.1, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = cols[Math.floor(k.v * cols.length)];
      ctx.beginPath();
      if (f.kind === 'sugar') ctx.rect(-0.9, -0.9, 1.8, 1.8);
      else if (f.kind === 'berries') ctx.arc(0, 0, 1.5, 0, TAU);
      else if (f.kind === 'prey') ctx.ellipse(0, 0, 1.9, 1.2, 0, 0, TAU);
      else if (f.kind === 'corpse') ctx.ellipse(0, 0, 1.4, 0.7, 0, 0, TAU);
      else ctx.ellipse(0, 0, 1.5, 0.95, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(-0.4, -0.35, 0.4, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    e = { canvas: c, vis, crumbs: f.crumbs, R };
    this.foodCache.set(f.id, e);
    return e;
  }

  // A fallen fruit or a dead beetle, with bites taken out as ants carry it away.
  findSprite(f) {
    const vis = Math.ceil((10 * Math.max(0, f.amount)) / f.max);
    let e = this.foodCache.get(f.id);
    if (e && e.vis === vis) return e;
    const r = f.r0 * 0.85, R = r + 8, size = Math.ceil(R * 2 * FS);
    const c = e ? e.canvas : document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    ctx.setTransform(FS, 0, 0, FS, R * FS, R * FS);
    const rng = mulberry32(f.id * 977);
    ctx.rotate(rng() * TAU);
    if (f.kind === 'fruit') {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.arc(1.5, 2.2, r, 0, TAU);
      ctx.fill();
      const g = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r);
      g.addColorStop(0, '#f08a4e');
      g.addColorStop(0.6, '#c8352a');
      g.addColorStop(1, '#7f1d18');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,240,220,0.45)';
      ctx.beginPath();
      ctx.ellipse(-r * 0.4, -r * 0.4, r * 0.28, r * 0.16, -0.7, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#4a2d18';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.1);
      ctx.lineTo(r * 0.15, -r * 0.45);
      ctx.stroke();
      ctx.fillStyle = '#5f8a35';
      ctx.beginPath();
      ctx.ellipse(r * 0.32, -r * 0.5, r * 0.22, r * 0.1, -0.5, 0, TAU);
      ctx.fill();
    } else {
      const L = r * 1.1;
      ctx.strokeStyle = '#1c1714';
      ctx.lineCap = 'round';
      ctx.lineWidth = 1.1;
      for (let k = -1; k <= 1; k++) {
        for (const s of [-1, 1]) {
          const a = s * (1.3 + k * 0.45 + (rng() - 0.5) * 0.4), x0 = k * L * 0.25;
          ctx.beginPath();
          ctx.moveTo(x0, 0);
          ctx.lineTo(x0 + Math.cos(a) * L * 0.55, Math.sin(a) * L * 0.55);
          ctx.lineTo(x0 + Math.cos(a + s * 0.6) * L * 0.85, Math.sin(a + s * 0.6) * L * 0.85);
          ctx.stroke();
        }
      }
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(1.2, 1.8, L * 0.62, L * 0.42, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#231c18';
      ctx.beginPath();
      ctx.ellipse(L * 0.58, 0, L * 0.18, L * 0.16, 0, 0, TAU);
      ctx.fill();
      for (const s of [-1, 1]) {
        const g = ctx.createLinearGradient(0, 0, 0, s * L * 0.4);
        g.addColorStop(0, '#2e5f57');
        g.addColorStop(1, '#173430');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(-L * 0.05, s * L * 0.19, L * 0.55, L * 0.2, 0, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(180,255,235,0.3)';
      ctx.beginPath();
      ctx.ellipse(-L * 0.15, -L * 0.24, L * 0.3, L * 0.06, 0, 0, TAU);
      ctx.fill();
    }
    // Bites: one more for every tenth carried away.
    ctx.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < 10 - vis; k++) {
      const a = rng() * TAU, d = r * (0.75 + rng() * 0.3);
      ctx.beginPath();
      ctx.arc(Math.cos(a) * d, Math.sin(a) * d, r * (0.3 + rng() * 0.2), 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    e = { canvas: c, vis, R };
    this.foodCache.set(f.id, e);
    return e;
  }

  updatePhero(showOwn, showRival) {
    const w = this.w, d = this.pimg.data, n = w.gw * w.gh;
    const p = w.player;
    const layers = [];
    if (showOwn) layers.push([p.home.d, PHERO_COLORS.home, 1], [p.foodP.d, PHERO_COLORS.food, 1], [p.alarm.d, PHERO_COLORS.alarm, 1]);
    if (showRival) {
      for (const r of w.rivals) layers.push([r.home.d, PHERO_COLORS.rivalHome, 0.6], [r.foodP.d, PHERO_COLORS.rivalFood, 0.6], [r.alarm.d, PHERO_COLORS.alarm, 0.6]);
    }
    for (let i = 0; i < n; i++) {
      let sr = 0, sg = 0, sb = 0, sv = 0;
      for (let l = 0; l < layers.length; l++) {
        const v = layers[l][0][i];
        if (v === 0) continue;
        const wv = Math.min(1, v * v * 2) * layers[l][2], c = layers[l][1];
        sr += c[0] * wv;
        sg += c[1] * wv;
        sb += c[2] * wv;
        sv += wv;
      }
      const j = i * 4;
      if (sv === 0) {
        d[j + 3] = 0;
        continue;
      }
      d[j] = sr / sv;
      d[j + 1] = sg / sv;
      d[j + 2] = sb / sv;
      d[j + 3] = Math.min(200, sv * 230);
    }
    this.pctx.putImageData(this.pimg, 0, 0);
    this.psctx.clearRect(0, 0, w.gw, w.gh);
    this.psctx.drawImage(this.phero, 0, 0);
    this.psctx.drawImage(this.phero, 0, 0);
  }

  // Trails glow additively, except over deep snow, where adding light would make them vanish.
  drawPhero(ctx, alpha, snow = 0) {
    ctx.save();
    ctx.globalCompositeOperation = snow > 0.3 ? 'source-over' : 'lighter';
    ctx.globalAlpha = alpha;
    ctx.drawImage(this.psoft, 0, 0, this.w.W, this.w.H);
    ctx.restore();
  }

  // ---------- frame ----------

  render(ctx, g) {
    const w = this.w, cam = g.cam, dpr = g.dpr;
    this.frame++;
    for (const r of w.wallDirty) this.paintWalls(r[0], r[1], r[2], r[3]);
    w.wallDirty.length = 0;

    const z = cam.zoom * dpr;
    const ox = -cam.x * z, oy = -cam.y * z;
    const view = { x0: cam.x - 30, y0: cam.y - 30, x1: cam.x + g.vw / cam.zoom + 30, y1: cam.y + g.vh / cam.zoom + 30 };
    const inView = (x, y) => x > view.x0 && x < view.x1 && y > view.y0 && y < view.y1;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#1b140e';
    ctx.fillRect(0, 0, g.canvas.width, g.canvas.height);
    ctx.setTransform(z, 0, 0, z, ox, oy);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.bg, 0, 0, w.W, w.H);
    const day = w.dayInfo(), look = seasonLook(w);
    // Flowers bloom in spring and summer.
    const bloom = look.id === 'spring' ? look.k : look.id === 'summer' ? 1 : look.id === 'autumn' ? 1 - look.k : 0;
    if (bloom > 0.01) {
      ctx.globalAlpha = bloom;
      for (const o of w.objects) if (o.type === 'flower' && inView(o.x, o.y)) this.drawObject(ctx, o);
      ctx.globalAlpha = 1;
    }
    // Snow lies on the ground; rocks and objects stay on top of it, so ants' obstacles remain visible, with a light frost.
    if (look.snow > 0.01) this.drawSnow(ctx, look.snow);
    ctx.drawImage(this.walls, 0, 0, w.W, w.H);
    const pad = CFG.OBJECTS.twig.len[1];
    for (const o of w.objects) {
      if (o.type === 'twig' || o.type === 'cone' || o.type === 'mushrooms') {
        if (o.x > view.x0 - pad && o.x < view.x1 + pad && o.y > view.y0 - pad && o.y < view.y1 + pad) this.drawObject(ctx, o);
      }
    }
    if (look.snow > 0.01) this.drawSnow(ctx, look.snow, 0.12);
    this.drawPuddles(ctx, w.rain > 0 && !look.falling);
    const [tr, tg, tb, ta] = look.tint;
    if (ta > 0.005) {
      ctx.fillStyle = `rgba(${tr | 0},${tg | 0},${tb | 0},${ta})`;
      ctx.fillRect(0, 0, w.W, w.H);
    }
    const trails = g.show.phero || g.show.rival;
    if (trails) {
      if (this.frame % 2 === 0) this.updatePhero(g.show.phero, g.show.rival);
      this.drawPhero(ctx, 0.5, look.snow);
    }

    for (const c of w.colonies) {
      const m = this.mounds.get(c);
      ctx.drawImage(m.canvas, c.x - m.R, c.y - m.R, m.R * 2, m.R * 2);
    }

    for (const f of w.foods) {
      if (!inView(f.x, f.y)) continue;
      const s = this.foodSprite(f);
      ctx.drawImage(s.canvas, f.x - s.R, f.y - s.R, s.R * 2, s.R * 2);
    }
    if (this.frame % 300 === 0) {
      const live = new Set(w.foods.map((f) => f.id));
      for (const id of this.foodCache.keys()) if (!live.has(id)) this.foodCache.delete(id);
    }

    this.drawAnts(ctx, g, z, ox, oy, inView);
    ctx.setTransform(z, 0, 0, z, ox, oy);
    for (const s of w.spiders) if (inView(s.x, s.y)) this.drawSpider(ctx, s);

    // Night darkens everything; trails get a second faint pass on top so they glow in the dark.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (day.night > 0.01) {
      ctx.fillStyle = `rgba(8,14,42,${day.night * 0.55})`;
      ctx.fillRect(0, 0, g.canvas.width, g.canvas.height);
    }
    ctx.setTransform(z, 0, 0, z, ox, oy);
    if (day.night > 0.2) {
      for (const c of w.colonies) {
        const gl = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, 40);
        gl.addColorStop(0, `rgba(255,190,110,${0.18 * day.night})`);
        gl.addColorStop(1, 'rgba(255,190,110,0)');
        ctx.fillStyle = gl;
        ctx.fillRect(c.x - 40, c.y - 40, 80, 80);
      }
    }

    if (trails && day.night > 0.05) this.drawPhero(ctx, day.night * 0.35, look.snow);

    this.drawOverlays(ctx, g, day);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // In winter the rain falls as snow; in autumn leaves drift down.
    if (look.falling) this.drawSnowfall(ctx, g, w.rain > 0 ? 1 : 0.3);
    else if (w.rain > 0) this.drawRain(ctx, g);
    if (look.id === 'autumn') this.drawLeaves(ctx, g, look.k);
  }

  drawAnts(ctx, g, z, ox, oy, inView) {
    const w = this.w;
    for (const col of w.colonies) {
      for (const a of col.ants) {
        if (a.inside || a.dead || !inView(a.x, a.y)) continue;
        const spr = Sprites.get(col.palette, a.caste, (a.anim | 0) & 3);
        const k = z / Sprites.S;
        const cs = Math.cos(a.a) * k, sn = Math.sin(a.a) * k;
        ctx.setTransform(cs, sn, -sn, cs, a.x * z + ox, a.y * z + oy);
        ctx.drawImage(spr.canvas, -spr.half, -spr.half);
        if (a.carry > 0) {
          ctx.fillStyle = '#e8c578';
          ctx.beginPath();
          ctx.arc(a.len * Sprites.S * 0.62, 0, Sprites.S * 1.25, 0, TAU);
          ctx.fill();
        }
        if (a.hitT > 0) {
          ctx.fillStyle = 'rgba(255,60,40,0.45)';
          ctx.beginPath();
          ctx.arc(0, 0, a.len * Sprites.S * 0.45, 0, TAU);
          ctx.fill();
        }
      }
    }
  }

  drawSpider(ctx, s) {
    const r = s.r;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(2, 3, r * 2.2, r * 1.6, s.a, 0, TAU);
    ctx.fill();
    ctx.rotate(s.a);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1b1512';
    for (let i = 0; i < 4; i++) {
      for (const side of [-1, 1]) {
        const swing = Math.sin(s.anim * 2.2 + i * 1.6 + (side > 0 ? Math.PI : 0)) * 0.22;
        const ang = side * (0.55 + i * 0.52) + swing;
        const hx = r * 0.3 - i * r * 0.12, hy = side * r * 0.25;
        const kx = hx + Math.cos(ang) * r * 1.5, ky = hy + Math.sin(ang) * r * 1.5;
        const fa = ang + side * (i < 2 ? -0.45 : 0.45);
        ctx.lineWidth = r * 0.16;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(kx, ky);
        ctx.stroke();
        ctx.lineWidth = r * 0.1;
        ctx.beginPath();
        ctx.moveTo(kx, ky);
        ctx.lineTo(kx + Math.cos(fa) * r * 1.7, ky + Math.sin(fa) * r * 1.7);
        ctx.stroke();
      }
    }
    const ab = ctx.createRadialGradient(-r * 0.9, -r * 0.25, r * 0.1, -r * 0.75, 0, r);
    ab.addColorStop(0, '#5a4a40');
    ab.addColorStop(1, '#1c1512');
    ctx.fillStyle = ab;
    ctx.beginPath();
    ctx.ellipse(-r * 0.75, 0, r * 0.95, r * 0.75, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(214,170,96,0.85)';
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.ellipse(-r * (0.4 + k * 0.35), 0, r * 0.1, r * (0.35 - k * 0.07), 0, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#2a211c';
    ctx.beginPath();
    ctx.ellipse(r * 0.35, 0, r * 0.55, r * 0.45, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#d33';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(r * 0.75, side * r * 0.15, r * 0.08, 0, TAU);
      ctx.fill();
    }
    if (s.hitT > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.ellipse(-r * 0.3, 0, r * 1.4, r, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    if (s.hp < s.maxHp) this.bar(ctx, s.x, s.y - r * 2.4, 22, s.hp / s.maxHp, '#e0543a');
  }

  bar(ctx, x, y, wdt, frac, color) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - wdt / 2 - 0.5, y - 0.5, wdt + 1, 3);
    ctx.fillStyle = color;
    ctx.fillRect(x - wdt / 2, y, wdt * clamp(frac, 0, 1), 2);
  }

  drawOverlays(ctx, g, day) {
    const w = this.w;
    for (const c of w.colonies) {
      if (c.underAttackT > 0) {
        const p = 0.5 + 0.5 * Math.sin(w.time * 10);
        ctx.strokeStyle = `rgba(255,60,40,${0.4 + p * 0.5})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(c.x, c.y, 26 + p * 4, 0, TAU);
        ctx.stroke();
      }
      if (c.queen.hp < c.queen.maxHp && c.alive) this.bar(ctx, c.x, c.y - 34, 36, c.queen.hp / c.queen.maxHp, c.isPlayer ? '#7fd36b' : '#e0543a');
      if (!c.alive) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        ctx.arc(c.x, c.y, 12, 0, TAU);
        ctx.fill();
      }
    }

    const rally = w.player.rally;
    if (rally) this.drawFlag(ctx, rally.x, rally.y, rally.raid ? '#ff5a3c' : '#ffd25a', 1);

    const sel = g.selected;
    if (sel && !sel.obj.dead && !(sel.obj.inside)) {
      const o = sel.obj;
      const r = sel.type === 'spider' ? o.r * 2.6 : sel.type === 'food' ? o.r0 + 5 : sel.type === 'colony' ? 30 : o.len * 0.9 + 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.2 / g.cam.zoom;
      ctx.setLineDash([3 / g.cam.zoom, 3 / g.cam.zoom]);
      ctx.beginPath();
      ctx.arc(o.x, o.y, r, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const m = g.mouseWorld;
    if (m && g.view === 'surface' && g.hover) {
      const tool = g.tool;
      if (tool === 'wall' || tool === 'erase' || tool === 'lure') {
        const col = tool === 'wall' ? '200,190,170' : tool === 'erase' ? '255,120,100' : '120,255,110';
        ctx.strokeStyle = `rgba(${col},0.9)`;
        ctx.fillStyle = `rgba(${col},0.12)`;
        ctx.lineWidth = 1 / g.cam.zoom;
        ctx.beginPath();
        ctx.arc(m.x, m.y, g.brush, 0, TAU);
        ctx.fill();
        ctx.stroke();
      } else if (tool === 'food') {
        ctx.globalAlpha = w.feedCooldown > 0 ? 0.25 : 0.6;
        ctx.fillStyle = '#f6f3ea';
        for (let i = 0; i < 9; i++) ctx.fillRect(m.x + Math.cos(i * 2.4) * (i * 0.9) - 1, m.y + Math.sin(i * 2.4) * (i * 0.9) - 1, 2, 2);
        ctx.globalAlpha = 1;
      } else if (tool === 'rally') {
        this.drawFlag(ctx, m.x, m.y, '#ffd25a', 0.5);
      }
    }
  }

  drawFlag(ctx, x, y, color, alpha) {
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#3a2a1a';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - 18);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - 18);
    ctx.lineTo(x + 11, y - 14.5);
    ctx.lineTo(x, y - 11);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha * 0.5;
    ctx.beginPath();
    ctx.ellipse(x, y, 10, 5, 0, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  drawSnowfall(ctx, g, intensity) {
    const W = g.canvas.width, H = g.canvas.height, dpr = g.dpr, n = Math.round(60 + 260 * intensity);
    if (intensity > 0.5) {
      ctx.fillStyle = 'rgba(205,215,235,0.16)';
      ctx.fillRect(0, 0, W, H);
    }
    while (this.flakes.length < n) this.flakes.push({ x: Math.random() * W, y: Math.random() * H, r: rand(0.8, 2.2), v: rand(0.5, 1.2), ph: rand(0, TAU) });
    ctx.fillStyle = 'rgba(250,252,255,0.85)';
    for (let i = 0; i < n; i++) {
      const f = this.flakes[i];
      f.ph += 0.03;
      f.y += (1 + intensity * 2.2) * f.v * dpr;
      f.x += (Math.sin(f.ph) * 0.6 - intensity * 1.5 * f.v) * dpr;
      if (f.y > H + 4) {
        f.y = -4;
        f.x = Math.random() * (W + 200);
      }
      if (f.x < -10) f.x += W + 20;
      ctx.fillRect(f.x, f.y, f.r * dpr, f.r * dpr);
    }
  }

  drawLeaves(ctx, g, alpha) {
    const W = g.canvas.width, H = g.canvas.height, dpr = g.dpr;
    while (this.leaves.length < 18) {
      this.leaves.push({ x: Math.random() * W, y: Math.random() * H, a: rand(0, TAU), spin: rand(-0.05, 0.05), v: rand(0.5, 1.1), ph: rand(0, TAU), c: pick(['#c8692a', '#d99a32', '#a8461f', '#b8842c']) });
    }
    ctx.save();
    ctx.globalAlpha = 0.85 * alpha;
    for (const l of this.leaves) {
      l.ph += 0.02;
      l.a += l.spin;
      l.y += 0.9 * l.v * dpr;
      l.x += Math.sin(l.ph) * 1.2 * dpr;
      if (l.y > H + 10) {
        l.y = -10;
        l.x = Math.random() * W;
      }
      ctx.setTransform(1, 0, 0, 1, l.x, l.y);
      ctx.rotate(l.a);
      ctx.fillStyle = l.c;
      ctx.beginPath();
      ctx.ellipse(0, 0, 4.5 * dpr, 2.2 * dpr * Math.abs(Math.cos(l.ph * 2)) + 0.6 * dpr, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  drawRain(ctx, g) {
    const W = g.canvas.width, H = g.canvas.height, dpr = g.dpr;
    ctx.fillStyle = 'rgba(70,90,120,0.16)';
    ctx.fillRect(0, 0, W, H);
    while (this.drops.length < 260) this.drops.push({ x: Math.random() * W, y: Math.random() * H, v: rand(0.8, 1.4) });
    ctx.strokeStyle = 'rgba(190,210,240,0.35)';
    ctx.lineWidth = dpr;
    ctx.beginPath();
    for (const d of this.drops) {
      d.x -= 4 * d.v * dpr;
      d.y += 16 * d.v * dpr;
      if (d.y > H) {
        d.y = -20;
        d.x = Math.random() * (W + 200);
      }
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x + 3 * dpr, d.y - 12 * dpr);
    }
    ctx.stroke();
  }
}

'use strict';
// Cross-section view of the player's nest: layered soil, lamp-lit chambers and tunnels, brood,
// food stores, fungus gardens and busy workers.

const NS = 1.5; // pixels per nest unit for the baked soil
const CS = 2; // pixels per nest unit for the cached layer of chambers and tunnels
const CAV_PAD = 36; // nest units around a redrawn region whose shapes still cast shadows into it
const LIGHT_Q = 8; // nest units per pixel of the darkness map
const IN_DARK = 0.5; // soil darkness inside the diggable area, away from the chambers
const OUT_DARK = 0.76; // soil darkness outside the diggable area
const DARK_RGB = '9,7,11';
const ANT_SCALE = 1.6; // ants are drawn larger in the cross-section so they read at this zoom
// Chambers are low, wide hollows: a gently arched ceiling and an almost flat floor (shares of ry).
const CEIL = 0.88;
const CEIL_EXP = 0.8; // lower = flatter ceiling
const FLOOR = 0.72;
const FLOOR_EXP = 0.5; // lower = flatter floor
const TUNNEL_W = 13;
const CAV_TILE = 640; // big redraws go in tiles of at most this many nest units, to keep scratch canvases small

// Cool, earthy soil, so the warm lamp-lit chambers stand out.
const SOIL_LAYERS = {
  humus: [50, 39, 31],
  loam: [114, 90, 68],
  sand: [150, 128, 98],
  clay: [118, 84, 66],
  deep: [82, 64, 56],
};

const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const mixRgb = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

class NestRenderer {
  constructor() {
    this.agents = [];
    this.view = { s: 1, ox: 0, oy: 0 };
    this.cam = { x: 0, y: 0, zoom: 1, min: 0.3, max: 3 }; // x/y: nest point at the area's top-left
    this.area = { x: 0, y: 0, w: 1, h: 1 };
    this.camReady = false;
    this.piles = new Map();
    this.gardens = new Map();
    this.mounds = new Map();
    this.cavState = new Map(); // chamber id -> what the cavity layer last showed of it
    this.cavT = 0;
    this.cavVersion = 0;
    this.work = [0, 1, 2].map(() => document.createElement('canvas'));
  }

  build(nest, seed) {
    this.nest = nest;
    this.seed = seed;
    this.soil = this.makeSoil(nest, seed);
    this.grass = this.makeGrass(nest, seed);
    this.wallTile = this.makeWallTile(seed);
    this.cloud = this.makeCloud();
    const rng = mulberry32(seed ^ 0x5ca1);
    this.stars = Array.from({ length: 70 }, () => ({ x: rng() * nest.W, y: -60 + rng() * (nest.surfaceY - 30), r: 0.6 + rng() * 1.1, ph: rng() * TAU }));
    this.clouds = Array.from({ length: 5 }, (_, i) => ({ x: (i / 5) * (nest.W + 600) + rng() * 200, y: -30 + rng() * 60, s: 0.6 + rng() * 0.6, v: 3 + rng() * 4 }));
    this.cav = document.createElement('canvas');
    this.cav.width = Math.ceil(nest.W * CS);
    this.cav.height = Math.ceil(nest.H * CS);
    this.light = document.createElement('canvas');
    this.light.width = Math.ceil(nest.W / LIGHT_Q);
    this.light.height = Math.ceil((nest.H - nest.surfaceY) / LIGHT_Q);
    this.lightKey = '';
    this.cavState.clear();
    this.syncCavities(0, true);
    this.agents = [];
    this.piles.clear();
    this.gardens.clear();
    this.mounds.clear();
    this.camReady = false;
  }

  // ---------- camera ----------

  layout(x, y, w, h) {
    this.area = { x, y, w, h };
    if (!this.camReady) this.resetCamera();
    this.clampCam();
  }

  // Start on the entrance at a zoom that shows the starting chambers comfortably.
  resetCamera() {
    const a = this.area, n = this.nest, c = this.cam;
    c.min = Math.min(a.w / n.W, a.h / n.H) * 0.95;
    c.zoom = clamp(Math.min(a.w / 1100, a.h / 640), c.min, c.max);
    c.x = n.chambers[0].x - a.w / 2 / c.zoom;
    c.y = 0;
    this.camReady = true;
  }

  clampCam() {
    const a = this.area, n = this.nest, c = this.cam;
    c.zoom = clamp(c.zoom, c.min, c.max);
    const vw = a.w / c.zoom, vh = a.h / c.zoom;
    c.x = vw >= n.W ? (n.W - vw) / 2 : clamp(c.x, -20, n.W - vw + 20);
    c.y = vh >= n.H ? (n.H - vh) / 2 : clamp(c.y, -60, n.H - vh + 20);
    this.view = { s: c.zoom, ox: a.x - c.x * c.zoom, oy: a.y - c.y * c.zoom };
  }

  pan(dx, dy) {
    this.cam.x -= dx / this.cam.zoom;
    this.cam.y -= dy / this.cam.zoom;
    this.clampCam();
  }

  zoomAt(sx, sy, factor) {
    const before = this.toNest(sx, sy), c = this.cam;
    c.zoom = clamp(c.zoom * factor, c.min, c.max);
    c.x = before.x - (sx - this.area.x) / c.zoom;
    c.y = before.y - (sy - this.area.y) / c.zoom;
    this.clampCam();
  }

  toNest(sx, sy) {
    const v = this.view;
    return { x: (sx - v.ox) / v.s, y: (sy - v.oy) / v.s };
  }

  // ---------- baked layers ----------

  // Layered soil: dark humus under the grass, loam with sand lenses, then clay; pebbles and roots.
  makeSoil(n, seed) {
    const noise = makeNoise2D(seed ^ 0xa11);
    const rng = mulberry32(seed ^ 0xbeef);
    const R = (a, b) => a + rng() * (b - a);
    const L = SOIL_LAYERS, q = 2;
    const lw = Math.ceil(n.W / q), lh = Math.ceil(n.H / q);
    const low = document.createElement('canvas');
    low.width = lw;
    low.height = lh;
    const lctx = low.getContext('2d');
    const img = lctx.createImageData(lw, lh);
    const depthSpan = n.H - n.surfaceY;
    for (let x = 0; x < lw; x++) {
      const xx = x * q;
      // Wavy boundaries between the layers, as a share of the depth.
      const b1 = 0.05 + (noise(xx * 0.006, 1.7) - 0.5) * 0.05;
      const b2 = 0.42 + (noise(xx * 0.0035, 5.3) - 0.5) * 0.2 + (noise(xx * 0.02, 9.1) - 0.5) * 0.03;
      const b3 = 0.76 + (noise(xx * 0.003, 13.9) - 0.5) * 0.16;
      for (let y = 0; y < lh; y++) {
        const yy = y * q, d = (yy - n.surfaceY) / depthSpan;
        let c = mixRgb(L.humus, L.loam, smooth(b1 - 0.02, b1 + 0.03, d));
        c = mixRgb(c, L.clay, smooth(b2 - 0.03, b2 + 0.03, d));
        c = mixRgb(c, L.deep, smooth(b3 - 0.06, b3 + 0.06, d));
        const lens = clamp((noise.fbm(xx * 0.004 + 30, yy * 0.012 + 30, 3) - 0.6) * 7, 0, 1);
        c = mixRgb(c, L.sand, lens * 0.75 * smooth(b1, b1 + 0.04, d) * (1 - smooth(b2 - 0.04, b2, d)));
        const streak = noise(xx * 0.008, yy * 0.09) - 0.5;
        const mottle = noise.fbm(xx * 0.015, yy * 0.015, 3) - 0.5;
        const f = 1 + streak * 0.1 + mottle * 0.14;
        const i = (y * lw + x) * 4;
        img.data[i] = c[0] * f;
        img.data[i + 1] = c[1] * f;
        img.data[i + 2] = c[2] * f;
        img.data[i + 3] = 255;
      }
    }
    lctx.putImageData(img, 0, 0);

    const c = document.createElement('canvas');
    c.width = n.W * NS;
    c.height = n.H * NS;
    const ctx = c.getContext('2d');
    ctx.drawImage(low, 0, 0, c.width, c.height);
    ctx.scale(NS, NS);
    const k = (n.W * n.H) / (1000 * 640);
    // Grain.
    for (let i = 0; i < 36000 * k; i++) {
      const light = rng() < 0.45;
      ctx.fillStyle = light ? `rgba(225,205,175,${R(0.08, 0.26)})` : `rgba(14,10,8,${R(0.15, 0.4)})`;
      const s = R(0.35, 1.2);
      ctx.fillRect(R(0, n.W), R(n.surfaceY, n.H), s, s);
    }
    // Gravel and pebbles: irregular stones, lit from the top left, sitting in the soil.
    const stone = (x, y, r) => {
      const pts = [], m = 7 + Math.floor(rng() * 3), rot = R(0, TAU), flat = R(0.55, 0.85);
      for (let j = 0; j < m; j++) {
        const a = rot + (j / m) * TAU, rr = r * R(0.75, 1.15);
        pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * flat]);
      }
      const path = () => {
        ctx.beginPath();
        pts.forEach(([px, py], j) => (j ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
        ctx.closePath();
      };
      const tone = [[132, 126, 116], [150, 122, 84], [126, 90, 70], [110, 106, 100]][Math.floor(rng() * 4)];
      const v = R(-18, 18);
      ctx.save();
      ctx.translate(0.6, r * 0.25);
      path();
      ctx.fillStyle = 'rgba(15,8,3,0.4)';
      ctx.fill();
      ctx.restore();
      path();
      const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
      g.addColorStop(0, `rgb(${tone[0] + 40 + v | 0},${tone[1] + 36 + v | 0},${tone[2] + 30 + v | 0})`);
      g.addColorStop(1, `rgb(${tone[0] - 30 + v | 0},${tone[1] - 30 + v | 0},${tone[2] - 28 + v | 0})`);
      ctx.fillStyle = g;
      ctx.fill();
    };
    for (let i = 0; i < 900 * k; i++) {
      ctx.fillStyle = rng() < 0.5 ? `rgba(190,170,140,${R(0.25, 0.5)})` : `rgba(60,45,35,${R(0.3, 0.6)})`;
      ctx.beginPath();
      ctx.arc(R(0, n.W), R(n.surfaceY + 8, n.H), R(0.6, 1.6), 0, TAU);
      ctx.fill();
    }
    for (let i = 0; i < 150 * k; i++) {
      const y = R(n.surfaceY + 14, n.H);
      stone(R(0, n.W), y, 2 + Math.pow(rng(), 2.2) * 10 * (0.6 + (y / n.H) * 0.6));
    }
    // Roots hanging from the surface.
    ctx.lineCap = 'round';
    for (let i = 0; i < (16 * n.W) / 1000; i++) {
      let x = R(20, n.W - 20), y = n.surfaceY, a = Math.PI / 2 + R(-0.3, 0.3);
      const wdt = R(1.6, 4), len = R(60, 200);
      ctx.strokeStyle = `rgba(${R(140, 175) | 0},${R(104, 128) | 0},${R(66, 84) | 0},0.7)`;
      for (let s = 0; s < len; s += 4) {
        const nx = x + Math.cos(a) * 4, ny = y + Math.sin(a) * 4;
        ctx.lineWidth = wdt * (1 - s / len) + 0.35;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(nx, ny);
        ctx.stroke();
        x = nx;
        y = ny;
        a += R(-0.25, 0.25);
        if (rng() < 0.06) {
          let bx = x, by = y, ba = a + R(-1, 1);
          for (let b = 0; b < 34; b += 3) {
            const qx = bx + Math.cos(ba) * 3, qy = by + Math.sin(ba) * 3;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(bx, by);
            ctx.lineTo(qx, qy);
            ctx.stroke();
            bx = qx;
            by = qy;
            ba += R(-0.3, 0.3);
          }
        }
      }
    }
    return c;
  }

  // Grass blades along the surface, in two layers; the ground around the entrance is bare.
  makeGrass(n, seed) {
    const rng = mulberry32(seed ^ 0x6a55);
    const c = document.createElement('canvas');
    c.width = n.W * NS;
    c.height = 60 * NS;
    const ctx = c.getContext('2d');
    ctx.scale(NS, NS);
    const base = 46, ex = n.chambers[0].x;
    ctx.lineCap = 'round';
    for (const back of [true, false]) {
      for (let i = 0; i < (800 * n.W) / 1000; i++) {
        const x = rng() * n.W, near = Math.abs(x - ex);
        if (near < 52) continue;
        const h = (back ? 10 + rng() * 30 : 5 + rng() * 22) * Math.min(1, (near - 52) / 70 + 0.3), lean = (rng() - 0.5) * 12;
        ctx.strokeStyle = back ? `hsl(${90 + rng() * 25},${30 + rng() * 20}%,${15 + rng() * 10}%)` : `hsl(${80 + rng() * 35},${40 + rng() * 25}%,${26 + rng() * 18}%)`;
        ctx.lineWidth = 0.8 + rng() * 1.3;
        ctx.beginPath();
        ctx.moveTo(x, base + 3);
        ctx.quadraticCurveTo(x + lean * 0.3, base - h * 0.6, x + lean, base - h);
        ctx.stroke();
      }
    }
    // A few small flowers and clover heads.
    for (let i = 0; i < (26 * n.W) / 1000; i++) {
      const x = rng() * n.W;
      if (Math.abs(x - ex) < 110) continue;
      const h = 12 + rng() * 18, y = base - h;
      ctx.strokeStyle = 'hsl(100,35%,28%)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(x, base + 2);
      ctx.lineTo(x + (rng() - 0.5) * 4, y);
      ctx.stroke();
      ctx.fillStyle = ['#f4efe0', '#f2d35b', '#e7a6c8', '#f4efe0'][Math.floor(rng() * 4)];
      for (let p = 0; p < 5; p++) {
        ctx.beginPath();
        ctx.arc(x + Math.cos((p / 5) * TAU) * 1.6, y + Math.sin((p / 5) * TAU) * 1.6, 1.3, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = '#d9a43a';
      ctx.beginPath();
      ctx.arc(x, y, 0.9, 0, TAU);
      ctx.fill();
    }
    return c;
  }

  // Back-wall texture of the tunnels: fine grain and the scrape marks of mandibles.
  makeWallTile(seed) {
    const rng = mulberry32(seed ^ 0x3a11), S = 128;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = rng() < 0.5 ? `rgba(255,225,180,${0.04 + rng() * 0.08})` : `rgba(30,15,5,${0.06 + rng() * 0.12})`;
      ctx.fillRect(rng() * S, rng() * S, 1 + rng() * 2, 1 + rng() * 2);
    }
    ctx.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      const x = rng() * S, y = rng() * S, len = 6 + rng() * 10, a = (rng() - 0.5) * 0.8;
      ctx.strokeStyle = `rgba(40,22,10,${0.1 + rng() * 0.1})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, len, a - 0.5, a + 0.5);
      ctx.stroke();
    }
    return c;
  }

  makeCloud() {
    const c = document.createElement('canvas');
    c.width = 260;
    c.height = 90;
    const ctx = c.getContext('2d');
    for (const [x, y, r] of [[60, 58, 30], [100, 42, 38], [150, 48, 34], [190, 60, 26], [125, 64, 30], [80, 66, 22]]) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(0.6, 'rgba(255,255,255,0.6)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    return c;
  }

  // The heap of dug-out soil over the entrance grows with the nest.
  moundSprite(level) {
    let m = this.mounds.get(level);
    if (m) return m;
    const MS = 3, W = 110 + level * 10, H = 22 + level * 2.6;
    const c = document.createElement('canvas');
    c.width = Math.ceil((W + 16) * MS);
    c.height = Math.ceil((H + 12) * MS);
    const ctx = c.getContext('2d');
    ctx.scale(MS, MS);
    ctx.translate((W + 16) / 2, H + 8);
    const rng = mulberry32(7 + level * 131);
    const crater = (x) => 5 * Math.exp(-((x / 7) ** 2));
    const top = (x) => -H * Math.pow(Math.max(0, 1 - ((2 * x) / W) ** 2), 1.1) - Math.sin(x * 0.35 + level) * 0.8 + crater(x);
    ctx.beginPath();
    ctx.moveTo(-W / 2 - 6, 4);
    for (let x = -W / 2 - 6; x <= W / 2 + 6; x += 2) ctx.lineTo(x, Math.min(4, top(x) + 3));
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -H, 0, 4);
    g.addColorStop(0, '#a87e52');
    g.addColorStop(1, '#6e4e31');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.save();
    ctx.clip();
    for (let i = 0; i < 260 + level * 40; i++) {
      const x = (rng() - 0.5) * W, y = top(x) + 3 + rng() * (H + 4);
      const v = 90 + rng() * 90;
      ctx.fillStyle = `rgba(${v | 0},${(v * 0.74) | 0},${(v * 0.48) | 0},${0.5 + rng() * 0.5})`;
      ctx.beginPath();
      ctx.arc(x, y, 0.5 + rng() * 1.4, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    // The entrance: a dark opening in the crater at the top.
    const hole = ctx.createRadialGradient(0, -H + 5, 0, 0, -H + 5, 7);
    hole.addColorStop(0, '#080402');
    hole.addColorStop(0.7, '#1e1209');
    hole.addColorStop(1, 'rgba(40,25,12,0)');
    ctx.fillStyle = hole;
    ctx.beginPath();
    ctx.ellipse(0, -H + 5.5, 7.5, 3.4, 0, 0, TAU);
    ctx.fill();
    m = { canvas: c, W: W + 16, H: H + 12, top: -H - 8, height: H };
    this.mounds.set(level, m);
    return m;
  }

  // ---------- chamber and tunnel shapes ----------

  // Organic outline: an arched ceiling and a flattened floor with a slight wobble, scaled by k while dug.
  outline(c, k = 1) {
    const pts = [], N = 44, s = c.seed || 0;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU, sn = Math.sin(a);
      let wob = 0.05 * Math.sin(2 * a + s) + 0.035 * Math.sin(3 * a + s * 1.7) + 0.02 * Math.sin(5 * a + s * 2.3);
      if (sn > 0) wob *= 0.35;
      const y = sn < 0 ? -CEIL * Math.pow(-sn, CEIL_EXP) : FLOOR * Math.pow(sn, FLOOR_EXP);
      pts.push(c.x + Math.cos(a) * c.rx * k * (1 + wob), c.y + y * c.ry * k * (1 + wob));
    }
    return pts;
  }

  tracePath(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath();
  }

  // Height of a chamber's floor at x (ignoring the slight wobble of its outline).
  floorY(c, x) {
    const u = clamp((x - c.x) / c.rx, -0.97, 0.97);
    return c.y + c.ry * FLOOR * Math.pow(1 - u * u, FLOOR_EXP / 2);
  }

  // A tunnel of uneven width along its curve, dug up to share t.
  strokeTunnel(ctx, c, t) {
    const T = c.tunnel, s = c.seed || 0, steps = Math.max(6, Math.ceil(T.len / 10));
    let prev = { x: T.x1, y: T.y1 };
    for (let i = 1; i <= steps; i++) {
      const u = Math.min(t, i / steps), p = bezierPoint(u, T.x1, T.y1, T.cx, T.cy, T.x2, T.y2);
      ctx.lineWidth = TUNNEL_W * (1 + 0.14 * Math.sin(u * 9 + s) + 0.07 * Math.sin(u * 23 + s * 3));
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      prev = p;
      if (u >= t) break;
    }
  }

  cavityBox(c, st) {
    if (st.tunnel <= 0) return null;
    const T = c.tunnel, w = TUNNEL_W;
    const box = { x0: Math.min(T.x1, T.cx, T.x2) - w, y0: Math.min(T.y1, T.cy, T.y2) - w, x1: Math.max(T.x1, T.cx, T.x2) + w, y1: Math.max(T.y1, T.cy, T.y2) + w };
    if (st.chamber > 0) {
      box.x0 = Math.min(box.x0, c.x - c.rx * 1.12);
      box.x1 = Math.max(box.x1, c.x + c.rx * 1.12);
      box.y0 = Math.min(box.y0, c.y - c.ry * 1.12);
      box.y1 = Math.max(box.y1, c.y + c.ry * 1.12);
    }
    return box;
  }

  // Redraw the parts of the cavity layer whose chambers or tunnels changed since last time.
  // A running dig refreshes a few times a second.
  syncCavities(dt, force) {
    const n = this.nest;
    this.cavT -= dt;
    let box = null;
    const grow = (b) => {
      if (!b) return;
      if (!box) box = { ...b };
      else {
        box.x0 = Math.min(box.x0, b.x0);
        box.y0 = Math.min(box.y0, b.y0);
        box.x1 = Math.max(box.x1, b.x1);
        box.y1 = Math.max(box.y1, b.y1);
      }
    };
    const seen = new Set();
    for (const c of n.chambers) {
      if (c.type === 'entrance') continue;
      seen.add(c.id);
      const st = n.digState(c), old = this.cavState.get(c.id);
      if (old && old.t === st.tunnel && old.c === st.chamber) continue;
      const step = old ? Math.abs(st.tunnel - old.t) + Math.abs(st.chamber - old.c) : 1;
      if (!force && old && step < 0.06 && this.cavT > 0 && !(c.built && !old.built)) continue;
      const nb = this.cavityBox(c, st);
      grow(old && old.box);
      grow(nb);
      this.cavState.set(c.id, { t: st.tunnel, c: st.chamber, built: c.built, box: nb });
    }
    for (const [id, s] of this.cavState) {
      if (seen.has(id)) continue;
      grow(s.box);
      this.cavState.delete(id);
    }
    if (box) {
      this.redrawCavities(box);
      this.cavT = 0.25;
      this.cavVersion++;
    }
  }

  workCanvas(i, w, h) {
    const c = this.work[i];
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = ctx.shadowOffsetY = 0;
    ctx.clearRect(0, 0, w, h);
    return ctx;
  }

  // Paint chambers and tunnels inside box (nest units) into the cavity layer: a soft dark halo in the
  // soil, a packed rim, then the lit hollow with a shaded ceiling and a worn floor.
  redrawCavities(box) {
    const n = this.nest, E = 24;
    const x0 = Math.max(0, Math.floor(box.x0 - E)), y0 = Math.max(0, Math.floor(box.y0 - E));
    const x1 = Math.min(n.W, Math.ceil(box.x1 + E)), y1 = Math.min(n.H, Math.ceil(box.y1 + E));
    if (x1 <= x0 || y1 <= y0) return;
    if (x1 - x0 > CAV_TILE || y1 - y0 > CAV_TILE) {
      for (let ty = y0; ty < y1; ty += CAV_TILE) {
        for (let tx = x0; tx < x1; tx += CAV_TILE) {
          this.redrawCavities({ x0: tx + E, y0: ty + E, x1: Math.min(x1, tx + CAV_TILE) - E, y1: Math.min(y1, ty + CAV_TILE) - E });
        }
      }
      return;
    }
    const ex0 = x0 - CAV_PAD, ey0 = y0 - CAV_PAD;
    const w = Math.ceil((x1 - x0 + 2 * CAV_PAD) * CS), h = Math.ceil((y1 - y0 + 2 * CAV_PAD) * CS);
    const OFF = w + h + 100; // shadows are cast from copies drawn this far off-canvas

    // Mask of every hollow.
    const m = this.workCanvas(0, w, h), M = this.work[0];
    m.setTransform(CS, 0, 0, CS, -ex0 * CS, -ey0 * CS);
    m.fillStyle = m.strokeStyle = '#fff';
    m.lineCap = m.lineJoin = 'round';
    const lit = [];
    for (const c of n.chambers) {
      if (c.type === 'entrance') continue;
      const st = n.digState(c);
      if (st.tunnel > 0) this.strokeTunnel(m, c, st.tunnel);
    }
    for (const c of n.chambers) {
      if (c.type === 'entrance') continue;
      const st = n.digState(c);
      if (st.chamber <= 0) continue;
      const k = c.built ? 1 : Math.sqrt(st.chamber);
      this.tracePath(m, this.outline(c, k));
      m.fill();
      lit.push([c, k]);
    }

    // The hollow itself: back wall, warm light from each chamber, ceiling shade, worn floor, soft edges.
    const t = this.workCanvas(1, w, h), T = this.work[1];
    t.setTransform(CS, 0, 0, CS, -ex0 * CS, -ey0 * CS);
    t.fillStyle = '#6c4b2e';
    t.fillRect(ex0, ey0, w / CS, h / CS);
    const pat = t.createPattern(this.wallTile, 'repeat');
    if (pat.setTransform) pat.setTransform(new DOMMatrix().scale(1 / CS));
    t.fillStyle = pat;
    t.fillRect(ex0, ey0, w / CS, h / CS);
    for (const [c, k] of lit) {
      const r = Math.max(c.rx, c.ry) * 1.2 * k, gy = c.y + c.ry * 0.45 * k;
      const g = t.createRadialGradient(c.x, gy, 0, c.x, gy, r);
      g.addColorStop(0, 'rgba(255,208,145,0.5)');
      g.addColorStop(0.55, 'rgba(255,190,120,0.2)');
      g.addColorStop(1, 'rgba(255,190,120,0)');
      t.fillStyle = g;
      t.fillRect(c.x - r, gy - r, r * 2, r * 2);
    }
    t.setTransform(1, 0, 0, 1, 0, 0);
    t.globalCompositeOperation = 'destination-in';
    t.drawImage(M, 0, 0);
    t.globalCompositeOperation = 'source-atop';
    const band = (dy, color) => {
      const b = this.workCanvas(2, w, h);
      b.drawImage(M, 0, 0);
      b.globalCompositeOperation = 'destination-out';
      b.drawImage(M, 0, dy * CS);
      b.globalCompositeOperation = 'source-in';
      b.fillStyle = color;
      b.fillRect(0, 0, w, h);
      t.drawImage(this.work[2], 0, 0);
    };
    band(-3.5, 'rgba(214,170,112,0.45)');
    band(-1.5, 'rgba(240,202,146,0.4)');
    const o = this.workCanvas(2, w, h);
    o.fillRect(0, 0, w, h);
    o.globalCompositeOperation = 'destination-out';
    o.drawImage(M, 0, 0);
    t.shadowOffsetX = OFF;
    t.shadowColor = 'rgba(22,10,3,0.85)';
    t.shadowBlur = 7 * CS;
    t.shadowOffsetY = 6 * CS;
    t.drawImage(this.work[2], -OFF, 0);
    t.shadowColor = 'rgba(22,10,3,0.55)';
    t.shadowBlur = 3 * CS;
    t.shadowOffsetY = 0;
    t.drawImage(this.work[2], -OFF, 0);
    t.shadowColor = 'transparent';
    t.shadowBlur = t.shadowOffsetX = 0;

    // Into the cavity layer, only within the region: halo, rim, hollow.
    const l = this.cav.getContext('2d');
    const lx = x0 * CS, ly = y0 * CS, ox = ex0 * CS, oy = ey0 * CS;
    l.save();
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.beginPath();
    l.rect(lx, ly, (x1 - x0) * CS, (y1 - y0) * CS);
    l.clip();
    l.clearRect(lx, ly, (x1 - x0) * CS, (y1 - y0) * CS);
    l.shadowOffsetX = OFF;
    l.shadowColor = 'rgba(232,190,135,0.28)';
    l.shadowBlur = 1.5 * CS;
    l.shadowOffsetY = 2 * CS;
    l.drawImage(M, ox - OFF, oy);
    l.shadowOffsetY = 0;
    l.shadowColor = 'rgba(16,8,3,0.5)';
    l.shadowBlur = 4 * CS;
    l.drawImage(M, ox - OFF, oy);
    l.shadowColor = 'rgba(34,19,8,0.95)';
    l.shadowBlur = 1.2 * CS;
    l.drawImage(M, ox - OFF, oy);
    l.shadowColor = 'transparent';
    l.shadowBlur = l.shadowOffsetX = 0;
    l.drawImage(T, ox, oy);
    l.restore();
  }

  // Soil darkens away from the chambers, and more outside the diggable area.
  updateLight() {
    const n = this.nest, z = n.zone, key = `${this.cavVersion}|${z.x0}|${z.x1}|${z.y1}`;
    if (key === this.lightKey) return;
    this.lightKey = key;
    const L = this.light, g = L.getContext('2d'), top = n.surfaceY;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, L.width, L.height);
    g.fillStyle = `rgba(${DARK_RGB},${OUT_DARK})`;
    g.fillRect(0, 0, L.width, L.height);
    g.setTransform(1 / LIGHT_Q, 0, 0, 1 / LIGHT_Q, 0, -top / LIGHT_Q);
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = `rgba(0,0,0,${1 - IN_DARK / OUT_DARK})`;
    g.fillRect(z.x0, top - 20, z.x1 - z.x0, z.y1 - top + 20);
    const pool = (x, y, r, a) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(0,0,0,${a})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    };
    for (const c of n.chambers) {
      if (c.type === 'entrance') continue;
      const st = n.digState(c), T = c.tunnel;
      if (st.tunnel <= 0) continue;
      for (let i = 1; i <= 4; i++) {
        const p = bezierPoint((i / 4) * st.tunnel, T.x1, T.y1, T.cx, T.cy, T.x2, T.y2);
        pool(p.x, p.y, 55, 0.22);
      }
      if (st.chamber > 0) pool(c.x, c.y, Math.max(c.rx, c.ry) * 2.4, 0.5);
    }
  }

  // ---------- agents: purely visual workers walking the tunnels ----------

  syncAgents(count) {
    const n = this.nest;
    const built = n.chambers.filter((c) => c.built && c.type !== 'entrance');
    while (this.agents.length < count && built.length) {
      const c = pick(built);
      this.agents.push({ x: c.x + rand(-c.rx, c.rx) * 0.5, y: c.y + c.ry * 0.4, a: rand(0, TAU), node: c.id, path: null, pi: 0, wait: rand(0, 3), anim: rand(0, 4), dig: false });
    }
    if (this.agents.length > count) this.agents.length = count;
  }

  floorPoint(c) {
    const x = c.x + rand(-0.65, 0.65) * c.rx;
    return { x, y: this.floorY(c, x) - rand(3, 9) };
  }

  planAgent(ag) {
    const n = this.nest;
    if (!n.get(ag.node)) ag.node = n.chambers.find((c) => c.type === 'queen').id;
    const job = n.job;
    const built = n.chambers.filter((c) => c.built && c.type !== 'entrance');
    let pts;
    ag.dig = false;
    if (job && n.get(job.parent)?.built && Math.random() < 0.5) {
      pts = n.route(ag.node, job.parent);
      const st = n.digState(job), t = job.tunnel;
      for (let i = 0; i <= 10; i++) pts.push(bezierPoint((i / 10) * st.tunnel, t.x1, t.y1, t.cx, t.cy, t.x2, t.y2));
      ag.node = st.tunnel >= 1 ? job.id : job.parent;
      ag.dig = true;
    } else {
      const target = pick(built);
      pts = n.route(ag.node, target.id);
      pts.push(this.floorPoint(target));
      ag.node = target.id;
    }
    ag.path = pts;
    ag.pi = 0;
  }

  updateAgents(dt) {
    const n = this.nest;
    for (const ag of this.agents) {
      if (ag.path) {
        const p = ag.path[ag.pi];
        if (!p) {
          ag.path = null;
          ag.wait = ag.dig ? rand(3, 7) : rand(1.5, 6);
          continue;
        }
        const dx = p.x - ag.x, dy = p.y - ag.y, d = Math.hypot(dx, dy);
        const step = 42 * dt;
        if (d <= step) {
          ag.x = p.x;
          ag.y = p.y;
          ag.pi++;
        } else {
          ag.a = turnTowards(ag.a, Math.atan2(dy, dx), 10 * dt);
          ag.x += (dx / d) * step;
          ag.y += (dy / d) * step;
          ag.anim += step * 0.35;
        }
      } else if (ag.wait > 0) {
        ag.wait -= dt;
        if (ag.dig) {
          ag.anim += dt * 6;
          ag.a += Math.sin(ag.anim * 3) * dt * 2;
        } else if (Math.random() < dt * 0.6) {
          const c = n.get(ag.node);
          if (c && c.built && c.type !== 'entrance') ag.path = [this.floorPoint(c)];
          ag.pi = 0;
        }
      } else {
        this.planAgent(ag);
      }
    }
  }

  // ---------- frame ----------

  render(ctx, g, dt) {
    const n = this.nest, col = g.world.player, v = this.view, dpr = g.dpr;
    this.updateAgents(dt);
    this.syncAgents(Math.min(45, col.counts.inside));
    this.syncCavities(dt, false);
    this.updateLight();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#140e09';
    ctx.fillRect(0, 0, g.canvas.width, g.canvas.height);
    ctx.setTransform(v.s * dpr, 0, 0, v.s * dpr, v.ox * dpr, v.oy * dpr);
    // What the screen shows, in nest units: sky and soil extend past the nest so wide screens have no bands.
    const vis = { left: -v.ox / v.s - 2, right: (g.vw - v.ox) / v.s + 2, top: -v.oy / v.s - 2, bottom: (g.vh - v.oy) / v.s + 2 };

    this.drawSky(ctx, g, n, vis);
    this.drawSoil(ctx, n, vis);
    // Only below the surface: the entrance shaft through the mound is drawn with the mound.
    const top = n.surfaceY;
    ctx.drawImage(this.cav, 0, top * CS, n.W * CS, (n.H - top) * CS, 0, top, n.W, n.H - top);
    this.drawPlanned(ctx, n);
    this.drawSurface(ctx, n, vis, g.world.dayInfo());
    this.drawZoneEdge(ctx, n, g);

    this.drawStores(ctx, n, col);
    this.drawBrood(ctx, n, col, g.world.time);
    this.drawResidents(ctx, n, col, g.world.time);
    for (const ag of this.agents) Sprites.draw(ctx, 'player', 'worker', (ag.anim | 0) & 3, ag.x, ag.y, ag.a, ANT_SCALE);
    if (g.hoverChamber && !g.buildType) {
      ctx.strokeStyle = 'rgba(255,230,170,0.75)';
      ctx.lineWidth = 1.6 / v.s;
      this.tracePath(ctx, this.outline(g.hoverChamber, 1.08));
      ctx.stroke();
    }
    if (g.buildType && g.mouseNest && (g.hover || g.pendingPlace)) this.drawGhost(ctx, n, g);
    this.drawLabels(ctx, n, g);
  }

  drawSky(ctx, g, n, vis) {
    const w = g.world, day = w.dayInfo(), top = vis.top, sy = n.surfaceY;
    const mix = (a, b) => `rgb(${a.map((x, i) => Math.round(lerp(b[i], x, day.light))).join(',')})`;
    const sky = ctx.createLinearGradient(0, top, 0, sy);
    sky.addColorStop(0, mix([96, 156, 214], [7, 12, 32]));
    sky.addColorStop(1, mix([206, 226, 232], [30, 40, 70]));
    ctx.fillStyle = sky;
    if (top < sy) ctx.fillRect(vis.left, top, vis.right - vis.left, sy - top + 2);

    if (day.night > 0.05) {
      for (const s of this.stars) {
        ctx.fillStyle = `rgba(235,240,255,${day.night * (0.55 + 0.45 * Math.sin(w.time * 1.3 + s.ph))})`;
        ctx.fillRect(s.x, s.y, s.r, s.r);
      }
    }
    const f = (w.time / CFG.DAY_LENGTH + 0.3) % 1;
    const sx = ((f + 0.75) % 1) * n.W;
    if (day.light > 0.05) {
      const glow = ctx.createRadialGradient(sx, 30 + (1 - day.light) * 50, 0, sx, 30 + (1 - day.light) * 50, 46);
      glow.addColorStop(0, `rgba(255,240,190,${0.5 * day.light})`);
      glow.addColorStop(1, 'rgba(255,240,190,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(sx - 46, -46 + 30 + (1 - day.light) * 50, 92, 92);
      ctx.fillStyle = `rgba(255,238,175,${day.light})`;
      ctx.beginPath();
      ctx.arc(sx, 30 + (1 - day.light) * 50, 13, 0, TAU);
      ctx.fill();
    } else {
      const mx = (sx + n.W / 2) % n.W;
      ctx.fillStyle = 'rgba(232,236,255,0.92)';
      ctx.beginPath();
      ctx.arc(mx, 34, 10, 0, TAU);
      ctx.fill();
      ctx.fillStyle = mix([96, 156, 214], [7, 12, 32]);
      ctx.beginPath();
      ctx.arc(mx + 4, 31, 8.5, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 0.1 + 0.75 * day.light;
    for (const c of this.clouds) {
      const span = n.W + 600, x = ((c.x + w.time * c.v) % span) - 300;
      ctx.drawImage(this.cloud, x, c.y, 130 * c.s, 45 * c.s);
    }
    ctx.globalAlpha = 1;
    if (w.rain > 0) {
      ctx.fillStyle = 'rgba(70,80,100,0.5)';
      ctx.fillRect(vis.left, top, vis.right - vis.left, sy - top);
      ctx.strokeStyle = 'rgba(190,210,240,0.45)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (let i = 0; i < 90; i++) {
        const x = vis.left + ((i * 97.3 + w.time * 40) % (vis.right - vis.left + 40)), y = top + ((i * 53.7 + w.time * 260) % (sy - top));
        ctx.moveTo(x, y);
        ctx.lineTo(x - 3, y + 10);
      }
      ctx.stroke();
    }
  }

  drawSoil(ctx, n, vis) {
    // The soil, plus mirrored copies to the sides so wide screens have no flat bands.
    const sy = n.surfaceY * NS, sh = (n.H - n.surfaceY) * NS, top = n.surfaceY, h = n.H - top;
    ctx.fillStyle = '#3a2e27';
    ctx.fillRect(vis.left, top, vis.right - vis.left, vis.bottom - top);
    ctx.drawImage(this.soil, 0, sy, n.W * NS, sh, 0, top, n.W, h);
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(this.soil, 0, sy, n.W * NS, sh, 0, top, n.W, h);
    ctx.drawImage(this.soil, 0, sy, n.W * NS, sh, -2 * n.W, top, n.W, h);
    ctx.restore();
    ctx.drawImage(this.light, 0, top, n.W, h);
    ctx.fillStyle = `rgba(${DARK_RGB},${OUT_DARK})`;
    if (vis.left < 0) ctx.fillRect(vis.left, top, -vis.left, vis.bottom - top);
    if (vis.right > n.W) ctx.fillRect(n.W, top, vis.right - n.W, vis.bottom - top);
    if (vis.bottom > n.H) ctx.fillRect(0, n.H, n.W, vis.bottom - n.H);
  }

  // Grass along the surface and the heap of dug-out soil over the entrance.
  drawSurface(ctx, n, vis, day) {
    for (let gx = Math.floor(vis.left / n.W) * n.W; gx < vis.right; gx += n.W) {
      ctx.drawImage(this.grass, gx, n.surfaceY - 46, n.W, 60);
    }
    const e = n.chambers[0], built = n.chambers.filter((c) => c.built && c.type !== 'entrance').length;
    const m = this.moundSprite(Math.min(10, Math.max(0, built - 2)));
    ctx.drawImage(m.canvas, e.x - m.W / 2, n.surfaceY - m.H + 4, m.W, m.H);
    if (day.night > 0.02) {
      const tint = ctx.createLinearGradient(0, n.surfaceY - 50, 0, n.surfaceY - 20);
      tint.addColorStop(0, 'rgba(8,14,40,0)');
      tint.addColorStop(1, `rgba(8,14,40,${day.night * 0.55})`);
      ctx.fillStyle = tint;
      ctx.fillRect(vis.left, n.surfaceY - 50, vis.right - vis.left, 54);
    }
  }

  // Chambers ordered but not dug yet: a dashed outline and the planned tunnel.
  drawPlanned(ctx, n) {
    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 1.4;
    for (const c of n.chambers) {
      if (c.built || c.type === 'entrance') continue;
      const st = n.digState(c);
      ctx.strokeStyle = 'rgba(255,225,170,0.5)';
      this.tracePath(ctx, this.outline(c));
      ctx.stroke();
      if (st.tunnel < 1) {
        const T = c.tunnel;
        ctx.strokeStyle = 'rgba(255,225,170,0.3)';
        ctx.beginPath();
        const p = bezierPoint(st.tunnel, T.x1, T.y1, T.cx, T.cy, T.x2, T.y2);
        ctx.moveTo(p.x, p.y);
        for (let i = 1; i <= 12; i++) {
          const q = bezierPoint(st.tunnel + ((1 - st.tunnel) * i) / 12, T.x1, T.y1, T.cx, T.cy, T.x2, T.y2);
          ctx.lineTo(q.x, q.y);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // The diggable area: a dashed border, brighter while placing a chamber.
  drawZoneEdge(ctx, n, g) {
    const z = n.zone;
    if (z.last) return;
    ctx.save();
    ctx.setLineDash([8, 7]);
    ctx.strokeStyle = `rgba(255,220,170,${g.buildType ? 0.55 : 0.2})`;
    ctx.lineWidth = 1.5 / this.view.s;
    ctx.beginPath();
    ctx.moveTo(z.x0, n.surfaceY + 6);
    ctx.lineTo(z.x0, z.y1);
    ctx.lineTo(z.x1, z.y1);
    ctx.lineTo(z.x1, n.surfaceY + 6);
    ctx.stroke();
    ctx.restore();
  }

  chambersOf(n, type) {
    return n.chambers.filter((c) => c.built && c.type === type);
  }

  // A heap of seeds (and the odd berry) on the chamber floor, filled bottom-up as stores grow.
  pileFor(c, count, cx, width, height) {
    let p = this.piles.get(c.id);
    if (p) return p;
    const rng = mulberry32((c.seed * 1000) | 0);
    p = [];
    for (let i = 0; i < count; i++) {
      const h = i / count, x = cx + (rng() - 0.5) * 2 * width * (1 - h * 0.8);
      const u = (x - cx) / width, cap = height * Math.max(0, 1 - u * u);
      p.push({ x, y: this.floorY(c, x) - 2.2 - Math.min(cap, h * height * 1.15), rot: rng() * TAU, v: rng(), berry: rng() < 0.12 });
    }
    this.piles.set(c.id, p);
    return p;
  }

  drawStores(ctx, n, col) {
    let remaining = col.food;
    const stores = [...this.chambersOf(n, 'queen'), ...this.chambersOf(n, 'storage')];
    for (const c of stores) {
      const cap = CFG.CHAMBERS[c.type].food;
      const fill = clamp(remaining / cap, 0, 1);
      remaining -= cap;
      const queen = c.type === 'queen';
      const N = queen ? 22 : 70;
      const pile = queen ? this.pileFor(c, N, c.x + c.rx * 0.6, c.rx * 0.26, c.ry * 0.45) : this.pileFor(c, N, c.x, c.rx * 0.78, c.ry * 1.05);
      const vis = Math.round(fill * N);
      ctx.lineWidth = 0.5;
      for (let i = 0; i < vis; i++) {
        const k = pile[i];
        if (k.berry) {
          ctx.fillStyle = '#9e2238';
          ctx.beginPath();
          ctx.arc(k.x, k.y, 2.3, 0, TAU);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,210,220,0.5)';
          ctx.beginPath();
          ctx.arc(k.x - 0.7, k.y - 0.8, 0.7, 0, TAU);
          ctx.fill();
          continue;
        }
        ctx.fillStyle = CRUMB_COLORS.seeds[Math.floor(k.v * 4)];
        ctx.strokeStyle = 'rgba(70,40,15,0.55)';
        ctx.beginPath();
        ctx.ellipse(k.x, k.y, 3.4, 2.1, k.rot, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,240,205,0.45)';
        ctx.beginPath();
        ctx.ellipse(k.x - 0.8, k.y - 0.6, 1.2, 0.6, k.rot, 0, TAU);
        ctx.fill();
      }
    }
  }

  broodSlots(n) {
    const slots = [];
    for (const c of this.chambersOf(n, 'queen')) {
      for (let k = 0; k < CFG.CHAMBERS.queen.brood; k++) {
        const x = c.x - c.rx * 0.62 + (k % 3) * 13;
        slots.push({ x, y: this.floorY(c, x) - 4 - Math.floor(k / 3) * 10 });
      }
    }
    for (const c of this.chambersOf(n, 'nursery')) {
      for (let k = 0; k < CFG.CHAMBERS.nursery.brood; k++) {
        const x = c.x + ((k % 4) - 1.5) * 18;
        slots.push({ x, y: this.floorY(c, x) - 4 - Math.floor(k / 4) * 11 });
      }
    }
    return slots;
  }

  drawBrood(ctx, n, col, time) {
    const slots = this.broodSlots(n);
    col.brood.forEach((b, i) => {
      const s = slots[i];
      if (!s) return;
      const big = b.caste === 'soldier' ? 1.3 : 1;
      const prog = b.t / CFG.BROOD[b.stage];
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.scale(1.6, 1.6);
      ctx.fillStyle = 'rgba(30,15,5,0.25)';
      ctx.beginPath();
      ctx.ellipse(0.4, 2.1 * big, 3.4 * big, 0.9, 0, 0, TAU);
      ctx.fill();
      if (b.stage === 'egg') {
        ctx.fillStyle = '#f6f1e4';
        ctx.strokeStyle = 'rgba(120,100,70,0.6)';
        ctx.lineWidth = 0.4;
        for (const [dx, dy] of [[-1.4, 0.3], [1.3, 0.5], [0, -0.9]]) {
          ctx.beginPath();
          ctx.ellipse(dx * big, dy * big, 1.6 * big, 1.1 * big, 0.4, 0, TAU);
          ctx.fill();
          ctx.stroke();
        }
      } else if (b.stage === 'larva') {
        const r = (2.4 + prog * 1.6) * big;
        ctx.rotate(Math.sin(time * 2 + i) * 0.15);
        ctx.strokeStyle = '#f1e9d6';
        ctx.lineCap = 'round';
        ctx.lineWidth = r * 0.9;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.7, 0.4, Math.PI * 1.6);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(150,125,90,0.45)';
        ctx.lineWidth = 0.4;
        for (let k = 0; k < 5; k++) {
          const a = 0.6 + k * 0.42;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3);
          ctx.lineTo(Math.cos(a) * r * 1.1, Math.sin(a) * r * 1.1);
          ctx.stroke();
        }
        ctx.fillStyle = '#c9a874';
        ctx.beginPath();
        ctx.arc(Math.cos(0.4) * r * 0.7, Math.sin(0.4) * r * 0.7, r * 0.3, 0, TAU);
        ctx.fill();
      } else {
        const g = ctx.createLinearGradient(0, -2.4 * big, 0, 2.4 * big);
        g.addColorStop(0, '#ead8b0');
        g.addColorStop(1, '#c4a676');
        ctx.fillStyle = g;
        ctx.strokeStyle = 'rgba(110,85,50,0.6)';
        ctx.lineWidth = 0.4;
        ctx.beginPath();
        ctx.ellipse(0, 0, 4.2 * big, 2.4 * big, 0, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(90,60,30,0.55)';
        ctx.beginPath();
        ctx.ellipse(3.4 * big, 0, 0.8, 1.1, 0, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    });
  }

  // A fungus garden is a spongy mound on a bed of cut leaves; fuller when well tended.
  gardenFor(c) {
    let gdn = this.gardens.get(c.id);
    if (gdn) return gdn;
    const rng = mulberry32((c.seed * 331) | 0), puffs = [], leaves = [];
    for (let i = 0; i < 130; i++) {
      const u = (rng() * 2 - 1) * 0.68, hmax = c.ry * 1.05 * Math.sqrt(1 - (u / 0.68) ** 2 * 0.9);
      const v = Math.pow(rng(), 0.75) * hmax, x = c.x + u * c.rx, r = 1.8 + rng() * 2.6;
      puffs.push({ x, y: this.floorY(c, x) - r - v, r, tone: rng(), h: v });
    }
    puffs.sort((a, b) => a.h - b.h);
    for (let i = 0; i < 22; i++) {
      const x = c.x + (rng() * 2 - 1) * c.rx * 0.85;
      leaves.push({ x, y: this.floorY(c, x) - 1.5 - rng() * c.ry * 0.5, rot: rng() * TAU, s: 2 + rng() * 2.5, hue: 70 + rng() * 45, l: 22 + rng() * 14 });
    }
    gdn = { puffs, leaves };
    this.gardens.set(c.id, gdn);
    return gdn;
  }

  drawResidents(ctx, n, col, time) {
    for (const c of this.chambersOf(n, 'queen')) {
      const frame = Math.floor(time * 1.5) & 3, x = c.x + 16, y = this.floorY(c, x) - 8;
      if (col.alive) Sprites.draw(ctx, 'player', 'queen', frame, x, y, Math.PI + Math.sin(time * 0.7) * 0.06, 1.9);
      else {
        ctx.globalAlpha = 0.5;
        Sprites.draw(ctx, 'player', 'queen', 0, x, y + 3, Math.PI * 0.95, 1.9);
        ctx.globalAlpha = 1;
      }
    }
    // Off-duty sleepers: a share of the workers actually inside, spread over the quarters.
    const quarters = this.chambersOf(n, 'barracks');
    const sleepers = Math.round((col.counts.inside * 0.3) / Math.max(1, quarters.length));
    for (const c of quarters) {
      const rng = mulberry32((c.seed * 777) | 0);
      const k = Math.min(6, sleepers);
      for (let i = 0; i < k; i++) {
        const caste = rng() < col.soldierRatio * 1.5 ? 'soldier' : 'worker', x = c.x + (i - 2.5) * 17;
        Sprites.draw(ctx, 'player', caste, 0, x, this.floorY(c, x) - 4 - rng() * 2, rng() < 0.5 ? 0.08 : Math.PI - 0.08, ANT_SCALE);
      }
    }

    const tended = col.caps.gardeners ? Math.min(1, col.gardeners / col.caps.gardeners) : 0;
    for (const c of this.chambersOf(n, 'garden')) {
      const gdn = this.gardenFor(c);
      for (const lf of gdn.leaves) {
        ctx.save();
        ctx.translate(lf.x, lf.y);
        ctx.rotate(lf.rot);
        ctx.fillStyle = `hsl(${lf.hue},40%,${lf.l}%)`;
        ctx.beginPath();
        ctx.moveTo(-lf.s * 1.6, 0);
        ctx.quadraticCurveTo(0, -lf.s, lf.s * 1.6, 0);
        ctx.quadraticCurveTo(0, lf.s, -lf.s * 1.6, 0);
        ctx.fill();
        ctx.restore();
      }
      const shown = Math.round(gdn.puffs.length * (0.45 + 0.55 * tended));
      for (let i = 0; i < shown; i++) {
        const p = gdn.puffs[i], r = p.r * (1 + Math.sin(time * 0.8 + i) * 0.04);
        const v = 178 + p.tone * 50;
        ctx.fillStyle = 'rgba(70,58,44,0.45)';
        ctx.beginPath();
        ctx.arc(p.x + 0.5, p.y + 0.7, r + 0.4, 0, TAU);
        ctx.fill();
        ctx.fillStyle = `rgb(${v | 0},${(v - 4) | 0},${(v - 18) | 0})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,252,240,0.5)';
        ctx.beginPath();
        ctx.arc(p.x - r * 0.3, p.y - r * 0.35, r * 0.4, 0, TAU);
        ctx.fill();
      }
    }

    // Infirmaries: leaf beds, with patients and green sparks only while someone is healing.
    const r2 = (CFG.NEST_R * 4) ** 2;
    const injured = col.ants.filter((a) => a.hp < a.maxHp - 0.5 && (a.inside || dist2(a.x, a.y, col.x, col.y) < r2));
    for (const c of this.chambersOf(n, 'infirmary')) {
      for (let i = -1; i <= 1; i++) {
        const x = c.x + i * 28, y = this.floorY(c, x) - 2;
        ctx.fillStyle = i ? '#5d7a37' : '#6b8a40';
        ctx.beginPath();
        ctx.moveTo(x - 15, y);
        ctx.quadraticCurveTo(x, y - 8, x + 15, y - 1);
        ctx.quadraticCurveTo(x, y + 4, x - 15, y);
        ctx.fill();
        ctx.strokeStyle = 'rgba(210,235,160,0.45)';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(x - 13, y);
        ctx.quadraticCurveTo(x, y - 2.5, x + 13, y - 1);
        ctx.stroke();
      }
      injured.slice(0, 2).forEach((a, i) => {
        const x = c.x + (i ? 28 : -28);
        Sprites.draw(ctx, 'player', a.caste, 0, x, this.floorY(c, x) - 7, i ? Math.PI - 0.1 : 0.15, ANT_SCALE);
      });
      for (let k = 0; injured.length && k < 3; k++) {
        const ph = (time * 0.5 + k / 3) % 1;
        ctx.fillStyle = `rgba(150,255,130,${(1 - ph) * 0.7})`;
        const x = c.x + (k - 1) * 22, y = c.y + c.ry * 0.2 - ph * c.ry * 0.9;
        ctx.fillRect(x - 3, y - 1, 6, 2);
        ctx.fillRect(x - 1, y - 3, 2, 6);
      }
    }

    // Guard posts: a low wall of pebbles and up to two soldiers on duty.
    for (const c of this.chambersOf(n, 'guard')) {
      const rng = mulberry32((c.seed * 97) | 0);
      for (let i = 0; i < 9; i++) {
        const x = c.x - c.rx * 0.75 + rng() * c.rx * 0.3, y = this.floorY(c, x) - 2 - rng() * 5, v = 110 + rng() * 50;
        ctx.fillStyle = `rgb(${v | 0},${(v - 8) | 0},${(v - 20) | 0})`;
        ctx.beginPath();
        ctx.ellipse(x, y, 2.5 + rng() * 2, 2 + rng() * 1.2, rng(), 0, TAU);
        ctx.fill();
      }
      const sx = (k) => c.x + k * 18;
      if (col.counts.soldiers > 0) Sprites.draw(ctx, 'player', 'soldier', 0, sx(-0.6), this.floorY(c, sx(-0.6)) - 8, Math.PI + 0.1 + Math.sin(time * 0.9) * 0.05, ANT_SCALE);
      if (col.counts.soldiers > 1) Sprites.draw(ctx, 'player', 'soldier', 0, sx(1.2), this.floorY(c, sx(1.2)) - 8, Math.PI - 0.15 + Math.sin(time * 0.7) * 0.05, ANT_SCALE);
    }

    // Scent halls: soft scent rings around an elder worker, brighter while research runs.
    for (const c of this.chambersOf(n, 'hall')) {
      const active = !!col.researching, cy = c.y + c.ry * 0.1;
      for (let k = 0; k < 3; k++) {
        const ph = (time * (active ? 0.6 : 0.25) + k / 3) % 1, a = (1 - ph) * (active ? 0.55 : 0.2);
        ctx.strokeStyle = k % 2 ? `rgba(130,255,120,${a})` : `rgba(110,175,255,${a})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(c.x, cy, c.rx * 0.18 + ph * c.rx * 0.62, c.ry * 0.14 + ph * c.ry * 0.55, 0, 0, TAU);
        ctx.stroke();
      }
      if (active) Sprites.draw(ctx, 'player', 'worker', Math.floor(time * 3) & 3, c.x, this.floorY(c, c.x) - 8, -Math.PI / 2 + Math.sin(time) * 0.15, ANT_SCALE);
    }
  }

  // Chamber names in screen pixels on small dark tags, with a progress bar for the current dig.
  drawLabels(ctx, n, g) {
    const v = this.view, dpr = g.dpr, short = v.s < 1, z = n.zone;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = '600 11.5px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const c of n.chambers) {
      if (c.type === 'entrance') continue;
      const T = CFG.CHAMBERS[c.type], job = n.job === c, hover = g.hoverChamber === c;
      if (v.s < 0.8 && !hover && !job) continue;
      let text = (short && SHORT_NAMES[c.type]) || T.name;
      if (!c.built) text += job ? ` · ${Math.floor(c.progress * 100)}%` : ' · queued';
      const x = v.ox + c.x * v.s, y = v.oy + (c.y - c.ry) * v.s - 13;
      const w = ctx.measureText(text).width + 14;
      ctx.fillStyle = hover ? 'rgba(24,15,8,0.85)' : 'rgba(24,15,8,0.6)';
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x - w / 2, y - 9, w, 18, 9) : ctx.rect(x - w / 2, y - 9, w, 18);
      ctx.fill();
      ctx.fillStyle = hover ? '#fff3d6' : 'rgba(255,236,205,0.88)';
      ctx.fillText(text, x, y + 0.5);
      if (job) {
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(x - w / 2 + 7, y + 11, w - 14, 3);
        ctx.fillStyle = '#e8b04a';
        ctx.fillRect(x - w / 2 + 7, y + 11, (w - 14) * c.progress, 3);
      }
    }
    if (!z.last) {
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.fillStyle = `rgba(255,228,190,${g.buildType ? 0.75 : 0.45})`;
      ctx.fillText('Research Deep Tunnels to dig further', v.ox + ((z.x0 + z.x1) / 2) * v.s, v.oy + z.y1 * v.s + 16);
    }
    ctx.textBaseline = 'alphabetic';
  }

  drawGhost(ctx, n, g) {
    const m = g.pendingPlace || g.mouseNest, T = CFG.CHAMBERS[g.buildType];
    const r = n.canPlace(g.buildType, m.x, m.y);
    const color = r.ok ? '120,230,120' : '255,110,90';
    if (r.parent) {
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = `rgba(${color},0.7)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(r.parent.x, r.parent.y);
      ctx.lineTo(m.x, m.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = `rgba(${color},0.18)`;
    ctx.strokeStyle = `rgba(${color},0.9)`;
    ctx.lineWidth = 2;
    this.tracePath(ctx, this.outline({ x: m.x, y: m.y, rx: T.rx, ry: T.ry, seed: 0 }));
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillStyle = `rgb(${color})`;
    ctx.fillText(r.ok ? `${T.name} · ${T.cost} food` : r.reason, m.x, m.y + T.ry + 16);
  }
}

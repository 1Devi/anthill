'use strict';
// Cross-section view of the player's nest: soil, tunnels, chambers, brood, food stores and busy workers.

const NS = 1.5; // pixels per nest unit for the baked soil
const ANT_SCALE = 1.6; // ants are drawn larger in the cross-section so they read at this zoom

class NestRenderer {
  constructor() {
    this.agents = [];
    this.view = { s: 1, ox: 0, oy: 0 };
    this.cam = { x: 0, y: 0, zoom: 1, min: 0.3, max: 3 }; // x/y: nest point at the area's top-left
    this.area = { x: 0, y: 0, w: 1, h: 1 };
    this.camReady = false;
    this.piles = new Map();
  }

  build(nest, seed) {
    this.nest = nest;
    this.seed = seed;
    this.soil = this.makeSoil(nest, seed);
    this.grass = this.makeGrass(nest, seed);
    this.agents = [];
    this.piles.clear();
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

  makeSoil(n, seed) {
    const noise = makeNoise2D(seed ^ 0xa11);
    const rng = mulberry32(seed ^ 0xbeef);
    const R = (a, b) => a + rng() * (b - a);
    const lw = n.W / 4, lh = n.H / 4;
    const low = document.createElement('canvas');
    low.width = lw;
    low.height = lh;
    const lctx = low.getContext('2d');
    const img = lctx.createImageData(lw, lh);
    for (let y = 0; y < lh; y++) {
      const depth = clamp((y * 4 - n.surfaceY) / (n.H - n.surfaceY), 0, 1);
      for (let x = 0; x < lw; x++) {
        const band = noise(x * 0.02, y * 0.35) * 0.5 + noise.fbm(x * 0.06, y * 0.06, 3) * 0.5;
        const t = clamp(0.75 - depth * 0.55 + (band - 0.5) * 0.45, 0, 1);
        const i = (y * lw + x) * 4;
        img.data[i] = lerp(48, 122, t);
        img.data[i + 1] = lerp(32, 88, t);
        img.data[i + 2] = lerp(20, 55, t);
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
    for (let i = 0; i < 16000 * k; i++) {
      const light = rng() < 0.5;
      ctx.fillStyle = light ? `rgba(220,180,130,${R(0.06, 0.25)})` : `rgba(20,10,5,${R(0.1, 0.35)})`;
      const s = R(0.4, 1.3);
      ctx.fillRect(R(0, n.W), R(n.surfaceY, n.H), s, s);
    }
    for (let i = 0; i < 110 * k; i++) {
      const x = R(0, n.W), y = R(n.surfaceY + 10, n.H), rx = R(3, 11), ry = rx * R(0.55, 0.9), rot = R(-0.4, 0.4);
      const v = Math.floor(R(95, 150));
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(x + 1, y + 1.5, rx, ry, rot, 0, TAU);
      ctx.fill();
      ctx.fillStyle = `rgb(${v},${v - 10},${v - 22})`;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.ellipse(x - rx * 0.25, y - ry * 0.35, rx * 0.5, ry * 0.3, rot, 0, TAU);
      ctx.fill();
    }
    // Roots hanging from the surface.
    ctx.lineCap = 'round';
    for (let i = 0; i < (14 * n.W) / 1000; i++) {
      let x = R(20, n.W - 20), y = n.surfaceY, a = Math.PI / 2 + R(-0.3, 0.3), wdt = R(2, 4.5);
      const len = R(60, 190);
      ctx.strokeStyle = `rgba(${Math.floor(R(150, 190))},${Math.floor(R(115, 145))},${Math.floor(R(75, 95))},0.75)`;
      for (let s = 0; s < len; s += 4) {
        const nx = x + Math.cos(a) * 4, ny = y + Math.sin(a) * 4;
        ctx.lineWidth = wdt * (1 - s / len) + 0.4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(nx, ny);
        ctx.stroke();
        x = nx;
        y = ny;
        a += R(-0.25, 0.25);
        if (rng() < 0.05) {
          let bx = x, by = y, ba = a + R(-1, 1);
          for (let b = 0; b < 30; b += 3) {
            const qx = bx + Math.cos(ba) * 3, qy = by + Math.sin(ba) * 3;
            ctx.lineWidth = 0.7;
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

  makeGrass(n, seed) {
    const rng = mulberry32(seed ^ 0x6a55);
    const c = document.createElement('canvas');
    c.width = n.W * NS;
    c.height = 60 * NS;
    const ctx = c.getContext('2d');
    ctx.scale(NS, NS);
    const base = 40;
    ctx.fillStyle = '#4a3a22';
    ctx.fillRect(0, base, n.W, 20);
    ctx.lineCap = 'round';
    for (let i = 0; i < (900 * n.W) / 1000; i++) {
      const x = rng() * n.W, h = 6 + rng() * 30, lean = (rng() - 0.5) * 10;
      ctx.strokeStyle = `hsl(${85 + rng() * 30},${40 + rng() * 25}%,${22 + rng() * 22}%)`;
      ctx.lineWidth = 0.8 + rng() * 1.4;
      ctx.beginPath();
      ctx.moveTo(x, base + 2);
      ctx.quadraticCurveTo(x + lean * 0.3, base - h * 0.6, x + lean, base - h);
      ctx.stroke();
    }
    return c;
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
    return { x: c.x + rand(-0.65, 0.65) * c.rx, y: c.y + rand(0.1, 0.55) * c.ry };
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

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#140e09';
    ctx.fillRect(0, 0, g.canvas.width, g.canvas.height);
    ctx.setTransform(v.s * dpr, 0, 0, v.s * dpr, v.ox * dpr, v.oy * dpr);

    this.drawSky(ctx, g, n);
    // Soil, plus mirrored copies to the sides so wide screens have no flat bands.
    const sy = n.surfaceY * NS, sh = (n.H - n.surfaceY) * NS;
    ctx.drawImage(this.soil, 0, sy, n.W * NS, sh, 0, n.surfaceY, n.W, n.H - n.surfaceY);
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(this.soil, 0, sy, n.W * NS, sh, 0, n.surfaceY, n.W, n.H - n.surfaceY);
    ctx.drawImage(this.soil, 0, sy, n.W * NS, sh, -2 * n.W, n.surfaceY, n.W, n.H - n.surfaceY);
    ctx.restore();
    for (let gx = Math.floor((-v.ox / v.s) / n.W) * n.W; gx < (g.vw - v.ox) / v.s; gx += n.W) {
      ctx.drawImage(this.grass, gx, n.surfaceY - 40, n.W, 60);
    }
    this.drawEntrance(ctx, n);

    this.drawZone(ctx, n, g);

    // Tunnels, then chambers on top (two passes: dark rim, then lit cavity).
    for (const pass of [0, 1]) {
      for (const c of n.chambers) {
        if (c.type === 'entrance') continue;
        this.drawTunnel(ctx, c, n.digState(c).tunnel, pass);
      }
      for (const c of n.chambers) {
        if (c.type === 'entrance') continue;
        this.drawChamber(ctx, c, n.digState(c).chamber, pass);
      }
    }

    this.drawStores(ctx, n, col);
    this.drawBrood(ctx, n, col, g.world.time);
    this.drawResidents(ctx, n, col, g.world.time);
    for (const ag of this.agents) Sprites.draw(ctx, 'player', 'worker', (ag.anim | 0) & 3, ag.x, ag.y, ag.a, ANT_SCALE);
    this.drawLabels(ctx, n, g);
    if (g.buildType && g.mouseNest && g.hover) this.drawGhost(ctx, n, g);
  }

  drawSky(ctx, g, n) {
    const day = g.world.dayInfo();
    // Extend sky and soil past the nest bounds so wide or tall screens have no black bands.
    const v = this.view, top = -v.oy / v.s - 2, left = -v.ox / v.s - 2, right = (g.vw - v.ox) / v.s + 2, bottom = (g.vh - v.oy) / v.s + 2;
    const sky = ctx.createLinearGradient(0, top, 0, n.surfaceY);
    const mix = (a, b) => `rgb(${a.map((x, i) => Math.round(lerp(b[i], x, day.light))).join(',')})`;
    sky.addColorStop(0, mix([110, 170, 220], [8, 14, 36]));
    sky.addColorStop(1, mix([200, 225, 235], [28, 40, 72]));
    ctx.fillStyle = sky;
    ctx.fillRect(left, top, right - left, n.surfaceY - top);
    ctx.fillStyle = '#3d2a19';
    ctx.fillRect(left, n.surfaceY, right - left, bottom - n.surfaceY);
    const f = (g.world.time / CFG.DAY_LENGTH + 0.3) % 1;
    const sx = ((f + 0.75) % 1) * n.W;
    if (day.light > 0.05) {
      ctx.fillStyle = `rgba(255,236,170,${day.light})`;
      ctx.beginPath();
      ctx.arc(sx, 30 + (1 - day.light) * 50, 14, 0, TAU);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(230,235,255,0.9)';
      ctx.beginPath();
      ctx.arc((sx + n.W / 2) % n.W, 34, 10, 0, TAU);
      ctx.fill();
    }
    if (g.world.rain > 0) {
      ctx.fillStyle = 'rgba(90,100,120,0.45)';
      ctx.fillRect(0, 0, n.W, n.surfaceY);
    }
  }

  drawEntrance(ctx, n) {
    const e = n.chambers[0];
    ctx.fillStyle = '#8a6a44';
    ctx.beginPath();
    ctx.ellipse(e.x, n.surfaceY + 2, 48, 14, 0, Math.PI, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,230,180,0.25)';
    for (let i = 0; i < 40; i++) {
      const a = Math.PI + (i / 40) * Math.PI;
      ctx.fillRect(e.x + Math.cos(a) * 40 * ((i * 7) % 10) / 10, n.surfaceY + Math.sin(a) * 11 * ((i * 3) % 10) / 10, 1.4, 1.4);
    }
  }

  tunnelPath(ctx, c, t) {
    const T = c.tunnel, steps = 20;
    ctx.beginPath();
    ctx.moveTo(T.x1, T.y1);
    for (let i = 1; i <= steps; i++) {
      const p = bezierPoint((i / steps) * t, T.x1, T.y1, T.cx, T.cy, T.x2, T.y2);
      ctx.lineTo(p.x, p.y);
    }
  }

  drawTunnel(ctx, c, t, pass) {
    if (t <= 0) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    this.tunnelPath(ctx, c, t);
    ctx.strokeStyle = pass ? '#7a5a3c' : '#24170d';
    ctx.lineWidth = pass ? 14 : 21;
    ctx.stroke();
  }

  drawChamber(ctx, c, f, pass) {
    if (!c.built) {
      if (pass === 1) {
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = 'rgba(255,225,170,0.45)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, c.rx, c.ry, 0, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (f <= 0) return;
    }
    const k = c.built ? 1 : Math.sqrt(f);
    const rx = c.rx * k, ry = c.ry * k;
    if (pass === 0) {
      ctx.fillStyle = '#24170d';
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, rx + 4, ry + 4, 0, 0, TAU);
      ctx.fill();
      return;
    }
    const gr = ctx.createRadialGradient(c.x, c.y - ry * 0.3, 2, c.x, c.y, Math.max(rx, ry));
    gr.addColorStop(0, '#9a7852');
    gr.addColorStop(1, '#68492f');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, rx, ry, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(40,25,12,0.25)';
    ctx.beginPath();
    ctx.ellipse(c.x, c.y + ry * 0.7, rx * 0.85, ry * 0.3, 0, 0, TAU);
    ctx.fill();
  }

  chambersOf(n, type) {
    return n.chambers.filter((c) => c.built && c.type === type);
  }

  // A heap of seeds on the chamber floor; filled bottom-up as stores grow.
  pileFor(c, count, cx, width) {
    let p = this.piles.get(c.id);
    if (p) return p;
    const rng = mulberry32((c.seed * 1000) | 0);
    p = [];
    for (let i = 0; i < count; i++) {
      const h = i / count;
      const spread = width * (1 - h * 0.7);
      p.push({ x: cx + (rng() - 0.5) * 2 * spread, y: c.y + c.ry * 0.62 - h * c.ry * 1.1 + (rng() - 0.5) * 3, rot: rng() * TAU, v: rng() });
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
      const N = queen ? 18 : 60;
      const pile = queen ? this.pileFor(c, N, c.x + c.rx * 0.62, c.rx * 0.3) : this.pileFor(c, N, c.x, c.rx * 0.8);
      const vis = Math.round(fill * N);
      for (let i = 0; i < vis; i++) {
        const k = pile[i];
        ctx.fillStyle = CRUMB_COLORS.seeds[Math.floor(k.v * 4)];
        ctx.beginPath();
        ctx.ellipse(k.x, k.y, 3.4, 2.1, k.rot, 0, TAU);
        ctx.fill();
      }
    }
  }

  broodSlots(n) {
    const slots = [];
    for (const c of this.chambersOf(n, 'queen')) {
      for (let k = 0; k < CFG.CHAMBERS.queen.brood; k++) {
        slots.push({ x: c.x - c.rx * 0.66 + (k % 3) * 14, y: c.y + c.ry * 0.5 - Math.floor(k / 3) * 13 });
      }
    }
    for (const c of this.chambersOf(n, 'nursery')) {
      for (let k = 0; k < CFG.CHAMBERS.nursery.brood; k++) {
        slots.push({ x: c.x + ((k % 4) - 1.5) * 18, y: c.y + c.ry * 0.5 - Math.floor(k / 4) * 14 });
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
      ctx.scale(1.5, 1.5);
      if (b.stage === 'egg') {
        ctx.fillStyle = '#f4efe2';
        ctx.strokeStyle = 'rgba(120,100,70,0.6)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.ellipse(0, 0, 2.2 * big, 1.5 * big, 0.3, 0, TAU);
        ctx.fill();
        ctx.stroke();
      } else if (b.stage === 'larva') {
        const r = (2.4 + prog * 1.6) * big;
        ctx.rotate(Math.sin(time * 2 + i) * 0.15);
        ctx.strokeStyle = '#efe6d2';
        ctx.lineCap = 'round';
        ctx.lineWidth = r * 0.9;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.7, 0.4, Math.PI * 1.6);
        ctx.stroke();
        ctx.fillStyle = '#c7a978';
        ctx.beginPath();
        ctx.arc(Math.cos(0.4) * r * 0.7, Math.sin(0.4) * r * 0.7, r * 0.3, 0, TAU);
        ctx.fill();
      } else {
        ctx.fillStyle = '#dcc69c';
        ctx.strokeStyle = 'rgba(110,85,50,0.7)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.ellipse(0, 0, 4.2 * big, 2.4 * big, 0, 0, TAU);
        ctx.fill();
        ctx.stroke();
        for (let k = -1; k <= 1; k++) {
          ctx.beginPath();
          ctx.moveTo(k * 1.3 * big, -2.2 * big);
          ctx.lineTo(k * 1.3 * big, 2.2 * big);
          ctx.stroke();
        }
      }
      ctx.restore();
    });
  }

  drawResidents(ctx, n, col, time) {
    for (const c of this.chambersOf(n, 'queen')) {
      const frame = Math.floor(time * 1.5) & 3;
      if (col.alive) Sprites.draw(ctx, 'player', 'queen', frame, c.x + 20, c.y + 5, Math.PI + Math.sin(time * 0.7) * 0.06, 1.9);
      else {
        ctx.globalAlpha = 0.5;
        Sprites.draw(ctx, 'player', 'queen', 0, c.x + 20, c.y + 10, Math.PI * 0.95, 1.9);
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
        const caste = rng() < col.soldierRatio * 1.5 ? 'soldier' : 'worker';
        Sprites.draw(ctx, 'player', caste, 0, c.x + (i - 2.5) * 17, c.y + c.ry * 0.5 + rng() * 3, rng() < 0.5 ? 0 : Math.PI, ANT_SCALE);
      }
    }

    // Fungus gardens: pale fungus heads on a bed of leaf bits, fuller when well tended.
    const tended = col.caps.gardeners ? Math.min(1, col.gardeners / col.caps.gardeners) : 0;
    for (const c of this.chambersOf(n, 'garden')) {
      const rng = mulberry32((c.seed * 331) | 0);
      for (let i = 0; i < 16; i++) {
        ctx.fillStyle = `hsl(${80 + rng() * 40},35%,${24 + rng() * 14}%)`;
        ctx.beginPath();
        ctx.ellipse(c.x + (rng() - 0.5) * c.rx * 1.5, c.y + c.ry * (0.45 + rng() * 0.2), 5 + rng() * 4, 2 + rng() * 1.5, rng() - 0.5, 0, TAU);
        ctx.fill();
      }
      const heads = 5 + Math.round(tended * 8);
      for (let i = 0; i < heads; i++) {
        const x = c.x + (rng() - 0.5) * c.rx * 1.4, y = c.y + c.ry * 0.35 - rng() * c.ry * 0.55;
        const r = 4 + rng() * 5 + Math.sin(time * 0.8 + i) * 0.4;
        ctx.fillStyle = '#d9cfb3';
        ctx.fillRect(x - 1, y, 2, c.y + c.ry * 0.5 - y);
        ctx.fillStyle = '#f1e9d3';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(150,125,90,0.35)';
        ctx.beginPath();
        ctx.arc(x + r * 0.25, y + r * 0.3, r * 0.65, 0, TAU);
        ctx.fill();
      }
    }

    // Infirmaries: leaf beds, with patients and green sparks only while someone is healing.
    const r2 = (CFG.NEST_R * 4) ** 2;
    const injured = col.ants.filter((a) => a.hp < a.maxHp - 0.5 && (a.inside || dist2(a.x, a.y, col.x, col.y) < r2));
    for (const c of this.chambersOf(n, 'infirmary')) {
      for (let i = -1; i <= 1; i++) {
        ctx.fillStyle = '#5f7a3a';
        ctx.beginPath();
        ctx.ellipse(c.x + i * 30, c.y + c.ry * 0.5, 14, 5, 0, 0, TAU);
        ctx.fill();
      }
      injured.slice(0, 2).forEach((a, i) => {
        Sprites.draw(ctx, 'player', a.caste, 0, c.x + (i ? 30 : -30), c.y + c.ry * 0.36, i ? Math.PI - 0.1 : 0.15, ANT_SCALE);
      });
      for (let k = 0; injured.length && k < 3; k++) {
        const ph = (time * 0.5 + k / 3) % 1;
        ctx.fillStyle = `rgba(140,255,120,${(1 - ph) * 0.7})`;
        const x = c.x + (k - 1) * 22, y = c.y + c.ry * 0.2 - ph * c.ry * 0.9;
        ctx.fillRect(x - 3, y - 1, 6, 2);
        ctx.fillRect(x - 1, y - 3, 2, 6);
      }
    }

    // Guard posts: up to two soldiers on duty, if the colony has any.
    for (const c of this.chambersOf(n, 'guard')) {
      if (col.counts.soldiers > 0) Sprites.draw(ctx, 'player', 'soldier', 0, c.x - 20, c.y + 8, -0.3 + Math.sin(time * 0.9) * 0.05, ANT_SCALE);
      if (col.counts.soldiers > 1) Sprites.draw(ctx, 'player', 'soldier', 0, c.x + 20, c.y + 8, Math.PI + 0.3 + Math.sin(time * 0.7) * 0.05, ANT_SCALE);
    }

    // Scent halls: pulsing scent rings around an elder worker, brighter while research runs.
    for (const c of this.chambersOf(n, 'hall')) {
      const active = !!col.researching;
      for (let k = 0; k < 3; k++) {
        const ph = (time * (active ? 0.6 : 0.25) + k / 3) % 1;
        ctx.strokeStyle = k % 2 ? `rgba(120,255,110,${(1 - ph) * (active ? 0.6 : 0.25)})` : `rgba(90,160,255,${(1 - ph) * (active ? 0.6 : 0.25)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(c.x, c.y + 4, c.rx * 0.2 + ph * c.rx * 0.7, c.ry * 0.15 + ph * c.ry * 0.6, 0, 0, TAU);
        ctx.stroke();
      }
      if (active) Sprites.draw(ctx, 'player', 'worker', Math.floor(time * 3) & 3, c.x, c.y + c.ry * 0.35, -Math.PI / 2 + Math.sin(time) * 0.15, ANT_SCALE);
    }
  }

  // Soil outside the diggable zone is darkened and hatched until Deep Tunnels opens it up.
  drawZone(ctx, n, g) {
    const z = n.zone;
    if (z.last) return;
    const v = this.view;
    const left = -v.ox / v.s - 50, right = (g.vw - v.ox) / v.s + 50, bottom = (g.vh - v.oy) / v.s + 50;
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, n.surfaceY, right - left, bottom - n.surfaceY);
    ctx.rect(z.x0, n.surfaceY, z.x1 - z.x0, z.y1 - n.surfaceY);
    ctx.fillStyle = 'rgba(12,7,3,0.55)';
    ctx.fill('evenodd');
    ctx.clip('evenodd');
    ctx.strokeStyle = 'rgba(255,220,170,0.06)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const h = bottom - n.surfaceY;
    for (let x = left - h; x < right; x += 18) {
      ctx.moveTo(x, n.surfaceY);
      ctx.lineTo(x + h, bottom);
    }
    ctx.stroke();
    ctx.restore();
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = 'rgba(255,220,170,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(z.x0, n.surfaceY);
    ctx.lineTo(z.x0, z.y1);
    ctx.lineTo(z.x1, z.y1);
    ctx.lineTo(z.x1, n.surfaceY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,230,190,0.6)';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Research Deep Tunnels to dig further', (z.x0 + z.x1) / 2, z.y1 + 24);
  }

  drawLabels(ctx, n, g) {
    ctx.textAlign = 'center';
    ctx.font = '600 12px system-ui, sans-serif';
    for (const c of n.chambers) {
      if (c.type === 'entrance') continue;
      const T = CFG.CHAMBERS[c.type];
      let text = T.name;
      if (!c.built) {
        const qi = n.queue.indexOf(c.id);
        text += qi === 0 ? ` · ${Math.floor(c.progress * 100)}%` : ' · queued';
      }
      const hover = g.hoverChamber === c;
      ctx.fillStyle = hover ? 'rgba(255,240,200,1)' : 'rgba(255,235,200,0.7)';
      ctx.fillText(text, c.x, c.y - c.ry - 9);
      if (hover) {
        ctx.strokeStyle = 'rgba(255,230,170,0.8)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, c.rx + 6, c.ry + 6, 0, 0, TAU);
        ctx.stroke();
      }
    }
  }

  drawGhost(ctx, n, g) {
    const m = g.mouseNest, T = CFG.CHAMBERS[g.buildType];
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
    ctx.beginPath();
    ctx.ellipse(m.x, m.y, T.rx, T.ry, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillStyle = `rgb(${color})`;
    ctx.fillText(r.ok ? `${T.name} · ${T.cost} food` : r.reason, m.x, m.y + T.ry + 16);
  }
}

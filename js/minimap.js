'use strict';
// Minimap of the whole surface: terrain, food, nests, ants, spiders and the camera view. Click to jump.

class Minimap {
  constructor(game) {
    this.g = game;
    this.canvas = document.getElementById('minimap');
    this.ctx = this.canvas.getContext('2d');
    this.base = document.createElement('canvas');
    this.rocks = document.createElement('canvas'); // rocks alone, laid over the snow in winter
    this.visible = true;
    this.frame = 0;
    this.wallsVersion = -1;
    this.dragging = false;
    this.canvas.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.canvas.setPointerCapture(e.pointerId);
      this.jump(e);
    });
    this.canvas.addEventListener('pointermove', (e) => this.dragging && this.jump(e));
    this.canvas.addEventListener('pointerup', () => (this.dragging = false));
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  build(world) {
    this.world = world;
    this.wallsVersion = -1;
    this.resize();
  }

  resize() {
    const w = this.world;
    if (!w) return;
    const cssW = this.canvas.clientWidth || 240;
    const cssH = Math.round((cssW * w.H) / w.W);
    this.canvas.style.height = cssH + 'px';
    const dpr = this.g.dpr;
    this.canvas.width = this.base.width = this.rocks.width = Math.round(cssW * dpr);
    this.canvas.height = this.base.height = this.rocks.height = Math.round(cssH * dpr);
    this.wallsVersion = -1;
  }

  // Centre the main camera on the clicked point.
  jump(e) {
    const r = this.canvas.getBoundingClientRect(), w = this.world, g = this.g, c = g.cam;
    if (g.view !== 'surface') g.setView('surface');
    const wx = ((e.clientX - r.left) / r.width) * w.W, wy = ((e.clientY - r.top) / r.height) * w.H;
    const [ax, ay, aw, ah] = g.areaRect();
    c.x = wx - (ax + aw / 2) / c.zoom;
    c.y = wy - (ay + ah / 2) / c.zoom;
    g.clampCam();
  }

  drawBase() {
    const b = this.base.getContext('2d'), s = this.g.surface;
    b.drawImage(s.bg, 0, 0, this.base.width, this.base.height);
    b.drawImage(s.walls, 0, 0, this.base.width, this.base.height);
    b.fillStyle = 'rgba(10,6,3,0.25)';
    b.fillRect(0, 0, this.base.width, this.base.height);
    const r = this.rocks.getContext('2d');
    r.globalCompositeOperation = 'source-over';
    r.clearRect(0, 0, this.rocks.width, this.rocks.height);
    r.drawImage(s.walls, 0, 0, this.rocks.width, this.rocks.height);
    r.globalCompositeOperation = 'source-atop';
    r.fillStyle = 'rgba(10,6,3,0.25)';
    r.fillRect(0, 0, this.rocks.width, this.rocks.height);
    this.wallsVersion = this.world.wallsVersion;
  }

  render() {
    if (!this.visible || this.frame++ % 3) return;
    const w = this.world, ctx = this.ctx, k = this.canvas.width / w.W, dpr = this.g.dpr;
    if (this.wallsVersion !== w.wallsVersion) this.drawBase();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.base, 0, 0);
    const look = seasonLook(w), [tr, tg, tb, ta] = look.tint;
    if (look.snow > 0.01) {
      ctx.fillStyle = `rgba(236,242,255,${look.snow * 0.5})`;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.drawImage(this.rocks, 0, 0);
    }
    if (ta > 0.005) {
      ctx.fillStyle = `rgba(${tr | 0},${tg | 0},${tb | 0},${ta * 1.5})`;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    ctx.setTransform(k, 0, 0, k, 0, 0);

    for (const f of w.foods) {
      ctx.fillStyle = f.kind === 'corpse' ? 'rgba(160,120,90,0.8)' : f.kind === 'prey' ? '#d08a5a' : '#f0d66e';
      const r = Math.max(2.2 / k, f.pickR * 0.8);
      ctx.beginPath();
      ctx.arc(f.x, f.y, r, 0, TAU);
      ctx.fill();
    }
    const dot = 1.6 / k;
    // Every colony has one colour: its ants and its nest.
    for (const c of w.colonies) {
      ctx.fillStyle = Sprites.PAL[c.palette].map;
      for (const a of c.ants) if (!a.inside && !a.dead) ctx.fillRect(a.x - dot / 2, a.y - dot / 2, dot, dot);
    }
    for (const c of w.colonies) {
      ctx.lineWidth = (c.isPlayer ? 2.5 : 1.5) / k;
      ctx.strokeStyle = '#140c06';
      ctx.fillStyle = c.alive ? Sprites.PAL[c.palette].map : '#555';
      ctx.beginPath();
      ctx.arc(c.x, c.y, (c.isPlayer ? 5 : 4.5) / k, 0, TAU);
      ctx.fill();
      ctx.stroke();
      if (c.underAttackT > 0 && Math.floor(w.time * 4) % 2) {
        ctx.strokeStyle = '#ff3b2a';
        ctx.lineWidth = 1.5 / k;
        ctx.beginPath();
        ctx.arc(c.x, c.y, 9 / k, 0, TAU);
        ctx.stroke();
      }
    }
    // Spiders: dark blobs with a white rim, unlike any colony colour.
    for (const s of w.spiders) {
      ctx.fillStyle = '#1a1210';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1 / k;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 3.5 / k, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    const rally = w.player.rally;
    if (rally) {
      ctx.fillStyle = rally.raid ? '#ff5a3c' : '#ffd25a';
      ctx.fillRect(rally.x - 1.5 / k, rally.y - 8 / k, 1.5 / k, 8 / k);
      ctx.fillRect(rally.x, rally.y - 8 / k, 5 / k, 3.5 / k);
    }

    // Camera viewport.
    const g = this.g, c = g.cam, [ax, ay, aw, ah] = g.areaRect();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = dpr / k;
    ctx.strokeRect(c.x + ax / c.zoom, c.y + ay / c.zoom, aw / c.zoom, ah / c.zoom);
  }
}

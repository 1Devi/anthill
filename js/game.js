'use strict';
// Game shell: canvas sizing, camera, input, tools and the fixed-step main loop.

const TOP_H = 52;

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this.app = document.getElementById('app');
    this.dpr = 1;
    this.vw = 0;
    this.vh = 0;
    this.world = null;
    this.demo = false;
    this.over = false;
    this.view = 'surface';
    this.speed = 1;
    this.prevSpeed = 1;
    this.tool = 'inspect';
    this.brush = 12;
    this.buildType = null;
    this.selected = null;
    this.show = { phero: true, rival: false };
    this.cam = { x: 0, y: 0, zoom: 1, min: 0.3, max: 6 };
    this.ptr = null; // active pointer drag
    this.hover = false;
    this.mouseScreen = null;
    this.mouseWorld = null;
    this.mouseNest = null;
    this.hoverChamber = null;
    this.keys = new Set();
    this.acc = 0;
    this.last = performance.now();
    this.autosaveT = 60;
    this.surface = new SurfaceRenderer();
    this.nestR = new NestRenderer();
    this.sound = new Sound();
    this.minimap = new Minimap(this);
    this.ui = new UI(this);
    this.bindInput();
    window.addEventListener('resize', () => this.onResize());
    this.onResize();
    this.start('peaceful', true);
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  start(diff, demo = false) {
    this.setupWorld(new World({ difficulty: diff }), demo);
    if (!demo) {
      this.world.log('Your colony is awake. Workers are heading out to find food.', 'info');
      this.world.log('Tip: switch to the Nest view (Tab) to dig more chambers.', 'info');
    }
  }

  setupWorld(world, demo) {
    this.world = world;
    this.surface.build(world);
    this.nestR.build(world.player.nest, world.seed);
    this.nestR.layout(...this.areaRect());
    this.minimap.build(world);
    this.demo = demo;
    this.over = false;
    this.selected = null;
    this.acc = 0;
    this.autosaveT = 60;
    this.ui.onNewGame();
    this.setView('surface');
    this.setTool('inspect');
    this.setBuild(null);
    this.setSpeed(1);
    this.fitCamera();
  }

  // ---------- save / load ----------

  saveTo(slot, quiet = false) {
    if (this.demo) return false;
    try {
      SaveStore.write(slot, this.world);
      if (!quiet) this.ui.toast(`Game saved to slot ${slot}.`, 'good');
      return true;
    } catch {
      if (!quiet) this.ui.toast('Could not save: browser storage is full or blocked.', 'danger');
      return false;
    }
  }

  loadSave(save) {
    try {
      this.setupWorld(loadWorld(save.data), false);
      this.world.log(`Game loaded: day ${save.meta.day}, ${save.meta.ants} ants.`, 'good');
      return true;
    } catch (e) {
      this.ui.toast(e.message || 'Could not load this save.', 'danger');
      return false;
    }
  }

  autosave() {
    if (this.world && !this.demo && !this.over) this.saveTo('auto', true);
  }

  // ---------- layout & camera ----------

  // Visible play area between the resource bar and the bottom HUD, in CSS pixels.
  areaRect() {
    return [0, TOP_H, this.vw, this.vh - TOP_H - this.hudH];
  }

  onResize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.vw = window.innerWidth;
    this.vh = window.innerHeight;
    const hud = document.getElementById('hud');
    this.hudH = this.app.classList.contains('hud-hidden') ? 0 : hud.offsetHeight;
    this.canvas.width = Math.round(this.vw * this.dpr);
    this.canvas.height = Math.round(this.vh * this.dpr);
    if (this.world) {
      this.nestR.layout(...this.areaRect());
      this.minimap.resize();
      this.clampCam();
    }
  }

  fitCamera() {
    const [ax, ay, aw, ah] = this.areaRect();
    const w = this.world, c = this.cam;
    const fit = Math.min(aw / w.W, ah / w.H);
    c.min = fit * 0.9;
    c.zoom = clamp(1.3, c.min, c.max); // same close-up regardless of map size
    const p = w.player;
    c.x = p.x + 60 - (ax + aw / 2) / c.zoom;
    c.y = p.y - 40 - (ay + ah / 2) / c.zoom;
    this.clampCam();
  }

  clampCam() {
    const c = this.cam, w = this.world;
    const [ax, ay, aw, ah] = this.areaRect();
    const vw = aw / c.zoom, vh = ah / c.zoom;
    const mx = Math.max(0, (vw - w.W) / 2) + 12, my = Math.max(0, (vh - w.H) / 2) + 12;
    c.x = clamp(c.x, -ax / c.zoom - mx, w.W - (ax + aw) / c.zoom + mx);
    c.y = clamp(c.y, -ay / c.zoom - my, w.H - (ay + ah) / c.zoom + my);
  }

  zoomAt(sx, sy, factor) {
    const c = this.cam;
    const before = this.screenToWorld(sx, sy);
    c.zoom = clamp(c.zoom * factor, c.min, c.max);
    c.x = before.x - sx / c.zoom;
    c.y = before.y - sy / c.zoom;
    this.clampCam();
  }

  screenToWorld(sx, sy) {
    return { x: this.cam.x + sx / this.cam.zoom, y: this.cam.y + sy / this.cam.zoom };
  }

  // ---------- modes ----------

  setView(v) {
    this.view = v;
    if (v === 'surface') this.setBuild(null);
    this.ui.setView(v);
  }

  setSpeed(s) {
    if (this.over && s > 0) return;
    this.speed = s;
    if (s > 0) this.prevSpeed = s;
    this.ui.setSpeed(s);
  }

  setTool(t) {
    this.tool = t;
    this.ui.setTool(t);
  }

  setBuild(type) {
    this.buildType = type;
    this.ui.setBuild(type);
  }

  recall() {
    if (!this.world.player.rally) return;
    this.world.player.rally = null;
    this.world.log('Soldiers are returning to guard the nest.', 'info');
  }

  // ---------- input ----------

  bindInput() {
    const cv = this.canvas;
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    cv.addEventListener('pointerenter', () => (this.hover = true));
    cv.addEventListener('pointerleave', () => {
      this.hover = false;
      this.ui.hideTooltip();
    });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const f = Math.exp(-e.deltaY * 0.0015);
      if (this.view === 'surface') this.zoomAt(e.offsetX, e.offsetY, f);
      else this.nestR.zoomAt(e.offsetX, e.offsetY, f);
    }, { passive: false });
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    // Audio may only start after a user gesture.
    window.addEventListener('pointerdown', () => this.sound.unlock(), true);
    window.addEventListener('keydown', () => this.sound.unlock(), true);
    document.addEventListener('click', (e) => e.target.closest('button') && this.sound.play('click'));
    document.addEventListener('visibilitychange', () => document.hidden && this.autosave());
    window.addEventListener('pagehide', () => this.autosave());
  }

  onDown(e) {
    if (!this.world || this.demo) return;
    this.hover = true;
    this.canvas.setPointerCapture(e.pointerId);
    const leftPans = this.view === 'surface' ? this.tool === 'inspect' : !this.buildType;
    const pan = e.button === 1 || e.button === 2 || (e.button === 0 && leftPans);
    this.ptr = { id: e.pointerId, button: e.button, sx: e.offsetX, sy: e.offsetY, lx: e.offsetX, ly: e.offsetY, moved: false, pan, stroke: 0 };
    if (e.button === 0 && this.view === 'surface' && !pan) this.applyTool(e.offsetX, e.offsetY, true);
  }

  onMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    this.mouseScreen = { x: sx, y: sy };
    if (!this.world) return;
    this.mouseWorld = this.screenToWorld(sx, sy);
    if (this.view === 'nest') {
      this.mouseNest = this.nestR.toNest(sx, sy);
      this.hoverChamber = this.world.player.nest.chamberAt(this.mouseNest.x, this.mouseNest.y);
      this.updateNestTooltip(e.clientX, e.clientY);
    } else {
      this.hoverChamber = null;
    }
    const p = this.ptr;
    if (!p || p.id !== e.pointerId) return;
    if (Math.hypot(sx - p.sx, sy - p.sy) > 4) p.moved = true;
    if (p.pan && this.view === 'nest') {
      this.nestR.pan(sx - p.lx, sy - p.ly);
    } else if (p.pan && this.view === 'surface') {
      this.cam.x -= (sx - p.lx) / this.cam.zoom;
      this.cam.y -= (sy - p.ly) / this.cam.zoom;
      this.clampCam();
    } else if (p.button === 0 && this.view === 'surface') {
      // Interpolate brush strokes so fast drags stay continuous.
      const a = this.screenToWorld(p.lx, p.ly), b = this.mouseWorld;
      const d = dist(a.x, a.y, b.x, b.y), steps = Math.max(1, Math.ceil(d / 3));
      for (let i = 1; i <= steps; i++) {
        p.stroke += d / steps;
        this.applyTool(lerp(p.lx, sx, i / steps), lerp(p.ly, sy, i / steps), false);
      }
    }
    p.lx = sx;
    p.ly = sy;
  }

  onUp(e) {
    const p = this.ptr;
    if (!p || p.id !== e.pointerId) return;
    this.ptr = null;
    if (p.moved) return;
    const sx = p.sx, sy = p.sy;
    if (this.view === 'surface') {
      if (p.button === 2) {
        if (this.tool === 'rally') this.recall();
        else this.setTool('inspect');
      } else if (p.button === 0 && this.tool === 'inspect') {
        const m = this.screenToWorld(sx, sy);
        this.selected = this.world.pickAt(m.x, m.y);
      }
    } else {
      const m = this.nestR.toNest(sx, sy), nest = this.world.player.nest;
      if (p.button === 0 && this.buildType) {
        const r = nest.order(this.buildType, m.x, m.y);
        if (!r.ok) this.ui.toast(r.reason, 'warn');
        else if (!e.shiftKey) this.setBuild(null);
      } else if (p.button === 2) {
        const c = nest.chamberAt(m.x, m.y);
        if (c && !c.built) {
          const why = nest.cancel(c.id);
          this.ui.toast(why || `${CFG.CHAMBERS[c.type].name} cancelled.`, why ? 'warn' : 'info');
        } else this.setBuild(null);
      }
    }
  }

  applyTool(sx, sy, first) {
    const w = this.world, p = w.player, m = this.screenToWorld(sx, sy);
    switch (this.tool) {
      case 'food':
        if (!first) return;
        if (w.feedCooldown > 0) {
          this.ui.toast(`Food drop is recharging (${Math.ceil(w.feedCooldown)} s).`, 'warn');
        } else if (w.isWall(m.x, m.y)) {
          this.ui.toast('Cannot drop food on rocks.', 'warn');
        } else {
          w.addFood(m.x, m.y, CFG.FEED.amount, 'sugar');
          w.feedCooldown = w.diff.feedCooldown;
          this.sound.play('drop');
        }
        break;
      case 'lure': {
        const stroke = this.ptr ? this.ptr.stroke : 0;
        p.foodP.splat(m.x, m.y, 8, clamp(0.25 + stroke / 350, 0.25, 1), 0.3);
        break;
      }
      case 'wall':
        w.paintWalls(m.x, m.y, this.brush, 1);
        break;
      case 'erase':
        w.paintWalls(m.x, m.y, this.brush, 0);
        p.foodP.erase(m.x, m.y, this.brush);
        p.home.erase(m.x, m.y, this.brush);
        break;
      case 'rally':
        if (!first) return;
        p.setRally(m.x, m.y);
        this.sound.play('march');
        w.log(p.rally.raid ? 'Soldiers march on the red nest!' : 'Soldiers are heading to the rally point.', p.rally.raid ? 'danger' : 'info');
        break;
    }
  }

  updateNestTooltip(cx, cy) {
    const c = this.hoverChamber;
    if (!c || !this.hover || this.buildType) {
      this.ui.hideTooltip();
      return;
    }
    const T = CFG.CHAMBERS[c.type];
    let html = `<b>${T.name}</b><br>${T.desc}`;
    if (!c.built) html += `<br>${Math.floor(c.progress * 100)}% dug · right-click to cancel`;
    this.ui.tooltip(cx, cy, html);
  }

  onKey(e, down) {
    if (e.target.tagName === 'INPUT' && e.target.type !== 'checkbox' && e.target.type !== 'range') return;
    const k = e.key.toLowerCase();
    if (!down) {
      this.keys.delete(k);
      return;
    }
    this.keys.add(k);
    if (!this.world || this.demo) return;
    if (k === 'tab') {
      e.preventDefault();
      this.setView(this.view === 'surface' ? 'nest' : 'surface');
    } else if (k === ' ') {
      e.preventDefault();
      this.setSpeed(this.speed > 0 ? 0 : this.prevSpeed);
    } else if (k === 'f') {
      this.setSpeed(this.speed >= 4 ? 1 : this.speed === 0 ? 1 : this.speed * 2);
    } else if (k >= '1' && k <= '7' && this.view === 'nest') {
      const type = ['storage', 'nursery', 'barracks', 'garden', 'infirmary', 'guard', 'hall'][+k - 1];
      this.setBuild(this.buildType === type ? null : type);
    } else if (k >= '1' && k <= '6') {
      this.setView('surface');
      this.setTool(['inspect', 'food', 'lure', 'wall', 'erase', 'rally'][+k - 1]);
    } else if (k === 'p') {
      this.show.phero = !this.show.phero;
      this.ui.$('c-phero').checked = this.show.phero;
    } else if (k === 'escape') {
      this.selected = null;
      this.setTool('inspect');
      this.setBuild(null);
      this.ui.toggleHelp(false);
      this.ui.toggleSaves(false);
      this.ui.toggleResearch(false);
    } else if (k === 'r') {
      this.ui.toggleResearch(!this.ui.researchOpen);
    } else if (k === 'l') {
      this.ui.toggleSaves(!this.ui.savesOpen);
    } else if (k === 'm') {
      this.sound.toggleMute();
      this.ui.updateSoundButton();
    } else if (k === 'h') {
      this.ui.toggleHelp(!this.ui.helpOpen);
    } else if (k === '[') {
      this.brush = Math.max(4, this.brush - 2);
    } else if (k === ']') {
      this.brush = Math.min(40, this.brush + 2);
    }
  }

  // Sounds queued by the simulation, quieter the further they are from the camera.
  playWorldSounds() {
    const w = this.world;
    if (!this.demo && w.sounds.length) {
      const [ax, ay, aw, ah] = this.areaRect(), c = this.cam;
      const cx = c.x + (ax + aw / 2) / c.zoom, cy = c.y + (ay + ah / 2) / c.zoom;
      const reach = (Math.max(aw, ah) / c.zoom) * 0.6;
      for (const s of w.sounds) {
        let v = 1;
        if (s.x !== undefined) v = this.view === 'surface' ? clamp(1.25 - dist(s.x, s.y, cx, cy) / reach, 0.08, 1) : 0.15;
        this.sound.play(s.name, v);
      }
    }
    w.sounds.length = 0;
  }

  // ---------- loop ----------

  loop(now) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const w = this.world;
    const running = this.speed > 0 && !this.ui.helpOpen && !this.ui.savesOpen && !this.ui.researchOpen;

    if (!this.demo) {
      const K = this.keys, step = 600 * dt;
      const dx = (K.has('a') || K.has('arrowleft') ? 1 : 0) - (K.has('d') || K.has('arrowright') ? 1 : 0);
      const dy = (K.has('w') || K.has('arrowup') ? 1 : 0) - (K.has('s') || K.has('arrowdown') ? 1 : 0);
      if (dx || dy) {
        if (this.view === 'nest') {
          this.nestR.pan(dx * step, dy * step);
        } else {
          this.cam.x -= (dx * step) / this.cam.zoom;
          this.cam.y -= (dy * step) / this.cam.zoom;
          this.clampCam();
        }
      }
    }

    if (running) {
      this.acc += dt * this.speed;
      let steps = 0;
      const maxSteps = 10 * this.speed;
      while (this.acc >= CFG.TICK && steps < maxSteps) {
        w.update(CFG.TICK);
        this.acc -= CFG.TICK;
        steps++;
      }
      if (steps >= maxSteps) this.acc = 0;
      if (!this.demo && !this.over) {
        this.autosaveT -= dt;
        if (this.autosaveT <= 0) {
          this.autosaveT = 60;
          this.autosave();
        }
      }
    }
    this.playWorldSounds();

    if (w.result) {
      const r = w.result;
      w.result = null;
      if (this.demo) {
        this.start('peaceful', true);
      } else {
        if (!r.win) this.over = true;
        this.setSpeed(0);
        this.ui.showEnd(r);
        this.sound.play(r.win ? 'win' : 'lose');
      }
    }

    if (this.view === 'surface') this.surface.render(this.ctx, this);
    else this.nestR.render(this.ctx, this, running ? dt * this.speed : 0);
    this.minimap.render();
    this.sound.update(dt, this);
    this.ui.update(dt);
    requestAnimationFrame(this.loop);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.game = new Game();
});

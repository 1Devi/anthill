'use strict';
// Underground nest model (cross-section): chambers joined by tunnels, dug by nest workers.

class Nest {
  constructor(colony) {
    this.colony = colony;
    this.W = CFG.NEST.W;
    this.H = CFG.NEST.H;
    this.surfaceY = CFG.NEST.surfaceY;
    this.chambers = [];
    this.queue = [];
    this.nextId = 1;
    this.version = 0;
    const cx = this.W / 2;
    const ent = { id: 0, type: 'entrance', x: cx, y: this.surfaceY - 2, rx: 0, ry: 0, built: true, progress: 1, parent: null };
    this.chambers.push(ent);
    const storage = this.makeChamber('storage', cx - 120, this.surfaceY + 135, ent);
    const queen = this.makeChamber('queen', cx + 60, this.surfaceY + 290, storage);
    storage.built = queen.built = true;
    storage.progress = queen.progress = 1;
    this.recalc();
  }

  get(id) {
    return this.chambers.find((c) => c.id === id);
  }

  get job() {
    return this.queue.length ? this.get(this.queue[0]) : null;
  }

  makeChamber(type, x, y, parent) {
    const T = CFG.CHAMBERS[type];
    const dx = x - parent.x, dy = y - parent.y;
    const len = Math.hypot(dx, dy) || 1;
    const off = rand(-0.22, 0.22) * len;
    const c = {
      id: this.nextId++, type, x, y, rx: T.rx, ry: T.ry,
      built: false, progress: 0, work: 0, parent: parent.id, seed: Math.random() * 1000,
      tunnel: { x1: parent.x, y1: parent.y, cx: (parent.x + x) / 2 - (dy / len) * off, cy: (parent.y + y) / 2 + (dx / len) * off, x2: x, y2: y, len },
      tunnelWork: len * CFG.DIG.tunnelWorkPerUnit,
      chamberWork: T.work,
    };
    this.chambers.push(c);
    this.version++;
    return c;
  }

  // Fraction of the tunnel dug and fraction of the chamber hollowed out.
  digState(c) {
    if (c.built) return { tunnel: 1, chamber: 1 };
    return {
      tunnel: clamp(c.work / c.tunnelWork, 0, 1),
      chamber: clamp((c.work - c.tunnelWork) / Math.max(1, c.chamberWork), 0, 1),
    };
  }

  canPlace(type, x, y) {
    const T = CFG.CHAMBERS[type];
    if (y - T.ry < this.surfaceY + 50) return { ok: false, reason: 'Too close to the surface' };
    if (y + T.ry > this.H - 20 || x - T.rx < 20 || x + T.rx > this.W - 20) return { ok: false, reason: 'Too close to the edge' };
    const z = this.zone;
    if (x - T.rx < z.x0 || x + T.rx > z.x1 || y + T.ry > z.y1) {
      return { ok: false, reason: z.last ? 'Outside the nest' : 'Outside the diggable area — research Deep Tunnels' };
    }
    for (const c of this.chambers) {
      if (c.type === 'entrance') continue;
      const ex = (x - c.x) / (c.rx + T.rx + 18), ey = (y - c.y) / (c.ry + T.ry + 18);
      if (ex * ex + ey * ey < 1) return { ok: false, reason: 'Overlaps another chamber' };
    }
    let parent = null, bd = Infinity;
    for (const c of this.chambers) {
      const d = dist(x, y, c.x, c.y);
      if (d < bd) {
        bd = d;
        parent = c;
      }
    }
    if (bd > CFG.DIG.maxTunnel) return { ok: false, reason: 'Too far from existing tunnels', parent };
    if (this.queue.length >= CFG.DIG.maxQueue) return { ok: false, reason: `At most ${CFG.DIG.maxQueue} digs queued`, parent };
    return { ok: true, parent };
  }

  order(type, x, y) {
    const r = this.canPlace(type, x, y);
    if (!r.ok) return r;
    const c = this.makeChamber(type, x, y, r.parent);
    this.queue.push(c.id);
    return r;
  }

  cancel(id) {
    const c = this.get(id);
    if (!c || c.built) return 'Already built';
    if (this.chambers.some((o) => o.parent === id)) return 'Another dig depends on this one';
    this.chambers = this.chambers.filter((o) => o !== c);
    this.queue = this.queue.filter((q) => q !== id);
    this.version++;
    return null;
  }

  update(dt, diggers, speedMul = 1) {
    const job = this.job;
    this.stalled = false;
    if (!job) return;
    const col = this.colony, total = job.tunnelWork + job.chamberWork, cost = CFG.CHAMBERS[job.type].cost;
    // The cost is paid as the chamber is dug; with an empty store the work stalls.
    let work = (CFG.DIG.base + diggers * CFG.DIG.perWorker) * speedMul * dt;
    const price = (cost * work) / total;
    if (price > col.buildSpendable()) work *= col.buildSpendable() / price;
    const paid = (cost * work) / total;
    col.payForBuilding(paid, 'digging');
    job.paid = (job.paid || 0) + paid;
    this.stalled = work <= 0;
    job.work += work;
    job.progress = Math.min(1, job.work / total);
    if (job.work >= total) {
      job.built = true;
      job.progress = 1;
      this.queue.shift();
      this.recalc();
      this.version++;
      this.colony.w.log(`${CFG.CHAMBERS[job.type].name} is finished: ${CFG.CHAMBERS[job.type].desc}.`, 'good');
      this.colony.w.sfx('build');
    }
  }

  // Sum what the built chambers provide: storage, brood slots, population, farming, healing...
  recalc() {
    const keys = ['food', 'brood', 'pop', 'farm', 'gardeners', 'heal', 'guard', 'halls'];
    const caps = Object.fromEntries(keys.map((k) => [k, 0]));
    for (const c of this.chambers) {
      if (!c.built || c.type === 'entrance') continue;
      const T = CFG.CHAMBERS[c.type];
      for (const k of keys) caps[k] += T[k] || 0;
    }
    this.caps = caps;
  }

  has(type) {
    return this.chambers.some((c) => c.built && c.type === type);
  }

  // The diggable area grows with Deep Tunnels research.
  get zone() {
    const zones = CFG.NEST.zones, lvl = Math.min(this.colony.mods.zone, zones.length - 1), z = zones[lvl];
    const cx = this.chambers[0].x;
    return {
      x0: Math.max(20, cx - z.halfW),
      x1: Math.min(this.W - 20, cx + z.halfW),
      y1: Math.min(this.H - 20, this.surfaceY + z.depth),
      last: lvl === zones.length - 1,
    };
  }

  chamberAt(x, y) {
    for (const c of this.chambers) {
      if (c.type === 'entrance') continue;
      const ex = (x - c.x) / c.rx, ey = (y - c.y) / c.ry;
      if (ex * ex + ey * ey <= 1) return c;
    }
    return null;
  }

  // Path from chamber a to chamber b through the tunnel tree, as a list of points.
  route(aId, bId, samples = 10) {
    const up = (id) => {
      const out = [];
      let c = this.get(id);
      while (c) {
        out.push(c);
        c = c.parent === null ? null : this.get(c.parent);
      }
      return out;
    };
    const A = up(aId), B = up(bId);
    const inB = new Set(B.map((c) => c.id));
    const lca = A.find((c) => inB.has(c.id));
    const pts = [];
    for (const c of A) {
      if (c === lca) break;
      const t = c.tunnel;
      for (let i = samples; i >= 0; i--) pts.push(bezierPoint(i / samples, t.x1, t.y1, t.cx, t.cy, t.x2, t.y2));
    }
    const down = [];
    for (const c of B) {
      if (c === lca) break;
      down.push(c);
    }
    for (let k = down.length - 1; k >= 0; k--) {
      const t = down[k].tunnel;
      for (let i = 0; i <= samples; i++) pts.push(bezierPoint(i / samples, t.x1, t.y1, t.cx, t.cy, t.x2, t.y2));
    }
    return pts;
  }
}

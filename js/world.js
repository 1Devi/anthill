'use strict';
// The surface world: terrain, pheromone fields, food, combat and random events.

class PheroMap {
  constructor(gw, gh) {
    this.gw = gw;
    this.gh = gh;
    this.d = new Float32Array(gw * gh);
  }

  idx(x, y) {
    if (x < 0 || y < 0) return -1;
    const cx = (x / CFG.CELL) | 0, cy = (y / CFG.CELL) | 0;
    if (cx >= this.gw || cy >= this.gh) return -1;
    return cy * this.gw + cx;
  }

  get(x, y) {
    const i = this.idx(x, y);
    return i < 0 ? 0 : this.d[i];
  }

  // Sum over the 3x3 neighbourhood: makes one-cell-wide trails easy to stay on.
  sample(x, y) {
    if (x < 0 || y < 0) return 0;
    const gw = this.gw, cx = (x / CFG.CELL) | 0, cy = (y / CFG.CELL) | 0;
    if (cx < 1 || cy < 1 || cx >= gw - 1 || cy >= this.gh - 1) return this.get(x, y);
    const d = this.d, i = cy * gw + cx;
    return d[i - gw - 1] + d[i - gw] + d[i - gw + 1] + d[i - 1] + d[i] + d[i + 1] + d[i + gw - 1] + d[i + gw] + d[i + gw + 1];
  }

  // Keep the strongest signal instead of accumulating, so gradients stay clean.
  mark(x, y, v) {
    const i = this.idx(x, y);
    if (i >= 0 && this.d[i] < v) this.d[i] = v;
  }

  // Radial blob; falloff 1 = linear to zero at the rim, 0 = flat.
  splat(x, y, r, v, falloff = 1) {
    const c = CFG.CELL;
    const x0 = Math.max(0, ((x - r) / c) | 0), x1 = Math.min(this.gw - 1, ((x + r) / c) | 0);
    const y0 = Math.max(0, ((y - r) / c) | 0), y1 = Math.min(this.gh - 1, ((y + r) / c) | 0);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const d = dist((cx + 0.5) * c, (cy + 0.5) * c, x, y);
        if (d > r) continue;
        const val = v * (1 - falloff * (d / r));
        const i = cy * this.gw + cx;
        if (this.d[i] < val) this.d[i] = val;
      }
    }
  }

  erase(x, y, r) {
    const c = CFG.CELL;
    const x0 = Math.max(0, ((x - r) / c) | 0), x1 = Math.min(this.gw - 1, ((x + r) / c) | 0);
    const y0 = Math.max(0, ((y - r) / c) | 0), y1 = Math.min(this.gh - 1, ((y + r) / c) | 0);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (dist2((cx + 0.5) * c, (cy + 0.5) * c, x, y) <= r * r) this.d[cy * this.gw + cx] = 0;
      }
    }
  }

  decay(f) {
    const d = this.d;
    for (let i = 0; i < d.length; i++) {
      if (d[i] === 0) continue;
      const v = d[i] * f;
      d[i] = v < 0.003 ? 0 : v;
    }
  }
}

// Seasons with their defaults filled in.
const SEASONS = CFG.SEASONS.map((s) => ({ regrow: 1, bloom: 0, rot: 0, speed: 1, upkeep: 1, lay: 1, cold: false, calm: false, ...s }));
const NATURAL_FOOD = new Set(['seeds', 'berries']);

const FOOD_KINDS = {
  seeds: 'Seeds',
  berries: 'Berries',
  sugar: 'Sugar',
  corpse: 'Remains',
  prey: 'Spider carcass',
  surplus: 'Surplus food', // left by the entrance while the colony's stores are full
};

let FOOD_ID = 1;

class FoodSource {
  constructor(x, y, amount, kind) {
    this.id = FOOD_ID++;
    this.x = x;
    this.y = y;
    this.amount = amount;
    this.max = amount;
    this.kind = kind;
    this.owner = null; // surplus piles: id of the colony that left it
    this.layout();
  }

  layout() {
    this.r0 = 2 + Math.sqrt(this.max) * 0.6;
    const n = clamp(Math.round(this.max / 4), 3, 80);
    this.crumbs = [];
    for (let i = 0; i < n; i++) {
      const ang = rand(0, TAU), rr = this.r0 * Math.sqrt(Math.random());
      this.crumbs.push({ x: Math.cos(ang) * rr, y: Math.sin(ang) * rr, rot: rand(0, TAU), v: Math.random(), d: rr });
    }
    this.crumbs.sort((a, b) => a.d - b.d);
  }

  get pickR() {
    return 3 + this.r0 * Math.sqrt(Math.max(0, this.amount) / this.max);
  }

  get visible() {
    return Math.ceil((this.crumbs.length * Math.max(0, this.amount)) / this.max);
  }

  get name() {
    return FOOD_KINDS[this.kind] || 'Food';
  }

  // A growing pile gets room to spare, so its crumbs are not re-laid on every addition.
  grow(n) {
    this.amount += n;
    if (this.amount > this.max) {
      this.max = Math.max(this.amount, this.max * 1.3);
      this.layout();
    }
  }
}

// Start-screen map options with defaults filled in. Peaceful games never have rivals.
function mapSettings(diff, s = {}) {
  const M = CFG.MAP, out = { ...M.defaults, ...s };
  for (const k of ['size', 'food', 'rocks']) if (!M[k][out[k]]) out[k] = M.defaults[k];
  out.rivals = diff.rival ? clamp(Math.round(out.rivals) || 0, 0, M.maxRivals) : 0;
  return out;
}

class World {
  constructor(opts = {}) {
    this.diffKey = opts.difficulty || 'normal';
    this.diff = CFG.DIFFICULTY[this.diffKey];
    this.settings = mapSettings(this.diff, opts.settings);
    // Saves carry their own size, so older, smaller maps still load.
    const size = CFG.MAP.size[this.settings.size];
    this.W = opts.W || size.W;
    this.H = opts.H || size.H;
    if (opts.W) {
      const k = Object.keys(CFG.MAP.size).find((key) => CFG.MAP.size[key].W === this.W && CFG.MAP.size[key].H === this.H);
      this.settings.size = k || 'custom';
    }
    this.foodMul = CFG.MAP.food[this.settings.food].mul;
    this.areaK = (this.W * this.H) / (1600 * 1000);
    this.gw = Math.ceil(this.W / CFG.CELL);
    this.gh = Math.ceil(this.H / CFG.CELL);
    this.seed = opts.seed ?? (Math.random() * 1e9) | 0;
    this.walls = new Uint8Array(this.gw * this.gh);
    this.wallsVersion = 0;
    this.wallDirty = []; // world-space rects the renderer must repaint
    this.foods = [];
    this.colonies = [];
    this.spiders = [];
    this.time = 0;
    this.tick = 0;
    this.events = [];
    this.sounds = []; // drained by the game each frame for audio
    this.hash = new SpatialHash(this.W, this.H, 24);
    this.rain = 0;
    this.nextRain = rand(200, 340);
    this.seasonT0 = 0; // when the first spring began (older saves start their seasons when loaded)
    this.season = SEASONS[0];
    this.seasonIdx = 0;
    this.winterWarned = false;
    this.rotT = 0;
    this.coldT = 0;
    this.spiderT = this.diff.spiders ? this.diff.spiderFirst : Infinity;
    this.foodSpawnT = this.regrowTime();
    this.feedCooldown = 0;
    this.stats = { kills: 0, spiders: 0 };
    this.result = null;
    this.victoryShown = false;
    this.speedMul = 1;
    this.player = null;
    this.rivals = [];
    this.rival = null; // the first rival, for code that only knows one
    // Chronicle: [t, ants, workers, soldiers, brood, food, foodCap, income/min, spent/min, rival ants]
    this.history = [];
    this.marks = []; // notable events for the chronicle: { t, kind, text }
    this.chronicleEvery = CFG.CHRONICLE.every;
    this.chronicleT = 0;
    this.generate();
  }

  log(text, kind = 'info') {
    this.events.push({ text, kind, time: this.time });
    if ((kind === 'danger' || kind === 'good') && this.marks.length < 400) this.marks.push({ t: this.time, kind, text });
  }

  // One chronicle sample; when the record gets long, keep every other sample and sample half as often.
  recordHistory() {
    const p = this.player, f = p.flows(), n = p.counts;
    const rivals = this.colonies.reduce((s, c) => s + (c.isPlayer ? 0 : c.ants.length), 0);
    this.history.push([Math.round(this.time), p.ants.length, n.workers, n.soldiers, p.brood.length, Math.round(p.food),
      p.caps.food, Math.round(f.income), Math.round(f.spent), rivals]);
    if (this.history.length > CFG.CHRONICLE.cap) {
      this.history = this.history.filter((_, i) => i % 2 === 0);
      this.chronicleEvery *= 2;
    }
  }

  // Queue a sound effect; x/y (optional) let the player attenuate it by distance from the camera.
  sfx(name, x, y) {
    if (this.sounds.length < 64) this.sounds.push({ name, x, y });
  }

  // ---------- generation ----------

  generate() {
    const noise = makeNoise2D(this.seed);
    const at = ([fx, fy]) => ({ x: this.W * fx, y: this.H * fy });
    const P = at(CFG.PLAYER_AT), types = CFG.RIVALS.slice(0, this.settings.rivals);
    const nests = [P, ...types.map((t) => at(t.at))];
    const C = CFG.CELL, rock = CFG.MAP.rocks[this.settings.rocks].threshold;
    for (let cy = 0; cy < this.gh; cy++) {
      for (let cx = 0; cx < this.gw; cx++) {
        const x = (cx + 0.5) * C, y = (cy + 0.5) * C;
        let near = Infinity;
        for (const n of nests) near = Math.min(near, dist(x, y, n.x, n.y));
        if (near < 110) continue;
        const v = noise.fbm(x * 0.0042, y * 0.0042, 4) - Math.max(0, (150 - near) / 400);
        if (v > rock) this.walls[cy * this.gw + cx] = 1;
      }
    }

    this.player = new Colony(this, { id: 0, name: 'Your colony', adj: 'your', isPlayer: true, palette: 'player', x: P.x, y: P.y, ...this.diff.player });
    this.colonies.push(this.player);
    // Rivals start raiding one after another rather than all at once.
    this.rivals = types.map((t, i) => new Colony(this, {
      id: i + 1, name: t.name, adj: t.adj, palette: t.palette, ...nests[i + 1], ...this.diff.ai,
      raidGrace: this.diff.ai.raidGrace + i * CFG.RIVAL_STAGGER,
    }));
    this.colonies.push(...this.rivals);
    this.rival = this.rivals[0] || null;

    for (let i = 0; i < 3; i++) this.placeFoodNear(P.x, P.y, 120, 250, chance(0.7) ? 'seeds' : 'berries');
    for (const r of this.rivals) for (let i = 0; i < 2; i++) this.placeFoodNear(r.x, r.y, 120, 250, 'seeds');
    for (let i = 0; i < Math.round(5 * this.areaK * this.foodMul); i++) this.spawnNaturalFood();
  }

  // Seconds until the next natural pile appears: the same rate per area on every map size.
  regrowTime() {
    return rand(CFG.FOOD_REGROW[0], CFG.FOOD_REGROW[1]) / this.areaK;
  }

  spotFree(x, y, r = 10) {
    if (x < 30 || y < 30 || x > this.W - 30 || y > this.H - 30) return false;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      if (this.isWall(x + Math.cos(a) * r, y + Math.sin(a) * r)) return false;
    }
    return !this.isWall(x, y);
  }

  placeFoodNear(cx, cy, dmin, dmax, kind) {
    for (let t = 0; t < 80; t++) {
      const a = rand(0, TAU), d = rand(dmin, dmax);
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      if (this.spotFree(x, y, 14)) return this.addFood(x, y, randInt(180, 300), kind, false);
    }
    return null;
  }

  spawnNaturalFood() {
    for (let t = 0; t < 80; t++) {
      const x = rand(40, this.W - 40), y = rand(40, this.H - 40);
      if (this.colonies.some((c) => dist(x, y, c.x, c.y) < 140)) continue;
      if (this.spotFree(x, y, 14)) {
        const amount = Math.round(randInt(CFG.FOOD_PILE[0], CFG.FOOD_PILE[1]) * this.foodMul);
        return this.addFood(x, y, amount, chance(0.6) ? 'seeds' : 'berries', false);
      }
    }
    return null;
  }

  // ---------- queries ----------

  isWall(x, y) {
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return true;
    return this.walls[((y / CFG.CELL) | 0) * this.gw + ((x / CFG.CELL) | 0)] === 1;
  }

  // Nearest food within r. A colony's ants leave its own surplus pile alone while its stores are full.
  nearestFood(x, y, r, col) {
    let best = null, bd = Infinity;
    for (const f of this.foods) {
      if (f.amount <= 0 || (col && f.owner === col.id && col.full)) continue;
      const lim = r + f.r0;
      const d = dist2(x, y, f.x, f.y);
      if (d < lim * lim && d < bd) {
        bd = d;
        best = f;
      }
    }
    return best;
  }

  // Something that can still be fought: alive, on the surface and inside the map.
  targetable(e) {
    return !!e && !e.dead && !e.gone && !e.inside && e.x >= 0 && e.y >= 0 && e.x <= this.W && e.y <= this.H;
  }

  findEnemy(ent, r) {
    let best = null, bd = r * r;
    this.hash.query(ent.x, ent.y, r, (e) => {
      if (e === ent || e.colony === ent.colony || !this.targetable(e)) return;
      const d = dist2(ent.x, ent.y, e.x, e.y);
      if (d < bd) {
        bd = d;
        best = e;
      }
    });
    return best;
  }

  pickAt(x, y) {
    let best = null, bd = 12 * 12;
    this.hash.query(x, y, 16, (e) => {
      const d = dist2(x, y, e.x, e.y);
      const lim = e.isSpider ? (e.r + 6) ** 2 : 12 * 12;
      if (d < lim && d < bd) {
        bd = d;
        best = e;
      }
    });
    if (best) return best.isSpider ? { type: 'spider', obj: best } : { type: 'ant', obj: best };
    for (const c of this.colonies) if (dist(x, y, c.x, c.y) < 26) return { type: 'colony', obj: c };
    for (const f of this.foods) if (dist(x, y, f.x, f.y) < f.r0 + 5) return { type: 'food', obj: f };
    return null;
  }

  // The season now: which one, how far into it (0..1), seconds left and the year.
  seasonInfo() {
    const len = CFG.SEASON_DAYS * CFG.DAY_LENGTH, t = Math.max(0, this.time - this.seasonT0);
    const k = Math.floor(t / len), i = k % SEASONS.length;
    return {
      i, def: SEASONS[i], prev: SEASONS[(i + SEASONS.length - 1) % SEASONS.length], next: SEASONS[(i + 1) % SEASONS.length],
      frac: (t % len) / len, left: len - (t % len), len, year: Math.floor(k / SEASONS.length) + 1, first: k === 0,
    };
  }

  // Catch up with the current season without announcing it (new game, loaded save).
  syncSeason() {
    const s = this.seasonInfo();
    this.season = s.def;
    this.seasonIdx = s.i;
    this.winterWarned = s.def.cold || (s.i === SEASONS.length - 2 && s.frac >= 0.5);
  }

  updateSeason() {
    const s = this.seasonInfo(), d = s.def;
    this.season = d;
    if (s.i !== this.seasonIdx) {
      this.seasonIdx = s.i;
      this.winterWarned = d.cold;
      this.log(d.news, d.cold ? 'warn' : 'info');
      if (d.calm) {
        for (const sp of this.spiders) {
          sp.state = 'leave';
          sp.target = null;
        }
      }
      // Spring bloom: the meadow sprouts fresh food at once.
      const cap = CFG.NATURAL_FOOD * this.areaK * this.foodMul;
      for (let i = 0; i < Math.round(d.bloom * this.areaK * this.foodMul); i++) {
        if (this.foods.filter((f) => NATURAL_FOOD.has(f.kind)).length >= cap) break;
        this.spawnNaturalFood();
      }
    } else if (!this.winterWarned && SEASONS[(s.i + 1) % SEASONS.length].cold && s.frac >= 0.5) {
      this.winterWarned = true;
      this.log('Winter comes tomorrow — fill the granaries.', 'warn');
    }
  }

  dayInfo() {
    const t = this.time / CFG.DAY_LENGTH + 0.3;
    const frac = t % 1;
    const light = clamp(Math.sin((frac - 0.25) * TAU) * 1.5 + 0.5, 0, 1);
    const mins = Math.floor(frac * 24 * 60);
    return { day: Math.floor(t - 0.3) + 1, hour: Math.floor(mins / 60), minute: mins % 60, light, night: 1 - light };
  }

  // ---------- edits ----------

  paintWalls(x, y, r, val) {
    const C = CFG.CELL;
    const x0 = Math.max(0, ((x - r) / C) | 0), x1 = Math.min(this.gw - 1, ((x + r) / C) | 0);
    const y0 = Math.max(0, ((y - r) / C) | 0), y1 = Math.min(this.gh - 1, ((y + r) / C) | 0);
    let changed = false;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const px = (cx + 0.5) * C, py = (cy + 0.5) * C;
        if (dist2(px, py, x, y) > r * r) continue;
        if (val && this.colonies.some((c) => dist(px, py, c.x, c.y) < CFG.NEST_R + 22)) continue;
        const i = cy * this.gw + cx;
        if (this.walls[i] !== val) {
          this.walls[i] = val;
          changed = true;
        }
      }
    }
    if (changed) {
      this.wallsVersion++;
      this.wallDirty.push([x - r, y - r, x + r, y + r]);
    }
  }

  addFood(x, y, amount, kind, merge = true) {
    if (merge) {
      for (const f of this.foods) {
        if (f.kind === kind && f.amount > 0 && dist2(x, y, f.x, f.y) < 100) {
          f.grow(amount);
          return f;
        }
      }
    }
    const f = new FoodSource(x, y, amount, kind);
    this.foods.push(f);
    return f;
  }

  spawnSpider() {
    const power = 1 + this.time / 900;
    const side = randInt(0, 3);
    const x = side === 0 ? -15 : side === 1 ? this.W + 15 : rand(60, this.W - 60);
    const y = side === 2 ? -15 : side === 3 ? this.H + 15 : rand(60, this.H - 60);
    const s = new Spider(x, y, power);
    s.a = Math.atan2(this.H / 2 - y, this.W / 2 - x);
    this.spiders.push(s);
    this.stats.spiders++;
  }

  // ---------- simulation ----------

  update(dt) {
    this.time += dt;
    this.tick++;
    this.updateSeason();

    if (this.tick % CFG.PHERO_EVAP_EVERY === 0) {
      const step = dt * CFG.PHERO_EVAP_EVERY * (this.rain > 0 ? 4 : 1);

      const fa = Math.pow(0.5, step / CFG.PHERO.alarm.halfLife);
      for (const c of this.colonies) {
        c.home.decay(Math.pow(0.5, step / (CFG.PHERO.home.halfLife * c.mods.trail)));
        c.foodP.decay(Math.pow(0.5, step / (CFG.PHERO.food.halfLife * c.mods.trail)));
        c.alarm.decay(fa);
      }
    }

    this.hash.clear();
    for (const c of this.colonies) {
      for (const a of c.ants) if (!a.dead && !a.inside) this.hash.insert(a);
    }
    for (const s of this.spiders) if (!s.dead) this.hash.insert(s);

    for (const c of this.colonies) {
      const ants = c.ants;
      for (let i = 0; i < ants.length; i++) if (!ants[i].dead) ants[i].update(dt, this);
    }
    for (const s of this.spiders) if (!s.dead) s.update(dt, this);

    this.combat(dt);

    for (const c of this.colonies) c.update(dt);
    this.spiders = this.spiders.filter((s) => !s.dead && !s.gone);
    this.foods = this.foods.filter((f) => f.amount > 0.001);

    this.updateEvents(dt);
    this.chronicleT -= dt;
    if (this.chronicleT <= 0) {
      this.chronicleT += this.chronicleEvery;
      this.recordHistory();
    }
    this.checkResult();
  }

  combat(dt) {
    const STEP = 3, sdt = dt * STEP, tick = this.tick;
    for (const col of this.colonies) {
      for (const ant of col.ants) {
        if (ant.dead || ant.inside || (tick + ant.id) % STEP) continue;
        const reach = ant.caste === 'soldier' ? 8 : 6;
        let foe = null, best = Infinity;
        this.hash.query(ant.x, ant.y, reach + 12, (e) => {
          if (e.dead || e.colony === col) return;
          const rr = e.isSpider ? reach + e.r : reach;
          const d = dist2(ant.x, ant.y, e.x, e.y);
          if (d < rr * rr && d < best) {
            best = d;
            foe = e;
          }
        });
        if (foe) {
          foe.damage(ant.dmg * sdt, ant, this);
          // Against a spider, bite on the move: stopping for long lets it walk away.
          ant.fightT = foe.isSpider ? 0.1 : 0.3;
          ant.a = Math.atan2(foe.y - ant.y, foe.x - ant.x);
        } else if (ant.caste === 'soldier') {
          for (const other of this.colonies) {
            if (other === col || !other.alive) continue;
            if (dist2(ant.x, ant.y, other.x, other.y) < (CFG.NEST_R + 6) ** 2) {
              other.hurtQueen(ant.dmg * CFG.RAID_DMG * sdt, col);
              ant.fightT = 0.3;
            }
          }
        }
      }
    }
  }

  updateEvents(dt) {
    const season = this.season;
    if (this.diff.spiders && !season.calm) {
      this.spiderT -= dt;
      if (this.spiderT <= 0) {
        const n = 1 + Math.floor(this.time / 600);
        for (let i = 0; i < n; i++) this.spawnSpider();
        this.log(n > 1 ? `${n} spiders are on the hunt!` : 'A spider is on the hunt!', 'danger');
        this.sfx('spider');
        this.spiderT = rand(this.diff.spiderEvery[0], this.diff.spiderEvery[1]);
      }
    }

    // Natural food regrows with the season (not at all in winter).
    this.foodSpawnT -= dt * season.regrow;
    if (this.foodSpawnT <= 0) {
      this.foodSpawnT = this.regrowTime();
      const natural = this.foods.filter((f) => NATURAL_FOOD.has(f.kind)).length;
      if (natural < CFG.NATURAL_FOOD * this.areaK * this.foodMul) this.spawnNaturalFood();
    }
    // Winter: seeds and berries left on the meadow slowly rot away.
    this.rotT += dt;
    if (this.rotT >= 1) {
      if (season.rot) {
        for (const f of this.foods) {
          if (!NATURAL_FOOD.has(f.kind)) continue;
          f.amount -= f.amount * season.rot * this.rotT;
          if (f.amount < 4) f.amount = 0;
        }
      }
      this.rotT = 0;
    }
    if (season.cold) this.freeze(dt);

    if (this.rain > 0) {
      this.rain -= dt;
      if (this.rain <= 0) this.log(season.cold ? 'The snowstorm is over.' : 'The rain has stopped.', 'info');
    } else {
      this.nextRain -= dt;
      if (this.nextRain <= 0) {
        this.rain = rand(18, 30);
        this.nextRain = rand(220, 380);
        this.log(season.cold ? 'A snowstorm! Trails are buried under the snow.' : 'Rain! Pheromone trails are washing away.', 'warn');
      }
    }
    this.speedMul = (this.rain > 0 ? 0.85 : 1) * season.speed;
    if (this.feedCooldown > 0) this.feedCooldown -= dt;
  }

  // Winter cold: ants far from their own nest slowly lose health.
  freeze(dt) {
    this.coldT -= dt;
    if (this.coldT > 0) return;
    this.coldT += 0.5;
    const r2 = CFG.COLD.range ** 2, hurt = CFG.COLD.dmg * 0.5;
    let freezing = 0;
    for (const c of this.colonies) {
      for (const a of c.ants) {
        if (a.dead || a.inside || dist2(a.x, a.y, c.x, c.y) < r2) continue;
        a.hp -= hurt;
        a.hitT = 0.15;
        if (a.hp <= 0) a.die(this);
        if (c.isPlayer) freezing++;
      }
    }
    if (freezing >= 3) this.player.warn('cold', 'Your ants are freezing far from the nest.', 'warn', 90);
  }

  checkResult() {
    if (this.result) return;
    const p = this.player;
    if (!p.alive) {
      this.result = { win: false, title: 'The queen has fallen', text: 'Without a queen the colony cannot survive.' };
    } else if (p.ants.length === 0 && p.brood.length === 0 && p.food < CFG.CASTE.worker.cost) {
      this.result = { win: false, title: 'The colony has died out', text: 'No workers left and no food to raise new ones.' };
    } else if (this.rivals.length && !this.victoryShown && this.rivals.every((r) => !r.alive)) {
      this.victoryShown = true;
      const who = this.rivals.length === 1 ? `The ${this.rivals[0].adj} queen is dead.` : 'Every rival queen is dead.';
      this.result = { win: true, title: 'Victory!', text: `${who} The meadow belongs to your colony.` };
    }
  }
}

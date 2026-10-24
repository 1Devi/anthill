'use strict';
// Colony economy: food, upkeep, the queen, brood, task allocation, research and rival AI.

const NEXT_STAGE = { egg: 'larva', larva: 'pupa', pupa: null };
const newLedger = () => ({ gathered: 0, farmed: 0, eaten: 0, eggs: 0, digging: 0, research: 0, surplus: 0 });
// Multipliers changed by research (zone is a level count, not a multiplier).
const BASE_MODS = { dmg: 1, hp: 1, soldier: 1, speed: 1, sense: 1, trail: 1, carry: 1, lay: 1, dev: 1, life: 1, dig: 1, farm: 1, zone: 0 };
const RESEARCH_BY_ID = Object.fromEntries(CFG.RESEARCH.map((r) => [r.id, r]));
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

function techName(id, level) {
  const r = RESEARCH_BY_ID[id];
  return r.cost.length > 1 ? `${r.name} ${ROMAN[level]}` : r.name;
}

class Colony {
  constructor(w, o) {
    this.w = w;
    this.id = o.id;
    this.name = o.name;
    this.adj = o.adj || ''; // 'red', 'amber', … for messages
    this.isPlayer = !!o.isPlayer;
    this.palette = o.palette;
    this.x = o.x;
    this.y = o.y;
    this.home = new PheroMap(w.gw, w.gh);
    this.foodP = new PheroMap(w.gw, w.gh);
    this.alarm = new PheroMap(w.gw, w.gh);
    this.food = o.food;
    this.ants = [];
    this.brood = [];
    this.queen = { hp: CFG.QUEEN.hp, maxHp: CFG.QUEEN.hp };
    this.alive = true;
    this.foragerRatio = 0.75;
    this.soldierRatio = o.soldierRatio ?? 0.15;
    this.forageMul = o.forageMul ?? 1; // difficulty handicap for the rival AI
    this.buildShare = CFG.BUILD_SHARE; // share of incoming food earmarked for digging and research
    this.buildFund = 0;
    this.autoLay = true;
    this.layT = 2;
    this.balanceT = 0;
    this.rally = null;
    this.underAttackT = 0;
    this.starving = false;
    this.upkeep = 0;
    this.nursing = 1;
    this.diggers = 0;
    this.gardeners = 0;
    this.nurses = 0;
    this.farmRate = 0;
    this.warnT = {};
    this.stats = { collected: 0, born: 0, died: 0, peak: 0 };
    this.ledger = newLedger(); // food flows during the current second
    this.history = []; // per-second ledgers for the last minute
    this.ledgerT = 1;
    this.counts = {};
    this.tech = Object.fromEntries(CFG.RESEARCH.map((r) => [r.id, 0]));
    this.researching = null; // { id, t, total }
    this.mods = { ...BASE_MODS };
    this.nest = this.isPlayer ? new Nest(this) : null;
    this.aiCaps = { food: 250, brood: 8, pop: 40 };
    this.aiT = 2;
    this.aiGrowT = 40;
    this.aiResearchT = o.researchEvery || Infinity;
    this.raidGrace = o.raidGrace ?? Infinity; // no raids before this game time
    this.raids = 0;
    for (let i = 0; i < (o.workers || 0); i++) this.spawnAnt('worker', true);
    for (let i = 0; i < (o.soldiers || 0); i++) this.spawnAnt('soldier', true);
    this.recount();
  }

  get caps() {
    return this.nest ? this.nest.caps : this.aiCaps;
  }

  // Steps (grid cells) from every free cell to the nest around the rocks, for soldiers heading home.
  // Rebuilt when rocks change, at most once a second.
  homeField() {
    const w = this.w;
    if (this.field && (this.fieldWalls === w.wallsVersion || w.time - this.fieldT < 1)) return this.field;
    const gw = w.gw, gh = w.gh, n = gw * gh, walls = w.walls;
    const f = this.field && this.field.length === n ? this.field : new Uint16Array(n);
    f.fill(65535);
    const q = new Int32Array(n);
    const start = clamp((this.y / CFG.CELL) | 0, 0, gh - 1) * gw + clamp((this.x / CFG.CELL) | 0, 0, gw - 1);
    let head = 0, tail = 0;
    f[start] = 0;
    q[tail++] = start;
    while (head < tail) {
      const i = q[head++], cx = i % gw, cy = (i / gw) | 0, d = f[i] + 1;
      for (let dy = -1; dy <= 1; dy++) {
        const y = cy + dy;
        if (y < 0 || y >= gh) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const x = cx + dx, j = y * gw + x;
          if (x < 0 || x >= gw || f[j] <= d || walls[j]) continue;
          f[j] = d;
          q[tail++] = j;
        }
      }
    }
    this.field = f;
    this.fieldWalls = w.wallsVersion;
    this.fieldT = w.time;
    return f;
  }

  spawnAnt(caste, initial = false) {
    const a = new Ant(this, caste, this.x + rand(-5, 5), this.y + rand(-5, 5));
    if (initial) a.age = rand(0, a.life * 0.5);
    else a.pickExitHeading();
    this.ants.push(a);
    return a;
  }

  get full() {
    return this.food >= this.caps.food - 0.5;
  }

  // Food enters the stores; foraged food gets the difficulty multiplier, farmed food does not. What the
  // stores can't hold, foragers leave in a pile by the entrance, to carry in once there is room; full
  // gardens simply grow nothing more. Only what is actually stored counts as income.
  addFood(n, source = 'gathered') {
    if (source === 'gathered') n *= this.forageMul;
    const stored = Math.min(n, Math.max(0, this.caps.food - this.food)), extra = n - stored;
    if (extra > 0.001) {
      if (source === 'gathered') this.dropSurplus(extra);
      if (this.isPlayer) this.warn('full', 'Food stores are full: the surplus piles up by the entrance. Dig a Granary.', 'warn', 40);
    }
    if (this.hasProjects()) this.buildFund = Math.min(CFG.BUILD_FUND_CAP, this.buildFund + stored * this.buildShare);
    this.stats.collected += stored;
    this.ledger[source] += stored;
    this.food += stored;
  }

  // The surplus pile sits just outside the entrance, on the side facing the middle of the meadow.
  dropSurplus(n) {
    const w = this.w, a = Math.atan2(w.H / 2 - this.y, w.W / 2 - this.x);
    const f = w.addFood(this.x + Math.cos(a) * 20, this.y + Math.sin(a) * 20, n, 'surplus');
    f.owner = this.id;
    this.ledger.surplus += n;
  }

  storeFood(n) {
    this.addFood(n, 'gathered');
  }

  warn(key, text, kind, interval) {
    if ((this.warnT[key] || 0) > 0) return;
    this.warnT[key] = interval;
    this.w.log(text, kind);
  }

  hurtQueen(amount, by) {
    this.queen.hp -= amount * (1 - Math.min(0.75, this.caps.guard || 0));
    this.underAttackT = 2;
    this.alarm.splat(this.x, this.y, 150, 1);
    if (this.isPlayer) {
      this.warn('raid', 'Enemies are attacking your queen!', 'danger', 10);
      this.w.sfx('alarm');
    } else if (by && by.isPlayer) this.warn('raided', `Your soldiers are storming the ${this.adj} nest!`, 'good', 15);
  }

  setRally(x, y) {
    for (const c of this.w.colonies) {
      if (c !== this && c.alive && dist(x, y, c.x, c.y) < 50) {
        this.rally = { x: c.x, y: c.y, raid: true, target: c };
        return;
      }
    }
    this.rally = { x, y, raid: false };
  }

  // ---------- research ----------

  applyResearch() {
    const m = { ...BASE_MODS };
    for (const r of CFG.RESEARCH) {
      const lvl = this.tech[r.id] || 0;
      for (const k in r.mod) m[k] += r.mod[k] * lvl;
    }
    this.mods = m;
    for (const a of this.ants) a.applyMods();
  }

  researchSpeed() {
    const halls = this.caps.halls || 0;
    return halls ? 1 + CFG.RESEARCH_HALL_BONUS * (halls - 1) : 0;
  }

  // Why a research can't start right now, or null if it can.
  canResearch(id) {
    const r = RESEARCH_BY_ID[id], lvl = this.tech[id];
    if (lvl >= r.cost.length) return 'Fully researched';
    if (!this.caps.halls) return 'Needs a Scent Hall';
    for (const k in r.req || {}) if (this.tech[k] < r.req[k]) return `Needs ${techName(k, r.req[k])}`;
    if (r.reqChamber && this.nest && !this.nest.has(r.reqChamber)) return `Needs a ${CFG.CHAMBERS[r.reqChamber].name}`;
    if (this.researching) return 'Already researching';
    return null;
  }

  startResearch(id) {
    const why = this.canResearch(id);
    if (why) return why;
    this.researching = { id, t: 0, total: RESEARCH_BY_ID[id].time[this.tech[id]], paid: 0, stalled: false };
    return null;
  }

  // Food already spent on a cancelled research is lost.
  cancelResearch() {
    this.researching = null;
  }

  updateResearch(dt) {
    const cur = this.researching;
    if (!cur) return;
    // Like digging, research is paid for as it runs and pauses when the stores are empty.
    const cost = RESEARCH_BY_ID[cur.id].cost[this.tech[cur.id]];
    let step = dt * this.researchSpeed();
    const price = (cost * step) / cur.total;
    if (price > this.buildSpendable()) step *= this.buildSpendable() / price;
    const paid = (cost * step) / cur.total;
    this.payForBuilding(paid, 'research');
    cur.paid = (cur.paid || 0) + paid;
    cur.stalled = step <= 0;
    cur.t += step;
    if (cur.t < cur.total) return;
    this.tech[cur.id]++;
    this.researching = null;
    this.applyResearch();
    if (this.isPlayer) {
      this.w.log(`Research complete: ${techName(cur.id, this.tech[cur.id])}.`, 'good');
      this.w.sfx('build');
    }
  }

  // ---------- eggs ----------

  canLay(caste) {
    if (!this.alive) return 'The queen is dead';
    if (this.brood.length >= this.caps.brood) return 'Brood slots are full';
    if (this.ants.length + this.brood.length >= this.caps.pop) return 'Population cap reached';
    const cost = CFG.CASTE[caste].cost;
    if (this.food < cost) return `Needs ${cost} food`;
    return null;
  }

  layEgg(caste) {
    const why = this.canLay(caste);
    if (why) return why;
    this.food -= CFG.CASTE[caste].cost;
    this.ledger.eggs += CFG.CASTE[caste].cost;
    this.brood.push({ caste, stage: 'egg', t: 0, id: ENTITY_ID++ });
    return null;
  }

  nextCaste() {
    const n = this.counts;
    if (n.workers + n.broodWorkers < 3) return 'worker';
    const total = this.ants.length + this.brood.length;
    return (n.soldiers + n.broodSoldiers) / total < this.soldierRatio ? 'soldier' : 'worker';
  }

  // Food kept back for eating: eggs, digging and research only use what lies above it.
  layReserve() {
    return this.upkeep * CFG.RESERVE_SECONDS;
  }

  hasProjects() {
    return !!(this.researching || (this.nest && this.nest.job));
  }

  // Food kept back from eggs for the winter, as real colonies do: through autumn the colony builds up
  // what the winter will eat, and in winter it keeps what the rest of it needs. Digging and research
  // may still use it.
  winterStock() {
    const s = this.w.seasonInfo();
    let need = 0;
    if (s.def.cold) need = this.upkeep * s.left;
    else if (s.next.cold) need = this.upkeep * s.next.upkeep * s.len * s.frac;
    return Math.min(need, this.caps.food * CFG.WINTER_STOCK);
  }

  // While something is being dug or researched, a share of income is set aside for it (buildFund);
  // eggs may only use the rest. Plenty of stored food is free for both.
  eggSpendable() {
    return this.food - this.layReserve() - this.buildFund - this.winterStock();
  }

  buildSpendable() {
    const free = this.food - this.layReserve();
    return Math.max(0, Math.min(this.buildFund, free), free - CFG.BUILD_FREE_ABOVE);
  }

  payForBuilding(amount, kind) {
    this.food -= amount;
    this.buildFund = Math.max(0, this.buildFund - amount);
    this.ledger[kind] += amount;
  }

  updateLaying(dt) {
    this.layT -= dt;
    if (!this.autoLay || this.layT > 0) return;
    this.layT = 0.5;
    const caste = this.nextCaste();
    const why = this.canLay(caste);
    if (why) {
      if (!this.isPlayer) return;
      if (why === 'Brood slots are full') this.warn('brood', 'Brood slots are full — dig a Nursery.', 'warn', 90);
      else if (why === 'Population cap reached') this.warn('pop', 'Population cap reached — dig Living Quarters.', 'warn', 90);
      return;
    }
    if (this.eggSpendable() < CFG.CASTE[caste].cost) return;
    this.layEgg(caste);
    this.layT = CFG.QUEEN.layInterval / (this.mods.lay * this.w.season.lay);
  }

  updateBrood(dt) {
    this.nursing = 0.35 + 0.65 * Math.min(1, this.nurses / Math.max(1, this.brood.length * 0.4));
    for (let i = this.brood.length - 1; i >= 0; i--) {
      const b = this.brood[i];
      b.t += dt * this.nursing * this.mods.dev;
      if (b.t < CFG.BROOD[b.stage]) continue;
      b.t = 0;
      const next = NEXT_STAGE[b.stage];
      if (next) {
        b.stage = next;
      } else {
        this.brood.splice(i, 1);
        const a = this.spawnAnt(b.caste);
        // Fresh workers start on nest duty when it is short-handed.
        if (a.caste === 'worker' && this.counts.inside + this.counts.goingIn < this.desiredInside()) {
          a.inside = true;
          this.counts.inside++;
        }
        this.stats.born++;
        if (this.isPlayer) this.w.sfx('hatch');
      }
    }
  }

  // ---------- task allocation ----------

  // Split the workers inside between digging, tending gardens and nursing brood.
  allocate() {
    const inside = this.counts.inside;
    this.diggers = this.nest && this.nest.job ? Math.ceil(inside * 0.5) : 0;
    const free = inside - this.diggers;
    const need = this.caps.gardeners || 0;
    // With brood to care for, gardens get at most 60% of the remaining hands.
    this.gardeners = Math.min(need, this.brood.length ? Math.floor(free * 0.6) : free);
    this.nurses = free - this.gardeners;
  }

  desiredInside() {
    return Math.round(this.counts.workers * (1 - this.foragerRatio));
  }

  // Age roles, as in real colonies: young workers take the nest jobs, old ones forage.
  // This also keeps nest staff from dying of old age all at once.
  balance() {
    const n = this.counts, desired = this.desiredInside();
    const ageOf = (a) => a.age / a.life;
    const total = n.inside + n.goingIn;
    if (total < desired) {
      const pool = this.ants.filter((a) => a.caste === 'worker' && !a.inside && !a.wantInside && !a.carry);
      pool.sort((x, y) => ageOf(x) - ageOf(y));
      for (const a of pool.slice(0, Math.min(3, desired - total))) a.wantInside = true;
    } else if (total > desired && this.underAttackT <= 0) {
      // Send the oldest nest workers out first; only then call back ants still on their way in.
      // (Never during an attack: they are safe inside.)
      let extra = Math.min(3, total - desired);
      const inside = this.ants.filter((a) => a.inside).sort((x, y) => ageOf(y) - ageOf(x));
      for (const a of inside.slice(0, extra)) this.sendOut(a);
      extra -= Math.min(extra, inside.length);
      for (const a of this.ants) {
        if (extra <= 0) break;
        if (a.wantInside && !a.inside) {
          a.wantInside = false;
          a.state = 'search';
          extra--;
        }
      }
    } else if (desired > 0) {
      // Retirement: when a nest worker grows old, call in a young forager; the overshoot then sends the old one out.
      const oldest = this.ants.reduce((o, a) => (a.inside && (!o || ageOf(a) > ageOf(o)) ? a : o), null);
      if (oldest && ageOf(oldest) > 0.7) {
        const young = this.ants.reduce((y, a) => (a.caste === 'worker' && !a.inside && !a.wantInside && !a.carry &&
          ageOf(a) < 0.4 && (!y || ageOf(a) < ageOf(y)) ? a : y), null);
        if (young) young.wantInside = true;
      }
    }
    if (this.isPlayer && n.inside + n.goingIn === 0 && (this.caps.gardeners || this.brood.length || (this.nest && this.nest.job))) {
      this.warn('nobody', 'Nobody works inside the nest: brood, gardens and digging are idle. Lower the Foragers share.', 'warn', 120);
    }
  }

  sendOut(a) {
    a.inside = false;
    a.x = this.x + rand(-4, 4);
    a.y = this.y + rand(-4, 4);
    a.pickExitHeading();
    a.state = 'search';
    a.tHome = 0;
  }

  recount() {
    const n = (this.counts = {
      workers: 0, soldiers: 0, inside: 0, goingIn: 0, foragers: 0,
      eggs: 0, larvae: 0, pupae: 0, broodSoldiers: 0, broodWorkers: 0,
    });
    for (const a of this.ants) {
      if (a.caste === 'soldier') n.soldiers++;
      else {
        n.workers++;
        if (a.inside) n.inside++;
        else if (a.wantInside) n.goingIn++;
      }
    }
    n.foragers = n.workers - n.inside;
    for (const b of this.brood) {
      if (b.stage === 'egg') n.eggs++;
      else if (b.stage === 'larva') n.larvae++;
      else n.pupae++;
      if (b.caste === 'soldier') n.broodSoldiers++;
      else n.broodWorkers++;
    }
    return n;
  }

  // ---------- chambers at work ----------

  updateFarms(dt) {
    const c = this.caps;
    this.farmRate = 0;
    if (!c.farm) return;
    const tended = 0.25 + 0.75 * Math.min(1, this.gardeners / c.gardeners);
    this.farmRate = c.farm * this.mods.farm * tended; // food per minute
    this.addFood((this.farmRate / 60) * dt, 'farmed');
  }

  updateHealing(dt) {
    const heal = this.caps.heal;
    if (!heal) return;
    const r2 = (CFG.NEST_R * 4) ** 2;
    for (const a of this.ants) {
      if (a.hp < a.maxHp && (a.inside || dist2(a.x, a.y, this.x, this.y) < r2)) a.hp = Math.min(a.maxHp, a.hp + heal * dt);
    }
  }

  // ---------- main update ----------

  update(dt) {
    const w = this.w;
    if (this.underAttackT > 0) this.underAttackT -= dt;
    for (const k in this.warnT) this.warnT[k] -= dt;

    let j = 0;
    for (let i = 0; i < this.ants.length; i++) if (!this.ants[i].dead) this.ants[j++] = this.ants[i];
    this.ants.length = j;

    const n = this.recount();
    let upkeep = this.alive ? CFG.QUEEN.upkeep : 0;
    for (const a of this.ants) upkeep += CFG.CASTE[a.caste].upkeep;
    upkeep += n.larvae * CFG.BROOD.larvaUpkeep;
    upkeep *= w.season.upkeep; // everyone eats less in the winter torpor
    this.upkeep = upkeep;
    this.ledger.eaten += Math.min(this.food, upkeep * dt);
    this.food -= upkeep * dt;
    this.starving = this.food < 0;
    // Set-aside food is released when nothing needs it, and can never exceed what is stored.
    if (!this.hasProjects()) this.buildFund = 0;
    this.buildFund = Math.min(this.buildFund, Math.max(0, this.food));
    if (this.starving) {
      this.food = 0;
      for (const a of this.ants) {
        a.hp -= CFG.STARVE_DMG * dt * Math.random() * 2;
        if (a.hp <= 0) a.die(w);
      }
      if (this.isPlayer) this.warn('starve', 'The colony is starving!', 'danger', 15);
    }

    if (this.alive) {
      if (this.starving) this.queen.hp -= CFG.QUEEN.starve * dt;
      if (this.queen.hp <= 0) {
        this.queen.hp = 0;
        this.alive = false;
        this.brood.length = 0;
        this.rally = null;
        this.researching = null;
        if (this.isPlayer) w.log('Your queen has died!', 'danger');
        else {
          const left = w.rivals.filter((r) => r.alive).length;
          const more = left ? ` ${left} rival ${left > 1 ? 'colonies remain' : 'colony remains'}.` : '';
          w.log(`The ${this.adj} queen is dead!${more}`, 'good');
        }
      } else if (!this.starving) {
        this.queen.hp = Math.min(this.queen.maxHp, this.queen.hp + CFG.QUEEN.regen * dt);
      }
    }

    this.allocate();
    if (this.alive) {
      this.updateLaying(dt);
      this.updateBrood(dt);
      this.updateResearch(dt);
    }
    this.updateFarms(dt);
    this.updateHealing(dt);

    this.balanceT -= dt;
    if (this.balanceT <= 0) {
      this.balanceT = 1;
      this.balance();
    }

    if (this.nest) this.nest.update(dt, this.diggers, this.mods.dig);
    else if (this.alive) this.updateAI(dt);

    this.stats.peak = Math.max(this.stats.peak, this.ants.length);

    this.ledgerT -= dt;
    if (this.ledgerT <= 0) {
      this.ledgerT += 1;
      this.history.push(this.ledger);
      if (this.history.length > 60) this.history.shift();
      this.ledger = newLedger();
    }
  }

  // Food flows over the last minute (or less, early on), as per-minute rates.
  flows() {
    const out = newLedger(), n = this.history.length;
    for (const e of this.history) for (const k in out) out[k] += e[k];
    for (const k in out) out[k] *= n ? 60 / n : 0;
    out.upkeep = this.upkeep * 60; // what the colony eats right now
    out.income = out.gathered + out.farmed;
    out.spent = out.upkeep + out.eggs + out.digging + out.research;
    out.net = out.income - out.spent;
    return out;
  }

  updateAI(dt) {
    this.aiT -= dt;
    if (this.aiT > 0) return;
    this.aiT = 2;
    const ai = this.w.diff.ai;
    this.soldierRatio = this.underAttackT > 0 ? 0.45 : ai.soldierRatio;

    this.aiGrowT -= 2;
    if (this.aiGrowT <= 0 && this.food > 40) {
      this.aiGrowT = 25;
      this.food -= 25;
      const c = this.aiCaps;
      if (this.ants.length + this.brood.length >= c.pop - 5) c.pop += 40;
      else if (this.brood.length >= c.brood - 1) c.brood += 8;
      else c.food += 200;
    }

    // The rival has no nest to research in; it simply learns a random upgrade every so often.
    this.aiResearchT -= 2;
    if (this.aiResearchT <= 0) {
      this.aiResearchT = ai.researchEvery;
      const options = CFG.RESEARCH.filter((r) => r.group !== 'Nest' && this.tech[r.id] < r.cost.length &&
        Object.entries(r.req || {}).every(([k, v]) => this.tech[k] >= v));
      if (options.length) {
        const r = pick(options);
        this.tech[r.id]++;
        this.applyResearch();
      }
    }

    // Raids start small and grow; a few soldiers always stay home.
    const party = Math.min(ai.raidMax, ai.raidSize + this.raids * ai.raidGrowth);
    const raiders = this.ants.filter((a) => a.raider && !a.dead);
    const target = this.rally && this.rally.target;
    const calm = this.w.season.calm; // no raids in winter; one under way is called off
    if (!this.rally && !calm && this.w.time > this.raidGrace && this.counts.soldiers >= party + 3) {
      const t = this.raidTarget();
      if (!t) return;
      this.raids++;
      let left = party;
      for (const a of this.ants) {
        a.raider = a.caste === 'soldier' && left-- > 0;
      }
      this.setRally(t.x, t.y);
      if (t.isPlayer) {
        this.w.log(`The ${this.adj} colony sends ${party} soldiers against your nest!`, 'danger');
        this.w.sfx('horn');
      } else this.w.log(`The ${this.adj} colony sends ${party} soldiers against the ${t.adj} nest.`, 'info');
    } else if (this.rally && (raiders.length < party * 0.35 || !(target && target.alive) || calm)) {
      this.rally = null;
      for (const a of raiders) a.raider = false;
    }
  }

  // Whom to raid: the player is the favourite target, but rivals also raid each other now and then.
  raidTarget() {
    const others = this.w.colonies.filter((c) => c !== this && c.alive);
    if (others.length <= 1) return others[0] || null;
    const weight = (c) => (c.isPlayer ? CFG.RAID_PLAYER_WEIGHT : 1);
    let r = Math.random() * others.reduce((s, c) => s + weight(c), 0);
    return others.find((c) => (r -= weight(c)) < 0) || others[0];
  }
}

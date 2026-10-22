'use strict';
// Save / load: serialises the whole simulation into compact JSON and keeps it in localStorage.

const SAVE_VERSION = 1;
const SAVE_KEY = 'anthill.save.';
const SAVE_SLOTS = ['auto', '1', '2', '3'];
const BROOD_STAGES = ['egg', 'larva', 'pupa'];

const r2 = (v) => Math.round(v * 100) / 100;

// Byte grid → base64. Zero runs are stored as (0, length); pheromone and wall grids are mostly empty.
function packBytes(u8) {
  const out = [];
  for (let i = 0; i < u8.length; ) {
    if (u8[i] === 0) {
      let n = 0;
      while (i < u8.length && u8[i] === 0 && n < 255) {
        n++;
        i++;
      }
      out.push(0, n);
    } else {
      out.push(u8[i++]);
    }
  }
  let s = '';
  for (let i = 0; i < out.length; i += 8192) s += String.fromCharCode.apply(null, out.slice(i, i + 8192));
  return btoa(s);
}

function unpackBytes(b64, len) {
  const s = atob(b64), u8 = new Uint8Array(len);
  let j = 0;
  for (let i = 0; i < s.length; i++) {
    const v = s.charCodeAt(i);
    if (v === 0) j += s.charCodeAt(++i);
    else u8[j++] = v;
  }
  return u8;
}

function packPhero(map) {
  const u8 = new Uint8Array(map.d.length);
  for (let i = 0; i < u8.length; i++) {
    const v = map.d[i];
    if (v > 0) u8[i] = Math.max(1, Math.min(255, Math.round(v * 255)));
  }
  return packBytes(u8);
}

function unpackPhero(map, b64) {
  const u8 = unpackBytes(b64, map.d.length);
  for (let i = 0; i < u8.length; i++) map.d[i] = u8[i] / 255;
}

// ---------- serialise ----------

function serializeColony(c) {
  return {
    x: c.x,
    y: c.y,
    food: r2(c.food),
    queen: r2(c.queen.hp),
    alive: c.alive,
    foragerRatio: c.foragerRatio,
    soldierRatio: c.soldierRatio,
    autoLay: c.autoLay,
    layT: r2(c.layT),
    rally: c.rally && { x: r2(c.rally.x), y: r2(c.rally.y), raid: c.rally.raid, target: c.rally.target ? c.rally.target.id : null },
    stats: c.stats,
    aiCaps: c.aiCaps,
    aiT: r2(c.aiT),
    aiGrowT: r2(c.aiGrowT),
    raids: c.raids,
    buildShare: c.buildShare,
    buildFund: r2(c.buildFund),
    tech: c.tech,
    researching: c.researching,
    aiResearchT: Number.isFinite(c.aiResearchT) ? r2(c.aiResearchT) : null,
    home: packPhero(c.home),
    foodP: packPhero(c.foodP),
    ants: c.ants.filter((a) => !a.dead).map((a) => [
      a.caste === 'soldier' ? 1 : 0, r2(a.x), r2(a.y), r2(a.a), r2(a.hp), r2(a.age), r2(a.life), r2(a.carry),
      a.state === 'return' ? 1 : 0, r2(a.tHome), r2(Math.min(a.tFood, 999)), a.inside ? 1 : 0, a.wantInside ? 1 : 0, r2(a.speed),
    ]),
    brood: c.brood.map((b) => [b.caste === 'soldier' ? 1 : 0, BROOD_STAGES.indexOf(b.stage), r2(b.t)]),
    nest: c.nest && { W: c.nest.W, H: c.nest.H, nextId: c.nest.nextId, queue: c.nest.queue, chambers: c.nest.chambers },
  };
}

function serializeWorld(w) {
  return {
    v: SAVE_VERSION,
    seed: w.seed,
    diff: w.diffKey,
    W: w.W,
    H: w.H,
    time: r2(w.time),
    tick: w.tick,
    walls: packBytes(w.walls),
    foods: w.foods.map((f) => [r2(f.x), r2(f.y), r2(f.amount), r2(f.max), f.kind]),
    spiders: w.spiders.filter((s) => !s.dead && !s.gone).map((s) => [
      r2(s.x), r2(s.y), r2(s.a), r2(s.hp), s.power, r2(s.t), r2(s.life), s.state === 'leave' ? 1 : 0, s.eaten,
    ]),
    rain: r2(w.rain),
    nextRain: r2(w.nextRain),
    spiderT: Number.isFinite(w.spiderT) ? r2(w.spiderT) : null,
    foodSpawnT: r2(w.foodSpawnT),
    feedCooldown: r2(w.feedCooldown),
    stats: w.stats,
    victoryShown: w.victoryShown,
    history: w.history,
    marks: w.marks,
    chronicleEvery: w.chronicleEvery,
    colonies: w.colonies.map(serializeColony),
  };
}

// ---------- load ----------

function loadColony(c, d, w) {
  Object.assign(c, {
    food: d.food, alive: d.alive, foragerRatio: d.foragerRatio, soldierRatio: d.soldierRatio, autoLay: d.autoLay,
    layT: d.layT, stats: d.stats, aiCaps: d.aiCaps, aiT: d.aiT, aiGrowT: d.aiGrowT, raids: d.raids,
  });
  c.queen.hp = d.queen;
  if (d.buildShare !== undefined) {
    c.buildShare = d.buildShare;
    c.buildFund = d.buildFund;
  }
  if (d.x !== undefined) {
    c.x = d.x;
    c.y = d.y;
  }
  // Research first: ants derive their stats from it.
  for (const k in d.tech || {}) if (k in c.tech) c.tech[k] = d.tech[k];
  c.researching = d.researching || null;
  if (d.aiResearchT !== undefined) c.aiResearchT = d.aiResearchT === null ? Infinity : d.aiResearchT;
  c.applyResearch();
  unpackPhero(c.home, d.home);
  unpackPhero(c.foodP, d.foodP);
  c.alarm.d.fill(0);
  c.ants = d.ants.map((r) => {
    const a = new Ant(c, r[0] ? 'soldier' : 'worker', r[1], r[2]);
    Object.assign(a, {
      a: r[3], hp: r[4], age: r[5], life: r[6], carry: r[7], state: r[8] ? 'return' : 'search',
      tHome: r[9], tFood: r[10], inside: !!r[11], wantInside: !!r[12], speed: r[13],
      baseSpeed: r[13] / c.mods.speed, lifeBase: r[6] / c.mods.life,
    });
    return a;
  });
  c.brood = d.brood.map((r) => ({ caste: r[0] ? 'soldier' : 'worker', stage: BROOD_STAGES[r[1]], t: r[2], id: ENTITY_ID++ }));
  if (d.nest && c.nest) {
    // Version-1 saves predate the bigger nest and carry no size.
    c.nest.W = d.nest.W || 1000;
    c.nest.H = d.nest.H || 640;
    c.nest.chambers = d.nest.chambers;
    c.nest.queue = d.nest.queue;
    c.nest.nextId = d.nest.nextId;
    c.nest.recalc();
    c.nest.version++;
  }
  c.recount();
}

function loadWorld(data) {
  if (!data || data.v !== SAVE_VERSION) throw new Error('This save is from an incompatible version.');
  // Saves without a size come from the original 1600x1000 meadow.
  const w = new World({ difficulty: data.diff, seed: data.seed, W: data.W || 1600, H: data.H || 1000 });
  w.time = data.time;
  w.tick = data.tick;
  w.walls = unpackBytes(data.walls, w.walls.length);
  w.wallsVersion++;
  w.foods = data.foods.map(([x, y, amount, max, kind]) => {
    const f = new FoodSource(x, y, max, kind);
    f.amount = amount;
    return f;
  });
  w.spiders = data.spiders.map(([x, y, a, hp, power, t, life, leave, eaten]) => {
    const s = new Spider(x, y, power);
    Object.assign(s, { a, hp, t, life, state: leave ? 'leave' : 'hunt', eaten });
    return s;
  });
  Object.assign(w, {
    rain: data.rain, nextRain: data.nextRain, foodSpawnT: data.foodSpawnT, feedCooldown: data.feedCooldown,
    spiderT: data.spiderT === null ? Infinity : data.spiderT, stats: data.stats, victoryShown: data.victoryShown,
  });
  if (data.history) {
    w.history = data.history;
    w.marks = data.marks || [];
    w.chronicleEvery = data.chronicleEvery || CFG.CHRONICLE.every;
  }
  data.colonies.forEach((cd, i) => loadColony(w.colonies[i], cd, w));
  data.colonies.forEach((cd, i) => {
    const r = cd.rally;
    w.colonies[i].rally = r ? { x: r.x, y: r.y, raid: r.raid, target: w.colonies.find((o) => o.id === r.target) || null } : null;
  });
  w.events.length = 0;
  return w;
}

// ---------- storage ----------

const SaveStore = {
  available() {
    try {
      localStorage.setItem('anthill.probe', '1');
      localStorage.removeItem('anthill.probe');
      return true;
    } catch {
      return false;
    }
  },

  pack(w) {
    const d = w.dayInfo();
    const meta = { day: d.day, ants: w.player.ants.length, diff: w.diffKey, savedAt: Date.now() };
    return { meta, data: serializeWorld(w) };
  },

  write(slot, w) {
    localStorage.setItem(SAVE_KEY + slot, JSON.stringify(this.pack(w)));
  },

  read(slot) {
    try {
      const t = localStorage.getItem(SAVE_KEY + slot);
      return t ? JSON.parse(t) : null;
    } catch {
      return null;
    }
  },

  remove(slot) {
    try {
      localStorage.removeItem(SAVE_KEY + slot);
    } catch {
      /* storage blocked: nothing to remove */
    }
  },

  latest() {
    let best = null;
    for (const slot of SAVE_SLOTS) {
      const s = this.read(slot);
      if (s && (!best || s.meta.savedAt > best.save.meta.savedAt)) best = { slot, save: s };
    }
    return best;
  },
};

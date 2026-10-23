'use strict';
// A scripted player for balance runs (balance.html, tests/sim-test.js): digs whatever the colony
// is short of, researches in a fixed order and raises soldiers during raids. Not used in normal play.

const AUTO_RESEARCH = [
  'antennae', 'mandibles', 'loads', 'chitin', 'fertility', 'longevity', 'fungus', 'deep', 'digging', 'drill',
  'legs', 'trails', 'chitin', 'mandibles', 'fertility', 'legs', 'fungus', 'deep', 'deep',
];

class AutoPlayer {
  constructor(world, opts = {}) {
    this.w = world;
    this.t = 0;
    this.research = opts.research !== false;
    this.react = opts.react !== false;
    this.actions = []; // { time, text }
  }

  note(text) {
    this.actions.push({ time: this.w.time, text });
  }

  update(dt) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 5;
    const c = this.w.player;
    if (!c.alive) return;
    this.dig(c);
    if (this.research) this.study(c);
    if (this.react) {
      const threat = c.underAttackT > 0 || this.w.rivals.some((r) => r.rally && r.rally.target === c);
      c.soldierRatio = threat ? 0.35 : 0.15;
    }
  }

  // The next chamber the colony needs most, or null.
  wanted(c) {
    const n = c.nest, caps = c.caps, t = this.w.time;
    const count = (type) => n.chambers.filter((ch) => ch.type === type).length;
    if (c.ants.length + c.brood.length >= caps.pop - 4) return 'barracks';
    if (c.brood.length >= caps.brood - 1) return 'nursery';
    if (c.food > caps.food * 0.8) return 'storage';
    // Extras only once the colony has some size.
    const size = c.ants.length;
    if (this.research && !count('hall') && size >= 30) return 'hall';
    if (size >= 40 && count('garden') < 1 + Math.floor(t / 600)) return 'garden';
    if (size >= 45 && !count('infirmary')) return 'infirmary';
    if (this.w.rivals.some((r) => r.raids > 0) && count('guard') < 2) return 'guard';
    return null;
  }

  dig(c) {
    const n = c.nest;
    if (n.queue.length) return;
    const type = this.wanted(c);
    if (!type) return;
    const built = n.chambers.filter((ch) => ch.type !== 'entrance');
    for (let k = 0; k < 60; k++) {
      const base = pick(built), a = rand(0, TAU), d = rand(140, CFG.DIG.maxTunnel - 10);
      if (n.order(type, base.x + Math.cos(a) * d, base.y + Math.abs(Math.sin(a)) * d * 0.8).ok) {
        this.note(`dig ${CFG.CHAMBERS[type].name}`);
        return;
      }
    }
  }

  // Research the first unlocked item on the list.
  study(c) {
    if (c.researching || !c.caps.halls) return;
    for (const id of AUTO_RESEARCH) {
      if (c.tech[id] >= RESEARCH_BY_ID[id].cost.length || c.canResearch(id)) continue;
      c.startResearch(id);
      this.note(`research ${techName(id, c.tech[id] + 1)}`);
      return;
    }
  }
}

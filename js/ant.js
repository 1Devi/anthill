'use strict';
// A single ant on the surface. Workers forage via pheromone trails, soldiers guard and fight.

let ENTITY_ID = 1;

class Ant {
  constructor(colony, caste, x, y) {
    const c = CFG.CASTE[caste];
    this.id = ENTITY_ID++;
    this.colony = colony;
    this.caste = caste;
    this.x = x;
    this.y = y;
    this.a = rand(0, TAU);
    this.baseSpeed = c.speed * rand(0.9, 1.1);
    this.lifeBase = rand(c.life[0], c.life[1]);
    this.maxHp = 0; // set by applyMods
    this.len = c.len;
    this.age = 0;
    this.carry = 0;
    this.state = 'search'; // search | return
    this.tHome = 0;
    this.tFood = 999;
    this.inside = false;
    this.wantInside = false;
    this.onTrail = false;
    this.trailT = 0; // time spent following a food scent without finding food
    this.exploreT = 0; // while > 0 the ant ignores food scent and explores
    this.fightT = 0;
    this.calmT = 0; // soldiers: ignore alarm scent for a while after reaching a fight that is over
    this.detourT = 0; // soldiers: walking around an obstacle instead of straight at the goal
    this.lastD = Infinity;
    this.progT = 0;
    this.stuck = 0;
    this.hitT = 0;
    this.boost = 1;
    this.anim = Math.random() * 4;
    this.target = null;
    this.dead = false;
    this.applyMods();
  }

  // Derive stats from the caste and the colony's research; keeps the current health fraction.
  applyMods() {
    const c = CFG.CASTE[this.caste], m = this.colony.mods;
    const s = this.caste === 'soldier' ? m.soldier : 1;
    const frac = this.maxHp ? this.hp / this.maxHp : 1;
    this.maxHp = c.hp * m.hp * s;
    this.hp = this.maxHp * frac;
    this.dmg = c.dmg * m.dmg * s;
    this.speed = this.baseSpeed * m.speed;
    this.life = this.lifeBase * m.life;
  }

  get task() {
    if (this.inside) return 'Working inside the nest';
    if (this.fightT > 0) return 'Fighting';
    if (this.caste === 'soldier') {
      if (this.target) return 'Attacking';
      return this.colony.rally ? 'Moving to rally point' : 'Patrolling';
    }
    if (this.carry > 0) return 'Carrying food home';
    if (this.state === 'return') return this.wantInside ? 'Going inside' : 'Returning home';
    return 'Searching for food';
  }

  update(dt, w) {
    this.age += dt;
    if (this.age > this.life) {
      this.die(w);
      return;
    }
    if (this.inside) return;
    if (this.hitT > 0) this.hitT -= dt;
    if (this.fightT > 0) {
      this.fightT -= dt;
      this.anim += dt * 8;
      return;
    }
    if (this.caste === 'worker') this.thinkWorker(dt, w);
    else this.thinkSoldier(dt, w);
    this.move(dt, w);
  }

  thinkWorker(dt, w) {
    const col = this.colony;
    const dn2 = dist2(this.x, this.y, col.x, col.y);
    const sense = ((w.tick + this.id) & 1) === 0;

    if (this.state === 'search') {
      this.tHome += dt;
      if (dn2 < (CFG.NEST_R * 2.5) ** 2) this.tHome = 0;
      col.home.mark(this.x, this.y, Math.exp(-this.tHome / CFG.PHERO.home.tau));
      if (this.wantInside || this.tHome > CFG.MAX_SEARCH) {
        this.state = 'return';
        return;
      }
      const f = w.nearestFood(this.x, this.y, CFG.FOOD_SENSE * col.mods.sense, col);
      if (f) {
        if (dist2(this.x, this.y, f.x, f.y) < f.pickR * f.pickR) {
          this.carry = Math.min(CFG.CARRY * col.mods.carry, f.amount);
          f.amount -= this.carry;
          this.state = 'return';
          this.tFood = 0;
          this.trailT = 0;
          this.a += Math.PI;
          return;
        }
        this.a = turnTowards(this.a, Math.atan2(f.y - this.y, f.x - this.x), 6 * dt);
      } else {
        // Following a scent for too long without finding food makes an ant give up and explore
        // on its own for a while. This dissolves "ant mills": closed scent loops ants would circle forever.
        if (this.exploreT > 0) {
          this.exploreT -= dt;
          this.onTrail = false;
        } else if (sense) {
          this.onTrail = this.follow(col.foodP, w, 0.22, CFG.TRAIL_MIN);
        }
        if (this.onTrail) {
          this.trailT += dt;
          if (this.trailT > CFG.TRAIL_PATIENCE) {
            this.trailT = 0;
            this.exploreT = rand(20, 35);
            this.a += rand(-1.6, 1.6);
          }
        } else if (Math.random() < dt * 0.5) {
          this.a += rand(-0.9, 0.9); // occasional sharp turn keeps exploration local and varied
        }
      }
      this.a += (Math.random() - 0.5) * CFG.WANDER * dt;
    } else {
      this.tFood += dt;
      if (this.carry > 0) col.foodP.mark(this.x, this.y, Math.exp(-this.tFood / CFG.PHERO.food.tau));
      if (dn2 < CFG.NEST_R * CFG.NEST_R) {
        this.arrive();
        return;
      }
      const toNest = Math.atan2(col.y - this.y, col.x - this.x);
      if (dn2 < 70 * 70) {
        this.a = turnTowards(this.a, toNest, 5 * dt);
      } else {
        if (sense) this.follow(col.home, w, 0.22);
        // A touch of path integration keeps lost ants from wandering forever.
        this.a = turnTowards(this.a, toNest, 0.35 * dt);
      }
      this.a += (Math.random() - 0.5) * CFG.WANDER * 0.5 * dt;
    }
  }

  arrive() {
    const col = this.colony;
    if (this.carry > 0) {
      col.storeFood(this.carry);
      this.carry = 0;
    }
    this.state = 'search';
    this.tHome = 0;
    this.trailT = 0;
    if (this.wantInside) {
      this.wantInside = false;
      this.inside = true;
      this.x = col.x;
      this.y = col.y;
      return;
    }
    this.pickExitHeading();
  }

  // Leaving the nest, ants sniff around the entrance and usually pick up an existing food trail.
  pickExitHeading() {
    const col = this.colony;
    if (this.exploreT > 0) {
      // Still fed up with the last trail: head out somewhere new instead.
      this.a = rand(0, TAU);
      return;
    }
    const ws = [];
    let total = 0;
    for (let k = 0; k < 12; k++) {
      const ang = (k / 12) * TAU;
      const v = col.foodP.sample(col.x + Math.cos(ang) * 22, col.y + Math.sin(ang) * 22);
      ws.push(v * v);
      total += v * v;
    }
    if (total < 0.01 || Math.random() < 0.2) {
      this.a = rand(0, TAU);
      return;
    }
    let r = Math.random() * total;
    for (let k = 0; k < 12; k++) {
      r -= ws[k];
      if (r <= 0) {
        this.a = (k / 12) * TAU + rand(-0.15, 0.15);
        return;
      }
    }
  }

  thinkSoldier(dt, w) {
    const col = this.colony;
    if ((w.tick + this.id) % 6 === 0) {
      const t = this.target;
      if (!w.targetable(t) || dist2(this.x, this.y, t.x, t.y) > 140 * 140) {
        // Raiders march on the nest and only fight what gets in their way.
        this.target = w.findEnemy(this, this.raider && col.rally ? 35 : CFG.SOLDIER_SENSE);
      }
    }
    const t = this.target;
    if (w.targetable(t)) {
      this.a = turnTowards(this.a, Math.atan2(t.y - this.y, t.x - this.x), 7 * dt);
      this.boost = 1.2;
      return;
    }
    this.target = null;
    this.boost = 1;

    // Alarm scent leads to a fight. Where it no longer gets stronger in any direction and no enemy is
    // in sight, the fight is over: stop circling the spot and go back to the post for a while.
    if (this.calmT > 0) this.calmT -= dt;
    else if (((w.tick + this.id) & 1) === 0 && col.alarm.get(this.x, this.y) > 0.02) {
      if (this.rises(col.alarm)) {
        this.follow(col.alarm, w, 0.35);
        this.a += (Math.random() - 0.5) * CFG.WANDER * 0.5 * dt;
        return;
      }
      this.calmT = rand(4, 6);
    }

    // The nest under attack overrides any rally point: everyone runs home to defend the queen.
    const defend = col.underAttackT > 0;
    // The rival sends only its raiding party; the player's rally point moves every soldier.
    const rally = col.rally && (col.isPlayer || this.raider) ? col.rally : null;
    const goal = defend ? col : rally || col;
    const R = defend ? 25 : rally ? (rally.raid ? 10 : 45) : CFG.PATROL_R;
    const d2 = dist2(this.x, this.y, goal.x, goal.y);
    if (d2 > R * R) {
      const toGoal = Math.atan2(goal.y - this.y, goal.x - this.x);
      // No progress for a few seconds means rocks are in the way: walk off to one side for a while.
      this.progT -= dt;
      if (this.progT <= 0) {
        const d = Math.sqrt(d2);
        this.stuck = this.lastD - d < 8 ? this.stuck + 1 : 0;
        this.lastD = d;
        this.progT = 1.5;
        if (this.stuck >= 2) {
          this.stuck = 0;
          this.detourT = rand(2, 4.5);
          this.a = toGoal + (Math.random() < 0.5 ? 1 : -1) * rand(1.4, 2.8);
        }
      }
      // Heading home from afar, walk down the colony's path field: it leads around any rocks.
      if (goal === col && d2 > 60 * 60) this.a = turnTowards(this.a, this.homeway(w), (defend ? 4 : 2.5) * dt);
      else if (this.detourT > 0) this.detourT -= dt;
      else this.a = turnTowards(this.a, toGoal, (defend || rally ? 3 : 1.5) * dt);
    } else {
      this.lastD = Infinity;
      this.stuck = 0;
    }
    this.a += (Math.random() - 0.5) * CFG.WANDER * dt;
  }

  // The direction, among eight, that gets closest to the nest by the colony's path field.
  homeway(w) {
    const f = this.colony.homeField(), C = CFG.CELL, r = 12;
    let best = this.a, bd = Infinity;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU, x = this.x + Math.cos(a) * r, y = this.y + Math.sin(a) * r;
      if (x < 0 || y < 0 || x >= w.W || y >= w.H || w.isWall(this.x + Math.cos(a) * r * 0.5, this.y + Math.sin(a) * r * 0.5)) continue;
      const v = f[((y / C) | 0) * w.gw + ((x / C) | 0)];
      if (v < bd) {
        bd = v;
        best = a;
      }
    }
    return best;
  }

  // Whether the scent is noticeably stronger a sensor's length away in some direction than right here.
  rises(map) {
    const here = map.sample(this.x, this.y), d = CFG.SENSOR_DIST;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      if (map.sample(this.x + Math.cos(a) * d, this.y + Math.sin(a) * d) > here * 1.1 + 0.01) return true;
    }
    return false;
  }

  sense(map, w, ang) {
    const px = this.x + Math.cos(ang) * CFG.SENSOR_DIST;
    const py = this.y + Math.sin(ang) * CFG.SENSOR_DIST;
    if (w.isWall(px, py)) return -1;
    return map.sample(px, py);
  }

  // Classic three-sensor gradient following. Returns true if a strong enough signal was found.
  follow(map, w, turn, min = 0.01) {
    const sa = CFG.SENSOR_ANGLE;
    const l = this.sense(map, w, this.a - sa);
    const c = this.sense(map, w, this.a);
    const r = this.sense(map, w, this.a + sa);
    if (Math.max(l, c, r) < min) {
      if (c < 0) this.a += l > r ? -turn : turn;
      return false;
    }
    if (c >= l && c >= r) return true;
    this.a += l > r ? -turn : turn;
    return true;
  }

  move(dt, w) {
    const sp = this.speed * this.boost * (this.carry ? 0.92 : 1) * w.speedMul;
    let nx = this.x + Math.cos(this.a) * sp * dt;
    let ny = this.y + Math.sin(this.a) * sp * dt;
    if (nx < 3 || nx > w.W - 3) {
      this.a = Math.PI - this.a;
      nx = clamp(nx, 3, w.W - 3);
    }
    if (ny < 3 || ny > w.H - 3) {
      this.a = -this.a;
      ny = clamp(ny, 3, w.H - 3);
    }
    if (w.isWall(nx, ny)) {
      const s = this.id & 1 ? 1 : -1;
      for (const k of [0.6, -0.6, 1.2, -1.2, 2.0, -2.0, Math.PI]) {
        const na = this.a + k * s;
        if (!w.isWall(this.x + Math.cos(na) * sp * dt * 2, this.y + Math.sin(na) * sp * dt * 2)) {
          this.a = na;
          return;
        }
      }
      return;
    }
    this.x = nx;
    this.y = ny;
    this.anim += sp * dt * 0.35;
  }

  damage(amount, attacker, w) {
    if (this.dead) return;
    this.hp -= amount;
    this.hitT = 0.2;
    this.colony.alarm.splat(this.x, this.y, 40, 1);
    w.sfx('bite', this.x, this.y);
    if (this.hp <= 0) {
      if (attacker && attacker.colony === w.player && this.colony !== w.player) w.stats.kills++;
      this.die(w);
    }
  }

  die(w) {
    if (this.dead) return;
    this.dead = true;
    this.colony.stats.died++;
    if (!this.inside) w.addFood(this.x, this.y, CFG.CORPSE_FOOD + this.carry, 'corpse');
  }
}

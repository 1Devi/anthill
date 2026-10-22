'use strict';
// A hunting spider: wanders in from the edge, eats ants, leaves when hurt or full.

class Spider {
  constructor(x, y, power = 1) {
    const S = CFG.SPIDER;
    this.id = ENTITY_ID++;
    this.isSpider = true;
    this.colony = null;
    this.inside = false;
    this.x = x;
    this.y = y;
    this.power = power;
    this.maxHp = S.hp * power;
    this.hp = this.maxHp;
    this.dmg = S.dmg * Math.sqrt(power);
    this.speed = S.speed;
    this.r = S.r * (0.9 + 0.1 * power);
    this.a = 0;
    this.anim = 0;
    this.t = 0;
    this.life = rand(70, 110);
    this.state = 'hunt'; // hunt | leave
    this.target = null;
    this.biting = false;
    this.slow = 0; // ants latched onto the spider slow it down
    this.hitT = 0;
    this.dead = false;
    this.gone = false;
    this.eaten = 0;
  }

  get task() {
    if (this.state === 'leave') return 'Leaving';
    if (this.biting) return 'Eating an ant';
    return this.target ? 'Chasing prey' : 'Hunting';
  }

  update(dt, w) {
    this.t += dt;
    if (this.hitT > 0) this.hitT -= dt;
    if (this.state !== 'leave' && (this.t > this.life || this.hp < this.maxHp * 0.2 || this.eaten >= CFG.SPIDER.maxEaten)) {
      this.state = 'leave';
      this.target = null;
    }
    this.slow = Math.max(0, this.slow - dt * 0.6);
    // Wounds and a swarm of biting ants both slow the spider down.
    let sp = this.speed * (0.6 + 0.4 * (this.hp / this.maxHp)) * (1 - this.slow);
    this.biting = false;

    if (this.state === 'leave') {
      const dl = this.x, dr = w.W - this.x, dtp = this.y, db = w.H - this.y;
      const m = Math.min(dl, dr, dtp, db);
      const goal = m === dl ? Math.PI : m === dr ? 0 : m === dtp ? -Math.PI / 2 : Math.PI / 2;
      this.a = turnTowards(this.a, goal, 2 * dt);
      sp *= 1.3;
      if (this.x < -30 || this.y < -30 || this.x > w.W + 30 || this.y > w.H + 30) this.gone = true;
    } else {
      if ((w.tick + this.id) % 10 === 0) {
        const t = this.target;
        if (!w.targetable(t) || dist2(this.x, this.y, t.x, t.y) > CFG.SPIDER.sense ** 2) {
          this.target = w.findEnemy(this, CFG.SPIDER.sense);
        }
      }
      const t = this.target;
      if (w.targetable(t)) {
        this.a = turnTowards(this.a, Math.atan2(t.y - this.y, t.x - this.x), 4 * dt);
        if (dist2(this.x, this.y, t.x, t.y) < (this.r + 4) ** 2) {
          t.damage(this.dmg * dt, this, w);
          w.sfx('chomp', this.x, this.y);
          if (t.dead) this.eaten++;
          this.biting = true;
          sp *= 0.15;
        }
      } else {
        this.target = null;
        this.a += (Math.random() - 0.5) * 2 * dt;
        const m = 80;
        if (this.x < m || this.y < m || this.x > w.W - m || this.y > w.H - m) {
          this.a = turnTowards(this.a, Math.atan2(w.H / 2 - this.y, w.W / 2 - this.x), 1.5 * dt);
        }
      }
    }

    // Spiders climb over rocks, so no wall checks.
    this.x += Math.cos(this.a) * sp * dt;
    this.y += Math.sin(this.a) * sp * dt;
    this.anim += sp * dt * 0.25;
  }

  damage(amount, attacker, w) {
    if (this.dead) return;
    this.hp -= amount;
    this.hitT = 0.15;
    this.slow = Math.min(0.8, this.slow + 0.012);
    if (attacker && !attacker.dead && this.state !== 'leave') this.target = attacker;
    if (this.hp <= 0) {
      this.dead = true;
      w.sfx('thud', this.x, this.y);
      w.addFood(clamp(this.x, 10, w.W - 10), clamp(this.y, 10, w.H - 10), Math.round(CFG.SPIDER.corpseFood * this.power), 'prey', false);
      if (attacker && attacker.colony === w.player) {
        w.stats.kills++;
        w.log('Spider defeated! Its carcass is a feast.', 'good');
      }
    }
  }
}

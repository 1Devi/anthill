// Headless simulation check with the scripted AutoPlayer:
//   node tests/sim-test.js [difficulty] [minutes] [seed] [size=… food=… rocks=… rivals=…]
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const files = ['util', 'config', 'world', 'ant', 'spider', 'nest', 'colony', 'autoplayer'];
const src = files.map((f) => fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8')).join('\n');
const ctx = vm.createContext({ console, Math, Date });
vm.runInContext(src + '\nthis.World = World; this.CFG = CFG; this.AutoPlayer = AutoPlayer;', ctx);

const diff = process.argv[2] || 'normal';
const minutes = Number(process.argv[3] || 10);
const seed = Number(process.argv[4] || 12345);
// Map options, e.g. size=large rivals=3 food=scarce rocks=many
const settings = Object.fromEntries(process.argv.slice(5).map((a) => a.split('=')).map(([k, v]) => [k, k === 'rivals' ? Number(v) : v]));
const w = new ctx.World({ difficulty: diff, seed, settings });
const bot = new ctx.AutoPlayer(w);

const wallFrac = w.walls.reduce((s, v) => s + v, 0) / w.walls.length;
const st = w.settings;
console.log(`difficulty=${diff} seed=${seed} map=${w.W}x${w.H} (${st.size}, food ${st.food}, rocks ${st.rocks}, ${st.rivals} rival${st.rivals === 1 ? '' : 's'})` +
  ` walls=${(wallFrac * 100).toFixed(1)}% foods=${w.foods.length}`);

const fmt = (c) => {
  const n = c.counts, f = c.flows();
  const tech = Object.values(c.tech).reduce((s, v) => s + v, 0);
  return `${c.name.padEnd(12)} food=${c.food.toFixed(0).padStart(4)}/${c.caps.food} net=${f.net.toFixed(0).padStart(4)}/min` +
    ` ants=${String(c.ants.length).padStart(3)}/${c.caps.pop} (w${n.workers} s${n.soldiers} in${n.inside})` +
    ` brood=${c.brood.length}/${c.caps.brood} got=${c.stats.collected.toFixed(0)} born=${c.stats.born} died=${c.stats.died}` +
    ` tech=${tech} queen=${c.queen.hp.toFixed(0)}${c.alive ? '' : ' DEAD'}`;
};

const ticks = Math.round((minutes * 60) / ctx.CFG.TICK);
const t0 = Date.now();
let lastEvent = 0, lastAction = 0;
for (let i = 1; i <= ticks; i++) {
  w.update(ctx.CFG.TICK);
  bot.update(ctx.CFG.TICK);
  while (lastEvent < w.events.length) {
    const e = w.events[lastEvent++];
    if (e.kind !== 'warn') console.log(`  [${(e.time / 60).toFixed(1)}m] ${e.kind}: ${e.text}`);
  }
  while (lastAction < bot.actions.length) {
    const a = bot.actions[lastAction++];
    console.log(`  [${(a.time / 60).toFixed(1)}m] bot: ${a.text}`);
  }
  if (i % 3600 === 0) {
    console.log(`t=${(w.time / 60).toFixed(0)}m spiders=${w.spiders.length} foods=${w.foods.length} kills=${w.stats.kills}`);
    for (const c of w.colonies) console.log('  ' + fmt(c));
  }
  if (w.result) {
    console.log('RESULT:', w.result.title);
    if (!w.result.win) break;
    w.result = null;
  }
}
const ms = Date.now() - t0;
console.log(`${ticks} ticks in ${ms} ms → ${(ms / ticks).toFixed(3)} ms/tick`);

// Save/load round-trip check: node tests/save-test.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const files = ['util', 'config', 'world', 'ant', 'spider', 'nest', 'colony', 'save'];
const src = files.map((f) => fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8')).join('\n');
const ctx = vm.createContext({ console, Math, Date, btoa, atob, JSON });
vm.runInContext(src + '\nthis.World = World; this.CFG = CFG; this.serializeWorld = serializeWorld; this.loadWorld = loadWorld;', ctx);

const w = new ctx.World({ difficulty: 'normal', seed: 42 });
for (let i = 0; i < 60 * 150; i++) w.update(ctx.CFG.TICK);
w.player.nest.order('barracks', w.player.nest.chambers[0].x + 260, 330);
w.player.tech.chitin = 1;
w.player.tech.deep = 1;
w.player.applyResearch();
w.player.researching = { id: 'mandibles', t: 12, total: 60 };
w.player.setRally(700, 500);
w.spawnSpider();
w.paintWalls(600, 600, 20, 1);
for (let i = 0; i < 60 * 5; i++) w.update(ctx.CFG.TICK);

const json = JSON.stringify(ctx.serializeWorld(w));
const w2 = ctx.loadWorld(JSON.parse(json));
console.log(`save size: ${(json.length / 1024).toFixed(1)} KB`);

const sum = (a) => a.reduce((s, v) => s + v, 0);
assert.strictEqual(w2.time.toFixed(1), w.time.toFixed(1));
assert.strictEqual(sum(w2.walls), sum(w.walls), 'walls');
assert.strictEqual(w2.foods.length, w.foods.length, 'foods');
assert.strictEqual(w2.spiders.length, w.spiders.length, 'spiders');
w.colonies.forEach((c, i) => {
  const c2 = w2.colonies[i];
  assert.strictEqual(c2.ants.length, c.ants.length, 'ants');
  assert.strictEqual(c2.brood.length, c.brood.length, 'brood');
  assert.strictEqual(Math.round(c2.food), Math.round(c.food), 'food');
  assert.strictEqual(c2.counts.inside, c.counts.inside, 'inside');
  assert.ok(Math.abs(sum(c2.foodP.d) - sum(c.foodP.d)) / Math.max(1, sum(c.foodP.d)) < 0.02, 'food pheromone');
  if (c.nest) {
    // Compare as JSON: objects from the vm context and the main realm have different prototypes.
    assert.strictEqual(JSON.stringify(c2.nest.caps), JSON.stringify(c.nest.caps), 'caps');
    assert.strictEqual(JSON.stringify(c2.nest.queue), JSON.stringify(c.nest.queue), 'dig queue');
  }
});
assert.ok(w2.player.rally && w2.player.rally.x === 700, 'rally');
assert.strictEqual(w2.player.tech.chitin, 1, 'research levels');
assert.strictEqual(w2.player.mods.hp, w.player.mods.hp, 'research modifiers');
assert.strictEqual(w2.player.researching.id, 'mandibles', 'research in progress');
assert.strictEqual(Math.round(w2.player.ants[0].maxHp), Math.round(w.player.ants[0].maxHp), 'ant stats follow research');

// Both copies keep running without errors.
for (let i = 0; i < 60 * 60; i++) {
  w.update(ctx.CFG.TICK);
  w2.update(ctx.CFG.TICK);
}
console.log(`after 60 s more: original ${w.player.ants.length} ants, loaded ${w2.player.ants.length} ants`);
console.log('save round-trip OK');

// Version-1 saves (before the maps grew) carry no sizes: they must load as a 1600x1000 meadow
// with a 1000x640 nest and the colonies in their old spots.
const legacy = new ctx.World({ difficulty: 'normal', seed: 7, W: 1600, H: 1000 });
for (let i = 0; i < 600; i++) legacy.update(ctx.CFG.TICK);
const old = JSON.parse(JSON.stringify(ctx.serializeWorld(legacy)));
delete old.W;
delete old.H;
for (const c of old.colonies) {
  delete c.x;
  delete c.y;
  if (c.nest) {
    delete c.nest.W;
    delete c.nest.H;
  }
}
const w3 = ctx.loadWorld(old);
assert.strictEqual(w3.W, 1600, 'legacy width');
assert.strictEqual(w3.walls.length, legacy.walls.length, 'legacy wall grid');
assert.strictEqual(w3.player.nest.W, 1000, 'legacy nest width');
assert.strictEqual(Math.round(w3.player.x), 300, 'legacy nest position');
assert.strictEqual(Math.round(w3.rival.x), 1300, 'legacy rival position');
for (let i = 0; i < 600; i++) w3.update(ctx.CFG.TICK);
console.log('legacy save OK');

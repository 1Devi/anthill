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
assert.strictEqual(w2.seasonT0, w.seasonT0, 'season start');
assert.strictEqual(w2.season.id, w.season.id, 'season');

// Both copies keep running without errors.
for (let i = 0; i < 60 * 60; i++) {
  w.update(ctx.CFG.TICK);
  w2.update(ctx.CFG.TICK);
}
console.log(`after 60 s more: original ${w.player.ants.length} ants, loaded ${w2.player.ants.length} ants`);
console.log('save round-trip OK');

// Map settings survive a save: three rivals on a large, rocky, food-rich meadow.
const wm = new ctx.World({ difficulty: 'hard', seed: 5, settings: { size: 'large', food: 'rich', rocks: 'many', rivals: 3 } });
for (let i = 0; i < 60 * 30; i++) wm.update(ctx.CFG.TICK);
const jm = JSON.stringify(ctx.serializeWorld(wm));
const wm2 = ctx.loadWorld(JSON.parse(jm));
console.log(`3-rival save size: ${(jm.length / 1024).toFixed(1)} KB`);
assert.strictEqual(wm2.W, 3200, 'large map width');
assert.strictEqual(JSON.stringify(wm2.settings), JSON.stringify(wm.settings), 'map settings');
assert.strictEqual(wm2.rivals.length, 3, 'rival count');
assert.strictEqual(wm2.rivals.map((r) => r.adj).join(), 'red,amber,violet', 'rival names');
assert.ok(wm2.rivals[2].raidGrace > wm2.rivals[0].raidGrace, 'staggered raids');
assert.strictEqual(wm2.foodMul, wm.foodMul, 'food multiplier');
wm.rivals.forEach((r, i) => {
  assert.strictEqual(wm2.rivals[i].ants.length, r.ants.length, 'rival ants');
  assert.strictEqual(Math.round(wm2.rivals[i].x), Math.round(r.x), 'rival position');
});
for (let i = 0; i < 600; i++) wm2.update(ctx.CFG.TICK);
// Peaceful games never get rivals, whatever the settings say.
assert.strictEqual(new ctx.World({ difficulty: 'peaceful', seed: 1, settings: { rivals: 3, size: 'small' } }).colonies.length, 1, 'peaceful');
console.log('map settings OK');

// Winter arrives on time: spiders leave, ants slow down, nothing grows.
const ww = new ctx.World({ difficulty: 'normal', seed: 9 });
const winterAt = 3 * ctx.CFG.SEASON_DAYS * ctx.CFG.DAY_LENGTH;
ww.time = winterAt - 1;
ww.rain = 0;
ww.nextRain = 999;
ww.spawnSpider();
for (let i = 0; i < 120; i++) ww.update(ctx.CFG.TICK);
assert.strictEqual(ww.season.id, 'winter', 'winter comes');
assert.ok(ww.events.some((e) => e.text.startsWith('Winter!')), 'winter is announced');
assert.ok(ww.spiders.every((s) => s.state === 'leave'), 'spiders leave in winter');
assert.ok(Math.abs(ww.speedMul - 0.6) < 1e-9, 'ants slow down in winter');
const seeds = ww.foods.filter((f) => f.kind === 'seeds').reduce((n, f) => n + f.amount, 0);
for (let i = 0; i < 600; i++) ww.update(ctx.CFG.TICK);
assert.ok(ww.foods.filter((f) => f.kind === 'seeds').reduce((n, f) => n + f.amount, 0) < seeds, 'seeds rot in winter');
console.log('seasons OK');

// Full stores: foragers pile the surplus by the entrance, leave it alone while full, carry it in once there is room.
const wf = new ctx.World({ difficulty: 'peaceful', seed: 4 });
const pf = wf.player;
for (let i = 0; i < 60 * 30; i++) wf.update(ctx.CFG.TICK);
pf.food = pf.caps.food;
const got0 = pf.stats.collected;
for (let i = 0; i < 60 * 60; i++) {
  pf.food = pf.caps.food; // keep the stores full (only what the colony eats meanwhile fits in)
  wf.update(ctx.CFG.TICK);
}
const pile = wf.foods.find((f) => f.kind === 'surplus');
assert.ok(pile && pile.owner === pf.id && pile.amount > 5, 'surplus piles up by the entrance');
assert.ok(Math.hypot(pile.x - pf.x, pile.y - pf.y) < 30, 'surplus pile at the entrance');
// Only the room the colony ate free in the meantime could be filled.
assert.ok(pf.stats.collected - got0 <= pf.upkeep * 60 * 1.5 + 2, 'food that did not fit is not counted as gathered');
const saved = ctx.loadWorld(JSON.parse(JSON.stringify(ctx.serializeWorld(wf))));
assert.strictEqual(saved.foods.find((f) => f.kind === 'surplus').owner, pf.id, 'surplus pile owner is saved');
const before = pile.amount;
pf.food = 0;
for (let i = 0; i < 60 * 20; i++) wf.update(ctx.CFG.TICK);
assert.ok(!wf.foods.includes(pile) || pile.amount < before - 5, 'surplus is carried in once there is room');
console.log('surplus OK');

// Meadow objects block ants, survive a save and are not touched by the rock tools.
const wo = new ctx.World({ difficulty: 'normal', seed: 6 });
const twig = wo.objects.find((o) => o.type === 'twig');
assert.ok(twig && wo.isWall(twig.x, twig.y), 'a twig blocks ants');
wo.paintWalls(twig.x, twig.y, 15, 0);
assert.ok(wo.isWall(twig.x, twig.y), 'erasing rocks leaves twigs alone');
const wo2 = ctx.loadWorld(JSON.parse(JSON.stringify(ctx.serializeWorld(wo))));
assert.strictEqual(wo2.objects.length, wo.objects.length, 'objects are saved');
// Rain fills puddles that block ants; ants caught in one wade out; dry weather drains them.
wo.rain = 25;
wo.nextRain = 999;
for (let i = 0; i < 60 * 20; i++) wo.update(ctx.CFG.TICK);
const wetCells = wo.water.reduce((n, v) => n + v, 0);
assert.ok(wetCells > 0.02 * wo.water.length, 'rain fills puddles');
const cell = wo.water.indexOf(1), cx = ((cell % wo.gw) + 0.5) * ctx.CFG.CELL, cy = (((cell / wo.gw) | 0) + 0.5) * ctx.CFG.CELL;
assert.ok(wo.isWall(cx, cy) && !wo.isWall(cx, cy, true), 'puddles block ants but can be waded out of');
assert.strictEqual(ctx.loadWorld(JSON.parse(JSON.stringify(ctx.serializeWorld(wo)))).water.reduce((n, v) => n + v, 0), wetCells, 'puddles are saved');
const wading = wo.colonies.reduce((n, c) => n + c.ants.filter((a) => !a.inside && wo.isWet(a.x, a.y)).length, 0);
assert.ok(wading <= 3, 'ants do not stay in puddles');
wo.rain = 0;
for (let i = 0; i < 60 * 80; i++) wo.update(ctx.CFG.TICK);
assert.strictEqual(wo.water.reduce((n, v) => n + v, 0), 0, 'puddles dry up');
console.log('objects and puddles OK');

// Version-1 saves (before the maps grew) carry no sizes or map settings: they must load as a 1600x1000
// meadow with a 1000x640 nest, one rival and the colonies in their old spots.
const legacy = new ctx.World({ difficulty: 'normal', seed: 7, W: 1600, H: 1000 });
for (let i = 0; i < 600; i++) legacy.update(ctx.CFG.TICK);
const old = JSON.parse(JSON.stringify(ctx.serializeWorld(legacy)));
delete old.W;
delete old.H;
delete old.settings;
delete old.seasonT0;
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
assert.strictEqual(w3.rivals.length, 1, 'legacy saves have one rival');
assert.strictEqual(w3.settings.size, 'small', 'legacy map counts as small');
assert.strictEqual(w3.seasonT0, Math.floor(legacy.time / ctx.CFG.DAY_LENGTH) * ctx.CFG.DAY_LENGTH, 'legacy seasons start on load');
assert.strictEqual(w3.season.id, 'spring', 'legacy saves start in spring');
for (let i = 0; i < 600; i++) w3.update(ctx.CFG.TICK);
console.log('legacy save OK');

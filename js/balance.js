'use strict';
// Balance sheet: renders every tunable number from CFG with derived metrics, and runs headless simulations.

const fx = (v, d = 1) => {
  if (typeof v === 'string') return v;
  if (!Number.isFinite(v)) return '—';
  if (Math.abs(v) >= 100 || d === 0) return Math.round(v).toLocaleString('en');
  return String(Number(v.toFixed(d)));
};
const pct = (v) => `${Math.round(v * 100)}%`;
const mid = (a) => (a[0] + a[1]) / 2;
const secs = (s) => (s >= 90 ? `${fx(s / 60)} min` : `${fx(s, 0)} s`);

function modsFor(levelOf) {
  const m = { ...BASE_MODS };
  for (const r of CFG.RESEARCH) for (const k in r.mod) m[k] += r.mod[k] * levelOf(r);
  return m;
}
const MAXED = modsFor((r) => r.cost.length);

// ---------- rendering helpers ----------

// cols: [{ h, l (left-aligned), wrap }]; rows: arrays of cells, or { group: 'Title' } separator rows.
function tableHtml(cols, rows) {
  const head = `<tr>${cols.map((c) => `<th class="${c.l || c.wrap ? 'l' : ''}">${c.h}</th>`).join('')}</tr>`;
  const body = rows.map((r) => {
    if (r.group) return `<tr class="group"><td colspan="${cols.length}">${r.group}</td></tr>`;
    return `<tr>${r.map((v, i) => `<td class="${cols[i].wrap ? 'wrap' : cols[i].l ? 'l' : ''}">${typeof v === 'number' ? fx(v) : v}</td>`).join('')}</tr>`;
  }).join('');
  return head + body;
}

const sections = [];

function addSection(id, title, note, tables) {
  sections.push({ id, title });
  const s = document.createElement('section');
  s.id = id;
  s.innerHTML = `<div class="sec-head"><h2>${title}</h2>${tables.map((t, i) => `<button data-csv="${id}-${i}">Copy CSV${tables.length > 1 ? ` (${t.name})` : ''}</button>`).join('')}</div>` +
    `<p class="note">${note}</p>` +
    tables.map((t, i) => `${t.name && tables.length > 1 ? `<p class="note" style="margin-top:14px">${t.name}</p>` : ''}<div class="scroll"><table id="${id}-${i}">${tableHtml(t.cols, t.rows)}</table></div>`).join('');
  document.getElementById('main').insertBefore(s, document.getElementById('sim'));
}

function toCsv(table) {
  const q = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return [...table.rows].map((tr) => [...tr.cells].map((c) => q(c.textContent.trim())).join(',')).join('\n');
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-csv]');
  if (!b) return;
  const csv = toCsv(document.getElementById(b.dataset.csv));
  const done = () => {
    const old = b.textContent;
    b.textContent = 'Copied!';
    setTimeout(() => (b.textContent = old), 1200);
  };
  // The async clipboard API can be unavailable (e.g. some file:// setups): fall back to a hidden textarea.
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = csv;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    done();
  };
  if (navigator.clipboard) navigator.clipboard.writeText(csv).then(done, fallback);
  else fallback();
});

// ---------- castes ----------

function casteSection() {
  const B = CFG.BROOD, raise = B.egg + B.larva + B.pupa;
  const rows = Object.entries(CFG.CASTE).map(([key, c]) => {
    const life = mid(c.life);
    const lifetime = c.cost + B.larvaUpkeep * B.larva + c.upkeep * life;
    const s = key === 'soldier' ? MAXED.soldier : 1;
    return [
      c.name, c.cost, `${raise} s`, c.hp, c.dmg, c.speed, secs(life), fx(c.upkeep * 60, 2), fx(lifetime),
      fx(c.hp / lifetime, 2), fx(c.dmg / lifetime, 3),
      fx(c.hp * MAXED.hp * s), fx(c.dmg * MAXED.dmg * s), fx(c.speed * MAXED.speed), secs(life * MAXED.life),
    ];
  });
  const Q = CFG.QUEEN;
  rows.push(['Queen', '—', '—', Q.hp, '—', '—', '∞', fx(Q.upkeep * 60, 2), '—', '—', '—', Q.hp, '—', '—', `lays every ${Q.layInterval} s`]);
  addSection('castes', 'Castes',
    `Raise time is egg → larva → pupa at full nursing (${secs(raise / 0.35)} with no nurses). <b>Lifetime cost</b> = egg + larva upkeep + upkeep over an average life. ` +
    '<b>HP / food</b> and <b>bite / food</b> compare value per food spent. The last four columns are with every research maxed.',
    [{ cols: [
      { h: 'Caste', l: true }, { h: 'Egg' }, { h: 'Raise' }, { h: 'HP' }, { h: 'Bite/s' }, { h: 'Speed' }, { h: 'Life' },
      { h: 'Eats/min' }, { h: 'Lifetime cost' }, { h: 'HP/food' }, { h: 'Bite/food' },
      { h: 'HP max' }, { h: 'Bite max' }, { h: 'Speed max' }, { h: 'Life max' },
    ], rows }]);
}

// ---------- foraging yield ----------

function foragingSection() {
  const w = CFG.CASTE.worker;
  const fast = MAXED.speed, heavy = 1 + RESEARCH_BY_ID.loads.mod.carry;
  const rows = [100, 200, 300, 500, 800].map((d) => {
    const trip = (2 * d) / w.speed + 1;
    const perMin = (60 / trip) * CFG.CARRY;
    const tripFast = (2 * d) / (w.speed * fast) + 1;
    return [`${d} units`, `${fx(trip)} s`, fx(perMin, 2), fx(perMin / (w.upkeep * 60), 1), fx((60 / tripFast) * CFG.CARRY * heavy, 2)];
  });
  addSection('foraging', 'Forager yield (ideal trail)',
    `One worker shuttling along a finished trail, ignoring search time and detours (real colonies reach roughly 60–80% of this). ` +
    `<b>Feeds</b> is how many ants of its own upkeep one forager supports. The last column has Swift Legs maxed and Heavy Loads.`,
    [{ cols: [{ h: 'Food distance', l: true }, { h: 'Round trip' }, { h: 'Food/min' }, { h: 'Feeds' }, { h: 'Food/min, researched' }], rows }]);
}

// ---------- brood ----------

function broodSection() {
  const B = CFG.BROOD;
  const rows = [
    ['Egg', `${B.egg} s`, '0', 'Laid by the queen for the caste cost'],
    ['Larva', `${B.larva} s`, fx(B.larvaUpkeep * 60, 2), 'Eats while it grows'],
    ['Pupa', `${B.pupa} s`, '0', 'Hatches into an ant'],
  ];
  addSection('brood', 'Brood',
    'Development speed = 35% + 65% × min(1, nurses ÷ (0.4 × brood)); Fertile Queen multiplies it further. Nurses are the workers inside that are not digging or gardening.',
    [{ cols: [{ h: 'Stage', l: true }, { h: 'Duration' }, { h: 'Eats/min' }, { h: 'Note', wrap: true }], rows }]);
}

// ---------- chambers ----------

function chamberSection() {
  const D = CFG.DIG, tunnel = 180 * D.tunnelWorkPerUnit;
  const rate = (n) => D.base + n * D.perWorker;
  const provides = (T) => [
    T.food && `+${T.food} food storage`, T.brood && `+${T.brood} brood slots`, T.pop && `+${T.pop} population`,
    T.farm && `+${T.farm} food/min with ${T.gardeners} gardeners`, T.heal && `+${T.heal} HP/s healing at the nest`,
    T.guard && `−${pct(T.guard)} raid damage to the queen`, T.halls && `research ×1, +${pct(CFG.RESEARCH_HALL_BONUS)} speed per extra hall`,
  ].filter(Boolean).join(', ');
  const value = (T) => {
    if (!T.cost) return '—';
    if (T.farm) return `pays back in ${fx(T.cost / T.farm)} min`;
    if (T.food) return `${fx(T.food / T.cost)} storage/food`;
    if (T.pop) return `${fx(T.pop / T.cost, 2)} pop/food`;
    if (T.brood) return `${fx(T.brood / T.cost, 2)} slots/food`;
    return '';
  };
  const rows = Object.entries(CFG.CHAMBERS).map(([key, T]) => [
    T.name, T.cost, T.work,
    T.work ? secs((T.work + tunnel) / rate(3)) : '—', T.work ? secs((T.work + tunnel) / rate(6)) : '—', T.work ? secs((T.work + tunnel) / rate(12)) : '—',
    provides(T), value(T), `${T.rx * 2}×${T.ry * 2}`,
  ]);
  const zones = CFG.NEST.zones.map((z, i) => {
    const cost = i ? RESEARCH_BY_ID.deep.cost.slice(0, i).reduce((a, b) => a + b, 0) : 0;
    return [i ? `Deep Tunnels ${ROMAN[i]}` : 'Start', `${z.halfW * 2}`, `${z.depth}`, fx((z.halfW * 2 * z.depth) / 1000, 0), cost];
  });
  addSection('chambers', 'Chambers',
    `Dig time includes a typical 180-unit tunnel (${fx(tunnel, 0)} work) at ${D.base} + ${D.perWorker} × diggers work/s. ` +
    `The cost is paid gradually while digging. Half of the workers inside dig while a chamber is queued; Efficient Digging adds ${pct(RESEARCH_BY_ID.digging.mod.dig)}.`,
    [
      { name: 'Chambers', cols: [{ h: 'Chamber', l: true }, { h: 'Cost' }, { h: 'Work' }, { h: '3 diggers' }, { h: '6 diggers' }, { h: '12 diggers' }, { h: 'Provides', wrap: true }, { h: 'Value', l: true }, { h: 'Size' }], rows },
      { name: 'Diggable zone', cols: [{ h: 'Level', l: true }, { h: 'Width' }, { h: 'Depth' }, { h: 'Area (k units²)' }, { h: 'Total research cost' }], rows: zones },
    ]);
}

// ---------- research ----------

function researchSection() {
  const rows = [];
  let total = 0, totalTime = 0;
  for (const g of ['Combat', 'Foraging', 'Colony', 'Nest']) {
    rows.push({ group: g });
    for (const r of CFG.RESEARCH.filter((x) => x.group === g)) {
      let cum = 0;
      r.cost.forEach((cost, i) => {
        cum += cost;
        total += cost;
        totalTime += r.time[i];
        const req = [
          ...Object.entries(r.req || {}).map(([k, v]) => techName(k, v)),
          r.reqChamber && CFG.CHAMBERS[r.reqChamber].name,
        ].filter(Boolean).join(', ');
        const eff = Object.entries(r.mod).map(([k, v]) => (k === 'zone' ? 'zone +1' : `${k} +${pct(v * (i + 1))}`)).join(', ');
        rows.push([techName(r.id, i + 1), i + 1, cost, `${r.time[i]} s`, `${fx(r.time[i] / (1 + CFG.RESEARCH_HALL_BONUS), 0)} s`, fx((cost / r.time[i]) * 60, 0), eff, i ? '' : req || '—', cum]);
      });
    }
  }
  rows.push({ group: `Everything: ${fx(total)} food, ${secs(totalTime)} with one hall` });
  addSection('research', 'Research',
    'Research runs in Scent Halls, one topic at a time, and is paid gradually while it runs (the food/min column). Effects are cumulative totals at that level.',
    [{ cols: [{ h: 'Research', l: true }, { h: 'Lvl' }, { h: 'Cost' }, { h: 'Time, 1 hall' }, { h: 'Time, 2 halls' }, { h: 'Food/min' }, { h: 'Effect (total)', l: true }, { h: 'Requires', l: true }, { h: 'Cum. cost' }], rows }]);
}

// ---------- threats ----------

function threatSection() {
  const S = CFG.SPIDER, sol = CFG.CASTE.soldier, wor = CFG.CASTE.worker;
  const spiders = [3, 5, 10, 15, 20, 30].map((m) => {
    const power = 1 + (m * 60) / 900, hp = S.hp * power;
    return [`${m} min`, fx(power, 2), fx(hp, 0), fx(S.dmg * Math.sqrt(power)), 1 + Math.floor((m * 60) / 600),
      secs(hp / (5 * sol.dmg)), secs(hp / (10 * wor.dmg)), secs(hp / (5 * sol.dmg * MAXED.dmg * MAXED.soldier))];
  });
  const raidDps = sol.dmg * CFG.RAID_DMG;
  const raids = [];
  for (let i = 0; i < 6; i++) {
    const row = [`Raid ${i + 1}`];
    for (const k of ['normal', 'hard']) {
      const ai = CFG.DIFFICULTY[k].ai, party = Math.min(ai.raidMax, ai.raidSize + i * ai.raidGrowth);
      row.push(party);
      for (const guards of [0, 3]) {
        const mul = 1 - Math.min(0.75, guards * CFG.CHAMBERS.guard.guard);
        row.push(secs(CFG.QUEEN.hp / (party * raidDps * mul)));
      }
    }
    raids.push(row);
  }
  addSection('threats', 'Threats',
    `Spiders: speed ${S.speed}, smell ${S.sense}, flee at 20% health or after eating ${S.maxEaten} ants, leave a carcass worth ${S.corpseFood} × strength food. ` +
    `Each bite they take slows them (up to 80%). Raiders deal ${pct(CFG.RAID_DMG)} of their bite to the queen (${fx(raidDps, 2)} HP/s each) while nobody fights them; ` +
    'the queen-death times below assume no defenders at all.',
    [
      { name: 'Spiders over time', cols: [{ h: 'Game time', l: true }, { h: 'Strength' }, { h: 'HP' }, { h: 'Bite/s' }, { h: 'Per wave' }, { h: 'Kill: 5 soldiers' }, { h: 'Kill: 10 workers' }, { h: 'Kill: 5 maxed soldiers' }], rows: spiders },
      { name: 'Raids', cols: [{ h: 'Raid', l: true }, { h: 'Normal party' }, { h: 'Queen dies, 0 guards' }, { h: '3 guard posts' }, { h: 'Hard party' }, { h: 'Queen dies, 0 guards' }, { h: '3 guard posts' }], rows: raids },
    ]);
}

// ---------- difficulty ----------

function difficultySection() {
  const D = CFG.DIFFICULTY, keys = Object.keys(D);
  const v = (f) => keys.map((k) => f(D[k]));
  const yes = (b) => (b ? 'yes' : 'no');
  const rows = [
    { group: 'Your colony' },
    ['Start workers', ...v((d) => d.player.workers)],
    ['Start soldiers', ...v((d) => d.player.soldiers)],
    ['Start food', ...v((d) => d.player.food)],
    ['Drop-food cooldown', ...v((d) => `${d.feedCooldown} s`)],
    { group: 'Spiders' },
    ['Spiders', ...v((d) => yes(d.spiders))],
    ['First spider', ...v((d) => (d.spiders ? secs(d.spiderFirst) : '—'))],
    ['Interval', ...v((d) => (d.spiders ? `${d.spiderEvery[0]}–${d.spiderEvery[1]} s` : '—'))],
    { group: 'Red colony' },
    ['Rival', ...v((d) => yes(d.rival))],
    ['Start workers / soldiers', ...v((d) => (d.ai ? `${d.ai.workers} / ${d.ai.soldiers}` : '—'))],
    ['Start food', ...v((d) => (d.ai ? d.ai.food : '—'))],
    ['Foraging bonus', ...v((d) => (d.ai ? `×${d.ai.forageMul}` : '—'))],
    ['Soldier share', ...v((d) => (d.ai ? pct(d.ai.soldierRatio) : '—'))],
    ['Free research every', ...v((d) => (d.ai ? secs(d.ai.researchEvery) : '—'))],
    ['First raid not before', ...v((d) => (d.ai ? secs(d.ai.raidGrace) : '—'))],
    ['Raid party', ...v((d) => (d.ai ? `${d.ai.raidSize} +${d.ai.raidGrowth}/raid, max ${d.ai.raidMax}` : '—'))],
  ];
  addSection('difficulty', 'Difficulty', 'Side-by-side settings for each difficulty.',
    [{ cols: [{ h: 'Setting', l: true }, ...keys.map((k) => ({ h: D[k].name }))], rows }]);
}

// ---------- constants ----------

function constantsSection() {
  const P = CFG.PHERO;
  const rows = [
    { group: 'World' },
    ['Meadow size', `${CFG.WORLD_W} × ${CFG.WORLD_H}`, 'World units'],
    ['Nest size', `${CFG.NEST.W} × ${CFG.NEST.H}`, 'Cross-section units'],
    ['Grid cell', CFG.CELL, 'Pheromone / rock grid resolution'],
    ['Day length', secs(CFG.DAY_LENGTH), 'Real seconds at 1× speed'],
    ['Natural food', `${CFG.NATURAL_FOOD} piles per 1.6 M units²`, 'Regrows every 20–35 s up to this density'],
    ['Pile size', `${CFG.FOOD_PILE[0]}–${CFG.FOOD_PILE[1]}`, 'Food per natural pile'],
    ['Drop food', CFG.FEED.amount, 'Sugar per use of the tool'],
    { group: 'Foraging' },
    ['Carry', CFG.CARRY, 'Food per trip (Heavy Loads +50%)'],
    ['Food smell range', CFG.FOOD_SENSE, 'Plus the pile radius'],
    ['Sensors', `${CFG.SENSOR_DIST} ahead, ±${CFG.SENSOR_ANGLE} rad`, 'Three-sensor trail following'],
    ['Give up search after', `${CFG.MAX_SEARCH} s`, 'Then head home'],
    ['Trail patience', `${CFG.TRAIL_PATIENCE} s`, 'Following a scent without finding food, then explore'],
    ['Weakest followed scent', CFG.TRAIL_MIN, '3×3 sum; older trails stop luring'],
    ['Home trail', `half-life ${P.home.halfLife} s, τ ${P.home.tau} s`, 'Decay over time / strength drop along the path'],
    ['Food trail', `half-life ${P.food.halfLife} s, τ ${P.food.tau} s`, ''],
    ['Alarm', `half-life ${P.alarm.halfLife} s`, ''],
    ['Corpse food', CFG.CORPSE_FOOD, 'Left by every dead ant'],
    { group: 'Colony' },
    ['Queen', `${CFG.QUEEN.hp} HP, regen ${CFG.QUEEN.regen}/s`, `Starving costs ${CFG.QUEEN.starve} HP/s`],
    ['Starving ants', `${CFG.STARVE_DMG} HP/s avg`, ''],
    ['Reserve', `${CFG.RESERVE_SECONDS} s of upkeep`, 'Eggs, digging and research leave this untouched'],
    ['Building budget', pct(CFG.BUILD_SHARE), 'Default share of income set aside while digging or research runs'],
    ['Set-aside cap', CFG.BUILD_FUND_CAP, ''],
    ['Free for building above', `reserve + ${CFG.BUILD_FREE_ABOVE}`, ''],
    { group: 'Fighting' },
    ['Soldier patrol radius', CFG.PATROL_R, ''],
    ['Soldier sight', CFG.SOLDIER_SENSE, 'Raiders only react within 35'],
    ['Raid damage to queen', pct(CFG.RAID_DMG), 'Of a raider’s bite, reduced by Guard Posts'],
    ['Nest radius', CFG.NEST_R, ''],
  ];
  addSection('constants', 'Constants', 'Everything else that shapes the simulation.',
    [{ cols: [{ h: 'Name', l: true }, { h: 'Value', l: true }, { h: 'Meaning', wrap: true }], rows }]);
}

// ---------- simulation ----------

function snapshot(w) {
  const p = w.player, f = p.flows(), n = p.counts, r = w.rival;
  return {
    alive: p.alive, ants: p.ants.length, workers: n.workers, soldiers: n.soldiers, brood: p.brood.length, food: p.food,
    income: f.income, spent: f.spent, net: f.net, tech: Object.values(p.tech).reduce((a, b) => a + b, 0),
    chambers: p.nest.chambers.filter((c) => c.built && c.type !== 'entrance').length, queen: p.queen.hp,
    rivalAnts: r ? r.ants.length : 0, rivalSoldiers: r ? r.counts.soldiers : 0,
  };
}

let simRunning = false;

async function runSim() {
  if (simRunning) {
    simRunning = false;
    return;
  }
  simRunning = true;
  const btn = document.getElementById('sim-run'), status = document.getElementById('sim-status');
  btn.textContent = 'Stop';
  const diff = document.getElementById('sim-diff').value;
  const minutes = Number(document.getElementById('sim-min').value);
  const seeds = Number(document.getElementById('sim-seeds').value);
  const seed0 = Number(document.getElementById('sim-seed0').value);
  const research = document.getElementById('sim-research').checked;
  const runs = [];
  const t0 = performance.now();
  for (let s = 0; s < seeds && simRunning; s++) {
    const seed = seed0 + s, w = new World({ difficulty: diff, seed }), bot = new AutoPlayer(w, { research });
    const rec = { seed, mins: [], outcome: 'survived', lostAt: null };
    for (let m = 1; m <= minutes && simRunning; m++) {
      for (let i = 0; i < 60 / CFG.TICK; i++) {
        w.update(CFG.TICK);
        bot.update(CFG.TICK);
        if (w.result) {
          if (w.result.win) rec.outcome = `won at ${fx(w.time / 60)} min`;
          else {
            rec.outcome = w.result.title;
            rec.lostAt = w.time / 60;
          }
          w.result = null;
          if (rec.lostAt) break;
        }
      }
      rec.mins.push(snapshot(w));
      status.textContent = `Seed ${seed} (${s + 1}/${seeds}) · minute ${m}/${minutes} · ${fx((performance.now() - t0) / 1000)} s`;
      await new Promise((r) => setTimeout(r, 0));
      if (rec.lostAt) break;
    }
    const p = w.player;
    rec.end = { peak: p.stats.peak, gathered: p.stats.collected, born: p.stats.born, died: p.stats.died, raids: w.rival ? w.rival.raids : 0, kills: w.stats.kills };
    runs.push(rec);
    renderSim(runs, minutes);
  }
  status.textContent = `${simRunning ? 'Done' : 'Stopped'}: ${runs.length} run${runs.length === 1 ? '' : 's'} in ${fx((performance.now() - t0) / 1000)} s`;
  simRunning = false;
  btn.textContent = 'Run';
}

function renderSim(runs, minutes) {
  const summary = runs.map((r) => {
    const last = r.mins[r.mins.length - 1];
    return [r.seed, r.lostAt ? `<span class="down">${r.outcome}</span>` : `<span class="up">${r.outcome}</span>`, fx(r.lostAt || r.mins.length, 1),
      last.ants, r.end.peak, fx(r.end.gathered, 0), r.end.born, r.end.died, last.tech, last.chambers, r.end.raids, r.end.kills, last.rivalAnts];
  });
  document.getElementById('sim-summary').innerHTML = tableHtml([
    { h: 'Seed', l: true }, { h: 'Outcome', l: true }, { h: 'Minutes' }, { h: 'Ants' }, { h: 'Peak' }, { h: 'Gathered' }, { h: 'Born' },
    { h: 'Died' }, { h: 'Research lvls' }, { h: 'Chambers' }, { h: 'Raids on you' }, { h: 'Kills' }, { h: 'Red ants' },
  ], summary);

  const rows = [];
  for (let m = 0; m < minutes; m++) {
    const alive = runs.filter((r) => r.mins[m] && !(r.lostAt && r.lostAt < m + 1));
    if (!alive.length) break;
    const a = (k) => alive.reduce((s, r) => s + r.mins[m][k], 0) / alive.length;
    const net = a('net');
    rows.push([m + 1, `${alive.length}/${runs.length}`, fx(a('ants'), 0), fx(a('workers'), 0), fx(a('soldiers'), 0), fx(a('brood'), 0), fx(a('food'), 0),
      `<span class="up">+${fx(a('income'), 0)}</span>`, `<span class="down">−${fx(a('spent'), 0)}</span>`,
      `<span class="${net >= 0 ? 'up' : 'down'}">${net >= 0 ? '+' : '−'}${fx(Math.abs(net), 0)}</span>`,
      fx(a('tech'), 1), fx(a('chambers'), 1), fx(a('queen'), 0), fx(a('rivalAnts'), 0), fx(a('rivalSoldiers'), 0)]);
  }
  document.getElementById('sim-minutes').innerHTML = tableHtml([
    { h: 'Min', l: true }, { h: 'Alive' }, { h: 'Ants' }, { h: 'Workers' }, { h: 'Soldiers' }, { h: 'Brood' }, { h: 'Food' },
    { h: 'Income/min' }, { h: 'Spent/min' }, { h: 'Net/min' }, { h: 'Research' }, { h: 'Chambers' }, { h: 'Queen HP' }, { h: 'Red ants' }, { h: 'Red soldiers' },
  ], rows);
}

// ---------- boot ----------

casteSection();
foragingSection();
broodSection();
chamberSection();
researchSection();
threatSection();
difficultySection();
constantsSection();
sections.push({ id: 'sim', title: 'Simulation' });
document.getElementById('nav').innerHTML = sections.map((s) => `<a href="#${s.id}">${s.title}</a>`).join('');
const diffSel = document.getElementById('sim-diff');
diffSel.innerHTML = Object.entries(CFG.DIFFICULTY).map(([k, d]) => `<option value="${k}" ${k === 'normal' ? 'selected' : ''}>${d.name}</option>`).join('');
document.getElementById('sim-run').onclick = runSim;
renderSim([], 0);

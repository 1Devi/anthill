'use strict';
// DOM side of the game: resource bar, bottom HUD (minimap, selection, orders, commands), log and dialogs.

const ICONS = {
  inspect: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10" cy="10" r="6"/><path d="M15 15l5.5 5.5"/></svg>',
  food: '<svg viewBox="0 0 24 24"><rect x="4" y="11" width="7" height="7" rx="1" fill="#f6f3ea"/><rect x="12" y="12" width="6" height="6" rx="1" fill="#e9e2cf"/><rect x="8" y="5" width="7" height="7" rx="1" fill="#fffdf6"/></svg>',
  lure: '<svg viewBox="0 0 24 24" fill="none" stroke="#8cf07a" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="1 4"><path d="M3 18c4-9 7 3 11-5s5-6 7-6"/></svg>',
  wall: '<svg viewBox="0 0 24 24"><path d="M2 19l4-8 4 3 4-7 8 12z" fill="#9a9086"/><path d="M6 11l4 3 4-7" stroke="#cfc6bb" stroke-width="1.2" fill="none"/></svg>',
  erase: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M4 15l8.5-8.5 6 6L12 19H8z"/><path d="M9 19h11"/></svg>',
  rally: '<svg viewBox="0 0 24 24"><path d="M6 21V4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M7 4.5h11l-3 4 3 4H7z" fill="#ffd25a"/></svg>',
  storage: '<svg viewBox="0 0 24 24"><path d="M3 19c1-6 5-9 9-9s8 3 9 9z" fill="#e6c46e"/><circle cx="9" cy="15" r="1" fill="#8a6a3a"/><circle cx="13" cy="13" r="1" fill="#8a6a3a"/><circle cx="15" cy="16" r="1" fill="#8a6a3a"/></svg>',
  nursery: '<svg viewBox="0 0 24 24"><ellipse cx="8.5" cy="14" rx="4" ry="5.5" fill="#f2ead9"/><ellipse cx="16" cy="15" rx="3.4" ry="4.6" fill="#e2d6bd"/></svg>',
  barracks: '<svg viewBox="0 0 24 24"><path d="M3 19c2-7 5-10 9-10s7 3 9 10z" fill="#b48a5c"/><ellipse cx="12" cy="15.5" rx="3" ry="2" fill="#1b120b"/></svg>',
  cancel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  garden: '<svg viewBox="0 0 24 24"><path d="M4 12a8 6 0 0 1 16 0z" fill="#f1e9d3"/><rect x="10" y="12" width="4" height="7" rx="1" fill="#d9cfb3"/><circle cx="9" cy="9" r="1.2" fill="#b8a27a"/><circle cx="14" cy="8" r="1" fill="#b8a27a"/></svg>',
  infirmary: '<svg viewBox="0 0 24 24"><path d="M4 19C4 9 11 4 20 4c0 9-5 16-16 15z" fill="#6f9a45"/><path d="M12 8v8M8 12h8" stroke="#eaffd8" stroke-width="2.2" stroke-linecap="round"/></svg>',
  guard: '<svg viewBox="0 0 24 24"><path d="M12 3l7.5 3v6c0 4.6-3.2 7.7-7.5 9.2C7.7 19.7 4.5 16.6 4.5 12V6z" fill="#c27b4a"/><path d="M12 7v10M8 11h8" stroke="#1b120b" stroke-width="1.6" stroke-linecap="round"/></svg>',
  hall: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><circle cx="12" cy="12" r="3" stroke="#8cf07a"/><circle cx="12" cy="12" r="6.5" stroke="#5aa0ff" opacity="0.8"/><circle cx="12" cy="12" r="10" stroke="#8cf07a" opacity="0.45"/></svg>',
};

const COMMANDS = {
  surface: [
    { tool: 'inspect', name: 'Inspect', desc: 'Click an ant, spider, food pile or nest to see details. Drag to pan.' },
    { tool: 'food', name: 'Drop food', desc: 'Click to drop a pile of sugar. Recharges after use.' },
    { tool: 'lure', name: 'Scent trail', desc: 'Drag from the nest towards a spot: ants follow the scent in the direction you paint.' },
    { tool: 'wall', name: 'Rocks', desc: 'Drag to place rocks. Ants walk around them; spiders climb over. [ and ] change brush size.' },
    { tool: 'erase', name: 'Erase', desc: 'Drag to remove rocks and your scent marks.' },
    { tool: 'rally', name: 'Rally point', desc: 'Click to send soldiers there. Click the red nest to raid it. Right-click to recall.' },
  ],
  nest: [
    { build: 'storage' },
    { build: 'nursery' },
    { build: 'barracks' },
    { build: 'garden' },
    { build: 'infirmary' },
    { build: 'guard' },
    { build: 'hall' },
    { cancel: true, name: 'Cancel', desc: 'Stop placing chambers (Esc).' },
  ],
};

const SHORT_NAMES = { barracks: 'Quarters', guard: 'Guard Post', garden: 'Garden' };
const TECH_GROUPS = ['Combat', 'Foraging', 'Colony', 'Nest'];

const fmtTime = (s) => (s < 60 ? `${Math.round(s)} s` : `${(s / 60).toFixed(1)} min`);
const fmtRate = (v) => (Math.abs(v) < 0.05 ? '0' : Math.abs(v) < 10 ? v.toFixed(1) : Math.round(v).toString());
const signed = (v, sign) => (Math.abs(v) < 0.05 ? '0' : sign + fmtRate(Math.abs(v)));

function timeAgo(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(ts).toLocaleDateString();
}

const ICON_SOUND = '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>';
const ICON_MUTED = '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

class UI {
  constructor(game) {
    this.g = game;
    this.diff = 'normal';
    this.statT = 0;
    this.logCursor = 0;
    this.tip = null; // { el, fn } of the HUD element whose tooltip is showing
    this.cmdView = null;
    this.bind();
    this.buildCommands('surface');
    this.updateSoundButton();
    this.refreshContinue();
  }

  $(id) {
    return document.getElementById(id);
  }

  bind() {
    const diffs = this.$('diffs');
    for (const [key, d] of Object.entries(CFG.DIFFICULTY)) {
      const b = document.createElement('button');
      b.className = 'diff' + (key === this.diff ? ' active' : '');
      b.innerHTML = `<b>${d.name}</b><span>${d.desc}</span>`;
      b.onclick = () => {
        this.diff = key;
        diffs.querySelectorAll('.diff').forEach((x) => x.classList.toggle('active', x === b));
      };
      diffs.appendChild(b);
    }
    this.$('b-start').onclick = () => {
      this.$('start').classList.add('hidden');
      this.g.start(this.diff);
    };

    document.querySelectorAll('#views button').forEach((b) => (b.onclick = () => this.g.setView(b.dataset.view)));
    document.querySelectorAll('#speeds button').forEach((b) => (b.onclick = () => this.g.setSpeed(+b.dataset.speed)));
    this.$('btn-help').onclick = () => this.toggleHelp(true);
    this.$('b-help-close').onclick = () => this.toggleHelp(false);
    this.$('btn-panel').onclick = () => {
      this.$('app').classList.toggle('hud-hidden');
      this.g.onResize();
    };
    this.$('btn-settings').onclick = () => this.togglePopover('settings', 'btn-settings');
    this.$('btn-sound').onclick = () => this.togglePopover('sound-pop', 'btn-sound');
    document.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('.popover, #btn-settings, #btn-sound')) this.closePopovers();
    });

    const forage = this.$('s-forage'), soldier = this.$('s-soldier');
    forage.oninput = () => {
      this.g.world.player.foragerRatio = forage.value / 100;
      this.$('v-forage').textContent = forage.value + '%';
    };
    soldier.oninput = () => {
      this.g.world.player.soldierRatio = soldier.value / 100;
      this.$('v-soldier').textContent = soldier.value + '%';
    };
    const build = this.$('s-build');
    build.oninput = () => {
      this.g.world.player.buildShare = build.value / 100;
      this.$('v-build').textContent = build.value + '%';
    };
    this.$('c-lay').onchange = (e) => (this.g.world.player.autoLay = e.target.checked);
    this.$('b-egg-w').onclick = () => this.layEgg('worker');
    this.$('b-egg-s').onclick = () => this.layEgg('soldier');
    this.$('b-recall').onclick = () => this.g.recall();
    this.$('c-phero').onchange = (e) => (this.g.show.phero = e.target.checked);
    this.$('c-rival').onchange = (e) => (this.g.show.rival = e.target.checked);

    this.$('b-continue').onclick = () => {
      this.$('end').classList.add('hidden');
      this.g.setSpeed(1);
    };
    this.$('b-restart').onclick = () => {
      this.$('end').classList.add('hidden');
      this.$('start').classList.remove('hidden');
      this.g.start('peaceful', true);
      this.refreshContinue();
    };

    this.$('b-mute').onclick = () => {
      this.g.sound.toggleMute();
      this.updateSoundButton();
    };
    const vol = this.$('s-volume');
    vol.oninput = () => {
      this.g.sound.setVolume(vol.value / 100);
      this.updateSoundButton();
    };

    this.$('btn-saves').onclick = () => this.toggleSaves(true);
    this.$('b-saves-close').onclick = () => this.toggleSaves(false);
    this.$('b-load-menu').onclick = () => this.toggleSaves(true);
    this.$('b-resume').onclick = () => {
      const l = SaveStore.latest();
      if (l && this.g.loadSave(l.save)) this.closeOverlays();
    };
    this.$('b-export').onclick = () => this.exportSave();
    this.$('b-import').onclick = () => this.$('f-import').click();
    this.$('f-import').onchange = (e) => this.importSave(e.target.files[0]);

    this.bindTip(this.$('r-food'), () => this.tipFood());
    this.bindTip(this.$('r-pop'), () => this.tipPop());
    this.bindTip(this.$('r-workers'), () => this.tipWorkers());
    this.bindTip(this.$('r-soldiers'), () => this.tipSoldiers());
    this.bindTip(this.$('r-brood'), () => this.tipBrood());
    this.bindTip(this.$('r-queen'), () => this.tipQueen());

    this.$('btn-research').onclick = () => this.toggleResearch(true);
    this.$('b-research-close').onclick = () => this.toggleResearch(false);
    // Delegated: the cards are rebuilt while the dialog is open.
    this.$('research').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tech]');
      if (b) {
        const why = this.g.world.player.startResearch(b.dataset.tech);
        if (why) this.toast(why, 'warn');
        this.renderResearch();
      } else if (e.target.closest('#b-research-cancel')) {
        this.g.world.player.cancelResearch();
        this.renderResearch();
      }
    });
  }

  // ---------- tooltips ----------

  bindTip(el, fn) {
    el.addEventListener('mouseenter', (e) => {
      this.tip = { el, fn };
      this.tooltip(e.clientX, e.clientY, fn());
    });
    el.addEventListener('mousemove', (e) => this.tip && this.tooltip(e.clientX, e.clientY, this.tip.fn()));
    el.addEventListener('mouseleave', () => {
      this.tip = null;
      this.hideTooltip();
    });
  }

  tooltip(x, y, html) {
    const t = this.$('tooltip');
    t.innerHTML = html;
    t.classList.remove('hidden');
    t.style.left = clamp(x + 14, 4, window.innerWidth - t.offsetWidth - 6) + 'px';
    const below = y + 18 + t.offsetHeight < window.innerHeight;
    t.style.top = (below ? y + 18 : y - t.offsetHeight - 10) + 'px';
  }

  hideTooltip() {
    this.$('tooltip').classList.add('hidden');
  }

  tipRows(title, rows, note) {
    const r = rows.map(([k, v, cls]) => `<div class="tt-row${cls === 'total' ? ' total' : ''}"><span>${k}</span><span class="${cls || ''}">${v}</span></div>`).join('');
    return `<div class="tt-title">${title}</div>${r}${note ? `<div class="tt-note">${note}</div>` : ''}`;
  }

  tipFood() {
    const p = this.g.world.player, f = p.flows(), n = p.counts;
    const per = (k) => (k * 60).toFixed(1);
    return this.tipRows('Food', [
      ['Stored', `${Math.floor(p.food)} / ${p.caps.food}`],
      ['Brought in', `${signed(f.gathered, '+')} /min`, 'up'],
      ['Grown in gardens', `${signed(f.farmed, '+')} /min`, 'up'],
      ['Eaten', `${signed(f.upkeep, '−')} /min`, 'down'],
      ['&nbsp;&nbsp;workers', `${per(n.workers * CFG.CASTE.worker.upkeep)}`],
      ['&nbsp;&nbsp;soldiers', `${per(n.soldiers * CFG.CASTE.soldier.upkeep)}`],
      ['&nbsp;&nbsp;larvae', `${per(n.larvae * CFG.BROOD.larvaUpkeep)}`],
      ['&nbsp;&nbsp;queen', p.alive ? per(CFG.QUEEN.upkeep) : '0'],
      ['Spent on eggs', `${signed(f.eggs, '−')} /min`, 'down'],
      ['Spent on digging', `${signed(f.digging, '−')} /min`, 'down'],
      ['Spent on research', `${signed(f.research, '−')} /min`, 'down'],
      ['Net', `${signed(f.net, f.net >= 0 ? '+' : '−')} /min`, 'total'],
      ['Set aside for building', Math.floor(p.buildFund)],
    ], `Averaged over the last minute; eating is the current rate. While digging or research runs, ${Math.round(p.buildShare * 100)}% of income is set aside for it.`);
  }

  tipPop() {
    const p = this.g.world.player;
    return this.tipRows('Population', [
      ['Ants', `${p.ants.length} / ${p.caps.pop}`],
      ['Brood (counts too)', p.brood.length],
      ['Raised so far', p.stats.born],
      ['Lost so far', p.stats.died],
    ], 'Dig Living Quarters to raise the cap.');
  }

  tipWorkers() {
    const p = this.g.world.player, n = p.counts;
    return this.tipRows('Workers', [
      ['Foraging outside', n.foragers],
      ['Inside the nest', n.inside],
      ['&nbsp;&nbsp;digging', p.diggers],
      ['&nbsp;&nbsp;tending gardens', `${p.gardeners} / ${p.caps.gardeners || 0}`],
      ['&nbsp;&nbsp;nursing', p.nurses],
      ['Forager share', Math.round(p.foragerRatio * 100) + '%'],
    ], 'Change the share with the Foragers slider.');
  }

  tipSoldiers() {
    const p = this.g.world.player, n = p.counts;
    const order = p.rally ? (p.rally.raid ? 'Raiding the red nest' : 'Holding the rally point') : 'Guarding the nest';
    return this.tipRows('Soldiers', [
      ['On duty', n.soldiers],
      ['In the brood', n.broodSoldiers],
      ['Share of new ants', Math.round(p.soldierRatio * 100) + '%'],
      ['Order', order],
    ], 'Set a rally point to send them somewhere.');
  }

  tipBrood() {
    const p = this.g.world.player, n = p.counts;
    return this.tipRows('Brood', [
      ['Eggs', n.eggs],
      ['Larvae', n.larvae],
      ['Pupae', n.pupae],
      ['Slots', `${p.brood.length} / ${p.caps.brood}`],
      ['Nursing speed', Math.round(p.nursing * 100) + '%'],
    ], 'Workers inside the nest speed up development. Dig Nurseries for more slots.');
  }

  tipQueen() {
    const p = this.g.world.player;
    const state = !p.alive ? 'Dead' : p.underAttackT > 0 ? 'Under attack!' : p.starving ? 'Starving' : p.queen.hp < p.queen.maxHp ? 'Recovering' : 'Healthy';
    return this.tipRows('Queen', [
      ['Health', `${Math.ceil(p.queen.hp)} / ${p.queen.maxHp}`],
      ['State', state],
    ], 'If the queen dies, the colony is lost.');
  }

  // ---------- commands ----------

  buildCommands(view) {
    if (this.cmdView === view) return;
    this.cmdView = view;
    const grid = this.$('cmd-grid');
    grid.innerHTML = '';
    grid.classList.toggle('wide', view === 'nest');
    this.$('cmd-title').textContent = view === 'surface' ? 'Commands' : 'Dig chambers';
    COMMANDS[view].forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'cmd';
      let name = c.name, desc = c.desc, icon = ICONS[c.tool || c.build || 'cancel'], cost = '';
      if (c.build) {
        const T = CFG.CHAMBERS[c.build];
        name = T.name;
        desc = `${T.desc}. Costs ${T.cost} food. Click the soil to place it; workers inside dig it out.`;
        cost = `<span class="cost">${T.cost}</span>`;
        b.dataset.build = c.build;
        b.onclick = () => this.g.setBuild(this.g.buildType === c.build ? null : c.build);
      } else if (c.tool) {
        b.dataset.tool = c.tool;
        b.onclick = () => this.g.setTool(c.tool);
      } else {
        b.onclick = () => this.g.setBuild(null);
      }
      const key = c.cancel ? 'Esc' : String(i + 1);
      b.innerHTML = `<span class="key">${key}</span>${cost}${icon}<span>${SHORT_NAMES[c.build] || name}</span>`;
      this.bindTip(b, () => `<div class="tt-title">${name} <kbd>${key}</kbd></div>${desc}`);
      grid.appendChild(b);
    });
    if (view === 'surface') this.setTool(this.g.tool);
    else this.setBuild(this.g.buildType);
  }

  setView(v) {
    document.querySelectorAll('#views button').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
    this.buildCommands(v);
    this.hideTooltip();
  }

  setSpeed(s) {
    document.querySelectorAll('#speeds button').forEach((b) => b.classList.toggle('active', +b.dataset.speed === s));
  }

  setTool(t) {
    document.querySelectorAll('#cmd-grid [data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === t));
    if (this.cmdView === 'surface') this.$('cmd-hint').textContent = COMMANDS.surface.find((c) => c.tool === t).desc;
  }

  setBuild(type) {
    document.querySelectorAll('#cmd-grid [data-build]').forEach((b) => b.classList.toggle('active', b.dataset.build === type));
    if (this.cmdView === 'nest') {
      this.$('cmd-hint').textContent = type
        ? `Click the soil to place a ${CFG.CHAMBERS[type].name}. Shift-click to place several.`
        : 'Drag or use WASD to look around, wheel to zoom. Pick a chamber, then click the soil.';
    }
  }

  // Small dropdown panels hanging under their top-bar button.
  togglePopover(id, btnId) {
    const pop = this.$(id), btn = this.$(btnId), show = pop.classList.contains('hidden');
    this.closePopovers();
    if (!show) return;
    pop.classList.remove('hidden');
    btn.classList.add('active');
    const r = btn.getBoundingClientRect();
    pop.style.left = clamp(r.left + r.width / 2 - pop.offsetWidth / 2, 6, window.innerWidth - pop.offsetWidth - 6) + 'px';
  }

  closePopovers() {
    for (const [id, btn] of [['settings', 'btn-settings'], ['sound-pop', 'btn-sound']]) {
      this.$(id).classList.add('hidden');
      this.$(btn).classList.remove('active');
    }
  }

  layEgg(caste) {
    const why = this.g.world.player.layEgg(caste);
    if (why) this.toast(why, 'warn');
  }

  toggleHelp(on) {
    this.$('help').classList.toggle('hidden', !on);
  }

  // ---------- research ----------

  get researchOpen() {
    return !this.$('research').classList.contains('hidden');
  }

  toggleResearch(on) {
    this.$('research').classList.toggle('hidden', !on);
    if (on) this.renderResearch();
  }

  renderResearch() {
    const p = this.g.world.player, cur = p.researching, halls = p.caps.halls || 0;
    const st = this.$('research-status');
    if (!halls) {
      st.className = 'research-status warn';
      st.innerHTML = 'Dig a <b>&nbsp;Scent Hall&nbsp;</b> in the nest to start researching.';
    } else if (cur) {
      const left = (cur.total - cur.t) / p.researchSpeed();
      st.className = 'research-status';
      st.innerHTML = `<div class="grow">Researching <b>${techName(cur.id, p.tech[cur.id] + 1)}</b> · ${fmtTime(left)} left` +
        `<div class="bar"><i style="width:${(cur.t / cur.total) * 100}%"></i></div></div>` +
        `<button id="b-research-cancel" class="btn" title="Returns ${Math.round(CFG.RESEARCH_REFUND * 100)}% of the cost">Cancel</button>`;
    } else {
      st.className = 'research-status';
      st.innerHTML = `Pick something to research. Speed ×${p.researchSpeed().toFixed(1)} with ${halls} Scent Hall${halls > 1 ? 's' : ''}; more halls research faster.`;
    }
    const groups = TECH_GROUPS.map((gname) => {
      const cards = CFG.RESEARCH.filter((r) => r.group === gname).map((r) => {
        const lvl = p.tech[r.id], max = r.cost.length, done = lvl >= max;
        const active = cur && cur.id === r.id;
        const why = p.canResearch(r.id);
        const pips = Array.from({ length: max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('');
        let foot;
        if (done) foot = '<span>Complete</span>';
        else if (active) foot = `<span>${Math.floor((cur.t / cur.total) * 100)}%</span>`;
        else {
          foot = `<span>${r.cost[lvl]} food · ${r.time[lvl]} s</span>` +
            `<button class="btn" data-tech="${r.id}" ${why ? 'disabled' : ''}>Research</button>`;
        }
        // Show prerequisites on the card; food and the missing hall are explained elsewhere.
        const hardReq = why && why.startsWith('Needs') && !why.endsWith('food') && why !== 'Needs a Scent Hall';
        const blocker = !done && !active && hardReq ? `<div class="req">${why}</div>` : '';
        return `<div class="tech${done ? ' done' : ''}${active ? ' active' : ''}"><div class="tech-top"><b>${r.name}</b><span class="pips">${pips}</span></div>` +
          `<p>${r.desc}</p><div class="tech-foot">${foot}</div>${blocker}</div>`;
      }).join('');
      return `<div class="tech-group"><h4>${gname}</h4>${cards}</div>`;
    }).join('');
    this.$('tech-groups').innerHTML = groups;
  }

  get helpOpen() {
    return !this.$('help').classList.contains('hidden');
  }

  onNewGame() {
    const p = this.g.world.player;
    this.$('s-forage').value = Math.round(p.foragerRatio * 100);
    this.$('v-forage').textContent = Math.round(p.foragerRatio * 100) + '%';
    this.$('s-soldier').value = Math.round(p.soldierRatio * 100);
    this.$('v-soldier').textContent = Math.round(p.soldierRatio * 100) + '%';
    this.$('s-build').value = Math.round(p.buildShare * 100);
    this.$('v-build').textContent = Math.round(p.buildShare * 100) + '%';
    this.$('c-lay').checked = p.autoLay;
    this.$('c-phero').checked = this.g.show.phero;
    this.$('log').innerHTML = '';
    this.logCursor = 0;
    this.statT = 0;
  }

  toast(text, kind = 'info') {
    const log = this.$('log');
    const el = document.createElement('div');
    el.className = 'msg ' + kind;
    el.textContent = text;
    log.appendChild(el);
    while (log.children.length > 5) log.firstChild.remove();
    setTimeout(() => el.classList.add('fade'), 7000);
    setTimeout(() => el.remove(), 7700);
  }

  // ---------- sound ----------

  updateSoundButton() {
    const s = this.g.sound, off = s.muted || s.volume === 0;
    for (const b of [this.$('btn-sound'), this.$('b-mute')]) {
      b.innerHTML = off ? ICON_MUTED : ICON_SOUND;
      b.classList.toggle('off', off);
    }
    this.$('s-volume').value = Math.round(s.volume * 100);
    this.$('v-volume').textContent = off ? 'off' : Math.round(s.volume * 100) + '%';
  }

  // ---------- per-frame ----------

  update(dt) {
    const w = this.g.world;
    if (!this.g.demo) {
      while (this.logCursor < w.events.length) {
        const e = w.events[this.logCursor++];
        this.toast(e.text, e.kind);
      }
    } else {
      this.logCursor = w.events.length;
    }
    this.statT -= dt;
    if (this.statT > 0) return;
    this.statT = 0.15;
    this.updateResources();
    this.updateHud();
    this.updateSelection();
    this.researchT = (this.researchT || 0) - 0.15;
    if (this.researchOpen && this.researchT <= 0) {
      this.researchT = 0.5;
      this.renderResearch();
    }
    if (this.tip && document.body.contains(this.tip.el)) {
      this.$('tooltip').innerHTML = this.tip.fn();
    }
  }

  res(id, val, sub, cls = {}) {
    const el = this.$(id);
    el.querySelector('.val').innerHTML = val;
    if (sub !== null) el.querySelector('.sub').innerHTML = sub;
    for (const k of ['warn', 'full', 'flash']) el.classList.toggle(k, !!cls[k]);
  }

  updateResources() {
    const w = this.g.world, p = w.player, n = p.counts, caps = p.caps, f = p.flows();
    const day = w.dayInfo();
    this.$('clock').textContent = `Day ${day.day} · ${String(day.hour).padStart(2, '0')}:${String(day.minute).padStart(2, '0')}`;
    this.$('weather').textContent = w.rain > 0 ? 'Rain' : day.night > 0.5 ? 'Night' : '';

    // One number: everything brought in minus everything eaten or spent, per minute.
    const net = f.net;
    this.res('r-food', `${Math.floor(p.food)}<small>/${caps.food}</small>`,
      `<em class="${net >= 0 ? 'up' : 'down'}">${signed(net, net >= 0 ? '+' : '−')}</em> /min`,
      { warn: p.food < 10, full: p.food >= caps.food - 1, flash: p.starving });
    const pop = p.ants.length + p.brood.length;
    this.res('r-pop', `${p.ants.length}<small>/${caps.pop}</small>`, pop >= caps.pop ? 'cap reached' : 'population', { full: pop >= caps.pop });
    this.res('r-workers', n.workers, `${n.foragers} out · ${n.inside} in`);
    this.res('r-soldiers', n.soldiers, p.rally ? (p.rally.raid ? 'raiding' : 'at rally') : 'guarding');
    this.res('r-brood', `${p.brood.length}<small>/${caps.brood}</small>`, `${n.eggs} · ${n.larvae} · ${n.pupae}`, { full: p.brood.length >= caps.brood });
    this.res('r-queen', Math.ceil(p.queen.hp), null, { warn: p.queen.hp < p.queen.maxHp * 0.4, flash: p.underAttackT > 0 });
    this.$('r-queen').querySelector('.hp i').style.width = (p.queen.hp / p.queen.maxHp) * 100 + '%';
    const rp = this.$('btn-research').querySelector('.rprog'), cur = p.researching;
    rp.classList.toggle('on', !!cur);
    rp.innerHTML = cur ? `<b style="width:${(cur.t / cur.total) * 100}%"></b>` : '';
    this.$('btn-research').title = cur ? `Researching ${techName(cur.id, p.tech[cur.id] + 1)} (R)` : 'Research (R)';
  }

  updateHud() {
    const g = this.g, w = g.world, p = w.player;
    const why = (c) => p.canLay(c);
    const ew = this.$('b-egg-w'), es = this.$('b-egg-s');
    ew.disabled = !!why('worker');
    es.disabled = !!why('soldier');
    ew.title = why('worker') || 'Lay a worker egg now';
    es.title = why('soldier') || 'Lay a soldier egg now';
    this.$('b-recall').disabled = !p.rally;

    const food = document.querySelector('#cmd-grid [data-tool="food"]');
    if (food) {
      let bar = food.querySelector('.cd');
      if (w.feedCooldown > 0) {
        if (!bar) food.appendChild((bar = document.createElement('i'))).className = 'cd';
        bar.style.width = (1 - w.feedCooldown / w.diff.feedCooldown) * 100 + '%';
      } else if (bar) bar.remove();
    }
    document.querySelectorAll('#cmd-grid [data-build]').forEach((b) => {
      b.disabled = p.food < CFG.CHAMBERS[b.dataset.build].cost;
    });
  }

  // ---------- selection panel ----------

  kv(rows) {
    return `<div class="kv">${rows.map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('')}</div>`;
  }

  bar(frac, cls = '') {
    return `<div class="bar ${cls}"><i style="width:${clamp(frac, 0, 1) * 100}%"></i></div>`;
  }

  updateSelection() {
    const g = this.g, w = g.world, p = w.player, sel = g.selected, el = this.$('sel-body');
    this.drawPortrait(sel);
    if (!sel) {
      el.innerHTML = g.view === 'nest' ? this.nestSummary() : this.colonySummary();
      return;
    }
    const o = sel.obj;
    if (sel.type === 'ant') {
      if (o.dead) {
        el.innerHTML = '<div class="name">Fallen ant</div><div class="role">This ant has died.</div>';
        return;
      }
      const low = o.hp < o.maxHp * 0.35;
      el.innerHTML = `<div class="name">${o.colony.isPlayer ? 'Your' : 'Red'} ${CFG.CASTE[o.caste].name.toLowerCase()}</div>` +
        `<div class="role">${o.task}</div>${this.bar(o.hp / o.maxHp, low ? 'red' : '')}` +
        this.kv([
          ['Health', `${Math.ceil(o.hp)} / ${o.maxHp}`],
          ['Age', `${fmtTime(o.age)} of ~${fmtTime(o.life)}`],
          ['Carrying', o.carry ? 'food' : '—'],
          ['Bite', `${o.dmg} dmg/s`],
        ]);
    } else if (sel.type === 'spider') {
      if (o.dead || o.gone) {
        el.innerHTML = `<div class="name">Hunting spider</div><div class="role">${o.dead ? 'Dead — now a pile of food.' : 'It has left the meadow.'}</div>`;
        return;
      }
      el.innerHTML = '<div class="name">Hunting spider</div>' +
        `<div class="role">${o.task}</div>${this.bar(o.hp / o.maxHp, 'red')}` +
        this.kv([['Health', `${Math.ceil(o.hp)} / ${Math.round(o.maxHp)}`], ['Ants eaten', o.eaten], ['Slowed by ants', Math.round(o.slow * 100) + '%']]);
    } else if (sel.type === 'food') {
      el.innerHTML = `<div class="name">${o.name}</div><div class="role">Food source</div>${this.bar(o.amount / o.max, 'amber')}` +
        this.kv([['Food left', `${Math.max(0, Math.floor(o.amount))} / ${Math.round(o.max)}`]]);
    } else if (sel.type === 'colony') {
      const n = o.counts;
      el.innerHTML = `<div class="name">${o.name}</div><div class="role">${o.alive ? (o.underAttackT > 0 ? 'Under attack!' : 'Nest entrance') : 'Destroyed'}</div>` +
        this.bar(o.queen.hp / o.queen.maxHp, o.isPlayer ? '' : 'red') +
        this.kv([
          ['Queen', o.alive ? `${Math.ceil(o.queen.hp)} / ${o.queen.maxHp}` : 'dead'],
          ['Ants', `${n.workers} workers · ${n.soldiers} soldiers`],
          ['Brood', o.brood.length],
          ['Food', Math.floor(o.food)],
        ]);
    }
  }

  colonySummary() {
    const w = this.g.world, p = w.player, n = p.counts;
    return `<div class="name">Your colony</div><div class="role">Day ${w.dayInfo().day} · ${w.diff.name} · click something to inspect it</div>` +
      this.kv([
        ['Workers', `${n.foragers} foraging · ${n.inside} in the nest`],
        ['Soldiers', `${n.soldiers}${p.rally ? (p.rally.raid ? ' · raiding' : ' · at rally point') : ' · guarding'}`],
        ['Food gathered', Math.floor(p.stats.collected)],
        ['Ants raised / lost', `${p.stats.born} / ${p.stats.died}`],
        ['Enemies killed', w.stats.kills],
      ]);
  }

  nestSummary() {
    const p = this.g.world.player, nest = p.nest, built = nest.chambers.filter((c) => c.built && c.type !== 'entrance').length;
    let html = `<div class="name">The nest</div><div class="role">${built} chambers · ${nest.caps.food} food · ${nest.caps.brood} brood · ${nest.caps.pop} ants</div>`;
    if (p.researching) {
      const r = p.researching;
      html += `<div class="dig-row"><span>${techName(r.id, p.tech[r.id] + 1)}</span>${this.bar(r.t / r.total)}<b>${Math.floor((r.t / r.total) * 100)}%</b></div>`;
    }
    if (p.farmRate) html += `<div class="hint">Gardens grow ${fmtRate(p.farmRate)} food/min (${p.gardeners}/${nest.caps.gardeners} gardeners).</div>`;
    if (!nest.queue.length) return html + '<div class="hint">Nothing is being dug. Pick a chamber on the right, then click the soil.</div>';
    for (const id of nest.queue) {
      const c = nest.get(id);
      html += `<div class="dig-row"><span>${CFG.CHAMBERS[c.type].name}</span>${this.bar(c.progress, 'amber')}<b>${Math.floor(c.progress * 100)}%</b></div>`;
    }
    html += p.diggers === 0
      ? '<div class="hint" style="color:var(--red)">No workers inside to dig! Lower the Foragers share.</div>'
      : `<div class="hint">${p.diggers} workers digging.</div>`;
    return html;
  }

  drawPortrait(sel) {
    const c = this.$('portrait'), ctx = c.getContext('2d'), W = c.width;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, W);
    const t = performance.now() / 1000, o = sel && sel.obj;
    if (!sel || sel.type === 'colony') {
      const pal = o ? o.palette : 'player';
      ctx.globalAlpha = o && !o.alive ? 0.4 : 1;
      Sprites.draw(ctx, pal, 'queen', Math.floor(t * 2) & 3, W / 2, W / 2 + 4, -Math.PI / 2 + Math.sin(t) * 0.05, (W * 0.85) / (16 * 1.75));
      ctx.globalAlpha = 1;
    } else if (sel.type === 'ant') {
      ctx.globalAlpha = o.dead ? 0.4 : 1;
      Sprites.draw(ctx, o.colony.palette, o.caste, o.dead || o.fightT > 0 ? 0 : Math.floor(t * 6) & 3, W / 2, W / 2, -Math.PI / 2, (W * 0.9) / (o.len * 1.75));
      ctx.globalAlpha = 1;
    } else if (sel.type === 'spider') {
      ctx.save();
      ctx.translate(W / 2, W / 2 + 8);
      const k = W / (o.r * 7.5);
      ctx.scale(k, k);
      this.g.surface.drawSpider(ctx, { x: 0, y: 0, a: -Math.PI / 2, r: o.r, anim: o.dead ? 0 : t * 3, hp: 1, maxHp: 1, hitT: 0 });
      ctx.restore();
    } else if (sel.type === 'food') {
      const s = this.g.surface.foodSprite(o);
      const k = (W * 0.8) / (s.R * 2);
      ctx.drawImage(s.canvas, W / 2 - s.R * k, W / 2 - s.R * k, s.R * 2 * k, s.R * 2 * k);
    }
  }

  // ---------- saves ----------

  get savesOpen() {
    return !this.$('saves').classList.contains('hidden');
  }

  toggleSaves(on) {
    this.$('saves').classList.toggle('hidden', !on);
    if (on) this.renderSlots();
  }

  closeOverlays() {
    for (const id of ['saves', 'start', 'end', 'help', 'research']) this.$(id).classList.add('hidden');
  }

  refreshContinue() {
    const l = SaveStore.available() ? SaveStore.latest() : null;
    const b = this.$('b-resume');
    b.classList.toggle('hidden', !l);
    if (l) b.innerHTML = `Continue <small>day ${l.save.meta.day}</small>`;
  }

  renderSlots() {
    const box = this.$('slots'), canSave = !this.g.demo && !this.g.over;
    box.innerHTML = '';
    this.$('b-export').disabled = !canSave;
    if (!SaveStore.available()) {
      box.innerHTML = '<p class="hint">Browser storage is blocked here, so games can only be exported to a file.</p>';
      return;
    }
    for (const slot of SAVE_SLOTS) {
      const s = SaveStore.read(slot), m = s && s.meta;
      const name = slot === 'auto' ? 'Autosave' : `Slot ${slot}`;
      const row = document.createElement('div');
      row.className = 'slot';
      const info = m ? `Day ${m.day} · ${m.ants} ants · ${(CFG.DIFFICULTY[m.diff] || {}).name || m.diff} · ${timeAgo(m.savedAt)}` : 'Empty';
      row.innerHTML = `<div class="slot-info"><b>${name}</b><span>${info}</span></div>`;
      const btns = document.createElement('div');
      btns.className = 'slot-btns';
      const add = (label, cls, fn, disabled) => {
        const b = document.createElement('button');
        b.className = 'btn ' + cls;
        b.textContent = label;
        b.disabled = disabled;
        b.onclick = fn;
        btns.appendChild(b);
      };
      if (slot !== 'auto') {
        add('Save', '', () => {
          if (this.g.saveTo(slot)) this.renderSlots();
        }, !canSave);
      }
      add('Load', 'load', () => {
        if (this.g.loadSave(s)) this.closeOverlays();
      }, !s);
      if (s) {
        add('✕', 'ghost', () => {
          if (!confirm(`Delete ${slot === 'auto' ? 'the autosave' : 'slot ' + slot}?`)) return;
          SaveStore.remove(slot);
          this.renderSlots();
          this.refreshContinue();
        }, false);
      }
      row.appendChild(btns);
      box.appendChild(row);
    }
  }

  exportSave() {
    const pack = SaveStore.pack(this.g.world);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(pack)], { type: 'application/json' }));
    a.download = `anthill-day${pack.meta.day}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async importSave(file) {
    if (!file) return;
    try {
      const save = JSON.parse(await file.text());
      if (!save || !save.data || !save.meta) throw new Error('not a save');
      if (this.g.loadSave(save)) this.closeOverlays();
    } catch {
      this.toast('That file is not an Anthill save.', 'danger');
    }
    this.$('f-import').value = '';
  }

  showEnd(r) {
    const w = this.g.world, p = w.player;
    this.$('end-title').textContent = r.title;
    this.$('end-text').textContent = r.text;
    const stat = (v, l) => `<div><b>${v}</b><span>${l}</span></div>`;
    this.$('end-stats').innerHTML =
      stat(w.dayInfo().day, 'days survived') + stat(p.stats.peak, 'peak population') +
      stat(Math.floor(p.stats.collected), 'food gathered') + stat(p.stats.born, 'ants raised') +
      stat(w.stats.kills, 'enemies killed') + stat(w.stats.spiders, 'spiders seen');
    this.$('b-continue').classList.toggle('hidden', !r.win);
    this.$('b-restart').classList.toggle('primary', !r.win);
    this.$('end').classList.remove('hidden');
  }
}

'use strict';
// Chronicle: line charts of the whole game drawn on canvas — population, food flow and food in store —
// with a shared crosshair, event markers and a table view.

// Series colours validated for the dark game surface (all pairs pass CVD and normal-vision checks).
const CHRON_INK = {
  surface: '#1c150e', primary: '#f1e6d4', secondary: '#b7a58c', muted: '#8a7a64', grid: 'rgba(255,220,170,0.09)',
  danger: '#d03b3b', good: '#0ca30c',
};
// Sample fields: [t, ants, workers, soldiers, brood, food, foodCap, income, spent, rivals]
const CHRON_CHARTS = [
  {
    id: 'pop', title: 'Population', height: 150, marks: true,
    series: [
      { key: 1, name: 'Your ants', color: '#3987e5', area: true, endLabel: true },
      { key: 3, name: 'Your soldiers', color: '#199e70' },
      { key: 9, name: 'Rival ants', color: '#d95926', optional: true },
    ],
  },
  {
    id: 'flow', title: 'Food per minute', height: 120,
    series: [
      { key: 7, name: 'Brought in', color: '#c98500' },
      { key: 8, name: 'Spent and eaten', color: '#d55181' },
    ],
  },
  {
    id: 'store', title: 'Food in store', height: 100,
    series: [{ key: 5, name: 'Stored', color: '#c98500', area: true, endLabel: true }],
    ref: { key: 6, name: 'capacity' },
  },
];

const fmtMin = (t) => (t < 3600 ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}` : `${Math.floor(t / 3600)}h ${Math.floor((t % 3600) / 60)}m`);
const compact = (v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}K` : String(Math.round(v)));

function niceStep(max, ticks) {
  const raw = max / ticks, mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || mag * 10;
}

class ChronicleView {
  // container: element to fill; opts.compact drops the stores chart and the table.
  constructor(container, opts = {}) {
    this.root = container;
    this.compact = !!opts.compact;
    this.hoverIdx = -1;
    this.hoverChart = null;
    this.charts = [];
  }

  render(world) {
    this.world = world;
    this.data = world.history.length ? world.history : [];
    const charts = this.compact ? CHRON_CHARTS.slice(0, 2) : CHRON_CHARTS;
    this.root.innerHTML = '';
    this.charts = charts.map((def) => this.buildChart(def));
    this.tip = document.createElement('div');
    this.tip.className = 'chron-tip hidden';
    this.root.appendChild(this.tip);
    if (!this.compact) this.root.appendChild(this.buildTable());
    this.drawAll();
  }

  buildChart(def) {
    const box = document.createElement('div');
    box.className = 'chron-chart';
    const series = def.series.filter((s) => !s.optional || this.data.some((r) => r[s.key] > 0));
    const head = document.createElement('div');
    head.className = 'chron-head';
    const title = document.createElement('b');
    title.textContent = def.title;
    head.appendChild(title);
    // A legend for two or more series; a single series is named by the title.
    if (series.length > 1) {
      for (const s of series) {
        const item = document.createElement('span');
        item.className = 'chron-key';
        const key = document.createElement('i');
        key.style.background = s.color;
        item.appendChild(key);
        item.appendChild(document.createTextNode(s.name));
        head.appendChild(item);
      }
    }
    const canvas = document.createElement('canvas');
    canvas.style.height = def.height + 'px';
    box.appendChild(head);
    box.appendChild(canvas);
    this.root.appendChild(box);
    const chart = { def, series, canvas };
    canvas.addEventListener('pointermove', (e) => this.hover(chart, e));
    canvas.addEventListener('pointerdown', (e) => this.hover(chart, e));
    canvas.addEventListener('pointerleave', () => {
      this.hoverIdx = -1;
      this.tip.classList.add('hidden');
      this.drawAll();
    });
    return chart;
  }

  geometry(chart) {
    const W = chart.canvas.clientWidth || 600, H = chart.def.height;
    const pad = { l: 40, r: 50, t: chart.def.marks ? 18 : 8, b: 20 };
    const d = this.data, tMax = Math.max(60, d.length ? d[d.length - 1][0] : 60);
    let vMax = 1;
    for (const r of d) {
      for (const s of chart.series) vMax = Math.max(vMax, r[s.key]);
      if (chart.def.ref) vMax = Math.max(vMax, r[chart.def.ref.key]);
    }
    const step = niceStep(vMax, 3), top = Math.ceil(vMax / step) * step;
    return {
      W, H, pad, tMax, top, step,
      x: (t) => pad.l + (t / tMax) * (W - pad.l - pad.r),
      y: (v) => H - pad.b - (v / top) * (H - pad.t - pad.b),
    };
  }

  drawAll() {
    for (const c of this.charts) this.draw(c);
  }

  draw(chart) {
    const dpr = Math.min(2, window.devicePixelRatio || 1), cv = chart.canvas;
    const g = this.geometry(chart);
    cv.width = Math.round(g.W * dpr);
    cv.height = Math.round(g.H * dpr);
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, g.W, g.H);
    ctx.font = '11px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    const d = this.data;

    // Recessive hairline grid with compact tick labels.
    ctx.strokeStyle = CHRON_INK.grid;
    ctx.lineWidth = 1;
    ctx.fillStyle = CHRON_INK.muted;
    ctx.textAlign = 'right';
    for (let v = 0; v <= g.top + 1e-6; v += g.step) {
      const y = Math.round(g.y(v)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(g.pad.l, y);
      ctx.lineTo(g.W - g.pad.r, y);
      ctx.stroke();
      ctx.fillText(compact(v), g.pad.l - 6, y);
    }
    const tStep = Math.max(1, niceStep(g.tMax / 60, 5)) * 60; // whole minutes, so labels never repeat
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let t = 0; t <= g.tMax; t += tStep) ctx.fillText(`${Math.round(t / 60)} min`, g.x(t), g.H - g.pad.b + 5);

    if (d.length < 2) {
      ctx.textBaseline = 'middle';
      ctx.fillText('Not enough history yet — play a little longer.', g.W / 2, g.H / 2);
      return;
    }

    // Reference line (storage capacity): thin, muted, labelled at its end.
    const ref = chart.def.ref;
    if (ref) {
      ctx.strokeStyle = CHRON_INK.muted;
      ctx.lineWidth = 1;
      ctx.beginPath();
      d.forEach((r, i) => (i ? ctx.lineTo(g.x(r[0]), g.y(r[ref.key])) : ctx.moveTo(g.x(r[0]), g.y(r[ref.key]))));
      ctx.stroke();
      // Labelled just above its right end, inside the plot, so it never meets the series' end label.
      ctx.fillStyle = CHRON_INK.muted;
      ctx.textAlign = 'right';
      const ry = g.y(d[d.length - 1][ref.key]), above = ry - 14 > 0;
      ctx.textBaseline = above ? 'bottom' : 'top';
      ctx.fillText(ref.name, g.W - g.pad.r - 4, above ? ry - 3 : ry + 3);
    }

    for (const s of chart.series) {
      const path = new Path2D();
      d.forEach((r, i) => (i ? path.lineTo(g.x(r[0]), g.y(r[s.key])) : path.moveTo(g.x(r[0]), g.y(r[s.key]))));
      if (s.area) {
        const area = new Path2D(path);
        area.lineTo(g.x(d[d.length - 1][0]), g.y(0));
        area.lineTo(g.x(d[0][0]), g.y(0));
        area.closePath();
        ctx.globalAlpha = 0.1;
        ctx.fillStyle = s.color;
        ctx.fill(area);
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke(path);
    }

    // Selective direct labels: only the headline series gets an end dot and its value.
    for (const s of chart.series.filter((x) => x.endLabel)) {
      const last = d[d.length - 1], x = g.x(last[0]), y = g.y(last[s.key]);
      this.dot(ctx, x, y, s.color);
      ctx.fillStyle = CHRON_INK.primary;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.fillText(compact(last[s.key]), x + 8, y);
      ctx.font = '11px system-ui, sans-serif';
    }

    // Event markers along the top of the population chart.
    if (chart.def.marks) {
      for (const m of this.world.marks) {
        if (m.t > g.tMax) continue;
        const x = g.x(m.t);
        ctx.fillStyle = m.kind === 'danger' ? CHRON_INK.danger : CHRON_INK.good;
        ctx.beginPath();
        if (m.kind === 'danger') {
          ctx.moveTo(x - 4, 3);
          ctx.lineTo(x + 4, 3);
          ctx.lineTo(x, 10);
        } else {
          ctx.arc(x, 7, 3.5, 0, TAU);
        }
        ctx.fill();
      }
    }

    // Crosshair: snapped to the nearest sample, with a ringed dot on every series.
    if (this.hoverIdx >= 0 && d[this.hoverIdx]) {
      const r = d[this.hoverIdx], x = Math.round(g.x(r[0])) + 0.5;
      ctx.strokeStyle = 'rgba(241,230,212,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, g.pad.t);
      ctx.lineTo(x, g.H - g.pad.b);
      ctx.stroke();
      for (const s of chart.series) this.dot(ctx, x, g.y(r[s.key]), s.color);
    }
  }

  dot(ctx, x, y, color) {
    ctx.fillStyle = CHRON_INK.surface;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, TAU);
    ctx.fill();
  }

  hover(chart, e) {
    const d = this.data;
    if (d.length < 2) return;
    const g = this.geometry(chart), rect = chart.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    const t = clamp(((px - g.pad.l) / (g.W - g.pad.l - g.pad.r)) * g.tMax, 0, g.tMax);
    let lo = 0, hi = d.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (d[mid][0] < t) lo = mid;
      else hi = mid;
    }
    this.hoverIdx = t - d[lo][0] < d[hi][0] - t ? lo : hi;
    this.drawAll();

    const r = d[this.hoverIdx];
    const day = Math.floor(r[0] / CFG.DAY_LENGTH + 0.3) + 1;
    const tip = this.tip;
    tip.textContent = '';
    const head = document.createElement('div');
    head.className = 'chron-tip-head';
    head.textContent = `Day ${day} · ${fmtMin(r[0])}`;
    tip.appendChild(head);
    const rows = chart.series.map((s) => [s.color, r[s.key], s.name]);
    if (chart.def.ref) rows.push([CHRON_INK.muted, r[chart.def.ref.key], chart.def.ref.name]);
    for (const [color, value, name] of rows) {
      const row = document.createElement('div');
      row.className = 'chron-tip-row';
      const key = document.createElement('i');
      key.style.background = color;
      const v = document.createElement('b');
      v.textContent = compact(value);
      const n = document.createElement('span');
      n.textContent = name;
      row.append(key, v, n);
      tip.appendChild(row);
    }
    // Events near the pointer (population chart, top band).
    if (chart.def.marks && py < g.pad.t + 6) {
      for (const m of this.world.marks) {
        if (Math.abs(g.x(m.t) - px) > 6) continue;
        const ev = document.createElement('div');
        ev.className = 'chron-tip-event ' + m.kind;
        ev.textContent = `${fmtMin(m.t)} — ${m.text}`;
        tip.appendChild(ev);
      }
    }
    tip.classList.remove('hidden');
    const host = this.root.getBoundingClientRect();
    const left = e.clientX - host.left + 14, maxLeft = host.width - tip.offsetWidth - 4;
    tip.style.left = (left > maxLeft ? e.clientX - host.left - tip.offsetWidth - 14 : left) + 'px';
    tip.style.top = clamp(e.clientY - host.top - tip.offsetHeight / 2, 0, host.height - tip.offsetHeight) + 'px';
  }

  // The same numbers as a table, one row per minute, for reading without the charts.
  buildTable() {
    const det = document.createElement('details');
    det.className = 'chron-table';
    const sum = document.createElement('summary');
    sum.textContent = 'Show as a table';
    det.appendChild(sum);
    det.addEventListener('toggle', () => {
      if (!det.open || det.querySelector('table')) return;
      const table = document.createElement('table');
      const cols = ['Time', 'Ants', 'Soldiers', 'Rival ants', 'Food in', 'Food out', 'Stored'];
      const head = table.insertRow();
      for (const c of cols) {
        const th = document.createElement('th');
        th.textContent = c;
        head.appendChild(th);
      }
      let next = 0;
      for (const r of this.data) {
        if (r[0] < next) continue;
        next = r[0] + 60;
        const tr = table.insertRow();
        for (const v of [fmtMin(r[0]), r[1], r[3], r[9], r[7], r[8], r[5]]) tr.insertCell().textContent = String(v);
      }
      det.appendChild(table);
    });
    return det;
  }
}

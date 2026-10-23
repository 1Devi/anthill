'use strict';
// Procedurally drawn ant sprites, cached per palette / caste / leg-animation frame.
// Sprites face +x and are drawn at S pixels per world unit.

const Sprites = (() => {
  const S = 4;
  // map: the colony's colour on the minimap; mound: soil tint of its nest mound.
  const PAL = {
    player: { body: '#2e1d13', head: '#26170e', leg: '#1d120b', mand: '#120a06', shine: 'rgba(255,232,205,0.32)', map: '#f3e2c0', mound: [110, 85, 55] },
    rival: { body: '#b8361f', head: '#a02b17', leg: '#6d1b0e', mand: '#3e0c05', shine: 'rgba(255,226,200,0.42)', map: '#ff5a3c', mound: [150, 70, 50] },
    rival2: { body: '#c98a12', head: '#ad730c', leg: '#6b4507', mand: '#3a2503', shine: 'rgba(255,240,200,0.45)', map: '#ff9d1f', mound: [150, 118, 40] },
    rival3: { body: '#7440a8', head: '#61338f', leg: '#3c1d5a', mand: '#200d30', shine: 'rgba(235,215,255,0.42)', map: '#b98cff', mound: [112, 72, 120] },
  };
  const SHAPE = {
    worker: { len: 7, head: [0.12, 0.1], thorax: [0.15, 0.075], gaster: [0.22, 0.155], leg: 0.62, mand: 0.05, ant: 0.5 },
    soldier: { len: 10, head: [0.165, 0.145], thorax: [0.14, 0.08], gaster: [0.2, 0.145], leg: 0.55, mand: 0.12, ant: 0.42 },
    queen: { len: 16, head: [0.09, 0.085], thorax: [0.15, 0.1], gaster: [0.31, 0.19], leg: 0.42, mand: 0.04, ant: 0.32 },
  };
  const cache = new Map();

  function blob(ctx, x, y, rx, ry) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
    ctx.fill();
  }

  function build(palKey, caste, frame) {
    const pal = PAL[palKey], sh = SHAPE[caste];
    const L = sh.len * S;
    const size = Math.ceil(L * 1.75);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    ctx.translate(size / 2, size / 2);

    const gx = -L / 2 + sh.gaster[0] * L;
    const px = gx + sh.gaster[0] * L + 0.02 * L;
    const tx = px + 0.03 * L + sh.thorax[0] * L;
    const hx = tx + sh.thorax[0] * L + sh.head[0] * L * 0.85;
    const ph = (frame / 4) * TAU;

    // Legs: tripod gait, two segments each.
    ctx.strokeStyle = pal.leg;
    ctx.lineWidth = Math.max(1, L * 0.035);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const legL = sh.leg * L;
    const base = [-0.75, 0.05, 0.8];
    const bend = [0.4, 0.1, -0.4];
    for (let i = 0; i < 3; i++) {
      for (const s of [-1, 1]) {
        const inA = i === 1 ? s > 0 : s < 0;
        const swing = Math.sin(ph + (inA ? 0 : Math.PI)) * 0.32;
        const ax = tx + (i - 1) * sh.thorax[0] * L * 0.6;
        const ang = s * (Math.PI / 2 - (base[i] + swing));
        const kx = ax + Math.cos(ang) * legL * 0.45, ky = Math.sin(ang) * legL * 0.45;
        const ang2 = ang + s * bend[i];
        ctx.beginPath();
        ctx.moveTo(ax, 0);
        ctx.lineTo(kx, ky);
        ctx.lineTo(kx + Math.cos(ang2) * legL * 0.55, ky + Math.sin(ang2) * legL * 0.55);
        ctx.stroke();
      }
    }

    // Antennae (elbowed) and mandibles.
    ctx.lineWidth = Math.max(0.8, L * 0.024);
    const hr = sh.head[0] * L, hh = sh.head[1] * L, an = sh.ant * L;
    for (const s of [-1, 1]) {
      const wob = Math.sin(ph * 0.5 + s) * 0.06 * L;
      const ex = hx + hr + an * 0.3, ey = s * (hh + an * 0.2);
      ctx.beginPath();
      ctx.moveTo(hx + hr * 0.4, s * hh * 0.4);
      ctx.lineTo(ex, ey);
      ctx.lineTo(ex + an * 0.45, ey + s * an * 0.12 + wob);
      ctx.stroke();
    }
    ctx.strokeStyle = pal.mand;
    ctx.lineWidth = Math.max(1, L * (caste === 'soldier' ? 0.05 : 0.03));
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(hx + hr * 0.75, s * hh * 0.4);
      ctx.quadraticCurveTo(hx + hr + sh.mand * L, s * hh * 0.55, hx + hr + sh.mand * L * 0.8, s * 0.015 * L);
      ctx.stroke();
    }

    // Body with a soft contact shadow.
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = L * 0.08;
    ctx.fillStyle = pal.body;
    blob(ctx, gx, 0, sh.gaster[0] * L, sh.gaster[1] * L);
    blob(ctx, px, 0, 0.035 * L, 0.03 * L);
    blob(ctx, tx, 0, sh.thorax[0] * L, sh.thorax[1] * L);
    ctx.fillStyle = pal.head;
    blob(ctx, hx, 0, hr, hh);
    ctx.restore();

    // Gaster segments.
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = Math.max(0.6, L * 0.012);
    const segs = caste === 'queen' ? 4 : 2;
    for (let k = 1; k <= segs; k++) {
      const sx = gx + sh.gaster[0] * L * (0.75 - (k / (segs + 1)) * 1.3);
      ctx.beginPath();
      ctx.ellipse(sx, 0, sh.gaster[0] * L * 0.12, sh.gaster[1] * L * 0.9, 0, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
    }

    // Highlights and eyes.
    ctx.fillStyle = pal.shine;
    blob(ctx, gx + sh.gaster[0] * L * 0.15, -sh.gaster[1] * L * 0.38, sh.gaster[0] * L * 0.45, sh.gaster[1] * L * 0.25);
    blob(ctx, hx + hr * 0.1, -hh * 0.4, hr * 0.45, hh * 0.25);
    blob(ctx, tx, -sh.thorax[1] * L * 0.4, sh.thorax[0] * L * 0.5, sh.thorax[1] * L * 0.25);
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    for (const s of [-1, 1]) blob(ctx, hx + hr * 0.35, s * hh * 0.6, L * 0.02, L * 0.024);

    return { canvas: c, half: size / 2 };
  }

  function get(palKey, caste, frame) {
    const k = palKey + caste + frame;
    let v = cache.get(k);
    if (!v) {
      v = build(palKey, caste, frame);
      cache.set(k, v);
    }
    return v;
  }

  // Draw a sprite centred at (x, y) in the current transform, rotated by angle a, scaled to world units.
  function draw(ctx, palKey, caste, frame, x, y, a, scale = 1) {
    const spr = get(palKey, caste, frame);
    const k = scale / S;
    const cs = Math.cos(a) * k, sn = Math.sin(a) * k;
    ctx.save();
    ctx.transform(cs, sn, -sn, cs, x, y);
    ctx.drawImage(spr.canvas, -spr.half, -spr.half);
    ctx.restore();
  }

  return { S, PAL, SHAPE, get, draw };
})();

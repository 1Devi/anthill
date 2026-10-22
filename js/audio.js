'use strict';
// Procedural sound: everything is synthesised with Web Audio, no audio files.

const SOUND_GAP = { bite: 0.07, chomp: 0.3, hatch: 0.25, alarm: 3, click: 0.03, thud: 0.2, drop: 0.1 };

class Sound {
  constructor() {
    this.ctx = null;
    this.volume = 0.6;
    this.muted = false;
    this.last = {};
    this.t = 0;
    try {
      const s = JSON.parse(localStorage.getItem('anthill.sound') || '{}');
      if (typeof s.volume === 'number') this.volume = s.volume;
      this.muted = !!s.muted;
    } catch {
      /* no storage: keep defaults */
    }
  }

  // Browsers only allow audio to start from a user gesture.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.amb = ctx.createGain();
    this.amb.gain.value = 0.6;
    this.amb.connect(this.master);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    this.buildAmbience();
    this.applyVolume();
  }

  saveSettings() {
    try {
      localStorage.setItem('anthill.sound', JSON.stringify({ volume: this.volume, muted: this.muted }));
    } catch {
      /* ignore */
    }
  }

  applyVolume() {
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.05);
  }

  setVolume(v) {
    this.volume = clamp(v, 0, 1);
    if (this.volume > 0) this.muted = false;
    this.applyVolume();
    this.saveSettings();
  }

  toggleMute() {
    this.muted = !this.muted;
    this.applyVolume();
    this.saveSettings();
  }

  // ---------- building blocks ----------

  loopNoise(filterType, freq, q = 0.7) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(this.amb);
    src.start();
    return { f, g };
  }

  buildAmbience() {
    this.wind = this.loopNoise('lowpass', 420);
    this.rain = this.loopNoise('bandpass', 2600, 0.4);
    this.dig = this.loopNoise('bandpass', 320, 2.5);
  }

  tone(freq, dur, { type = 'sine', gain = 0.2, to = null, delay = 0, attack = 0.005, out = this.sfx, filter = null } = {}) {
    const ctx = this.ctx, t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = o;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filter;
      node = node.connect(f);
    }
    node.connect(g).connect(out);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  burst(dur, { type = 'bandpass', freq = 1000, q = 1, gain = 0.2, delay = 0, out = this.sfx } = {}) {
    const ctx = this.ctx, t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + dur + 0.05);
  }

  // ---------- effects ----------

  play(name, vol = 1) {
    if (!this.ctx || this.ctx.state !== 'running' || this.muted || vol <= 0.02) return;
    const now = this.ctx.currentTime;
    if (now - (this.last[name] || -9) < (SOUND_GAP[name] || 0)) return;
    this.last[name] = now;
    const v = vol;
    switch (name) {
      case 'bite':
        this.burst(0.035, { freq: rand(2200, 3200), q: 4, gain: 0.12 * v });
        break;
      case 'chomp':
        this.burst(0.09, { type: 'lowpass', freq: 900, gain: 0.3 * v });
        this.tone(140, 0.12, { type: 'triangle', to: 70, gain: 0.18 * v });
        break;
      case 'thud':
        this.tone(95, 0.4, { to: 38, gain: 0.35 * v });
        this.burst(0.25, { type: 'lowpass', freq: 300, gain: 0.3 * v });
        break;
      case 'spider':
        this.tone(110, 1.1, { type: 'sawtooth', to: 78, gain: 0.12, attack: 0.15, filter: 500 });
        this.tone(116, 1.1, { type: 'sawtooth', to: 82, gain: 0.1, attack: 0.15, filter: 500 });
        break;
      case 'drop':
        this.tone(560, 0.14, { to: 240, gain: 0.22 });
        this.burst(0.06, { freq: 1800, q: 2, gain: 0.06, delay: 0.02 });
        break;
      case 'build':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.45, { type: 'triangle', gain: 0.1, delay: i * 0.09 }));
        break;
      case 'hatch':
        this.tone(900, 0.07, { to: 1400, gain: 0.04 * v });
        break;
      case 'alarm':
        [660, 520, 660, 520].forEach((f, i) => this.tone(f, 0.11, { type: 'square', gain: 0.05, delay: i * 0.13, filter: 1800 }));
        break;
      case 'horn':
        this.tone(196, 1.2, { type: 'sawtooth', gain: 0.1, attack: 0.25, filter: 900 });
        this.tone(247, 1.2, { type: 'sawtooth', gain: 0.08, attack: 0.3, filter: 900, delay: 0.05 });
        break;
      case 'march':
        for (let i = 0; i < 3; i++) this.burst(0.09, { type: 'lowpass', freq: 220, gain: 0.35, delay: i * 0.13 });
        break;
      case 'click':
        this.tone(1700, 0.03, { gain: 0.035 });
        break;
      case 'win':
        [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.6, { type: 'triangle', gain: 0.12, delay: i * 0.12 }));
        break;
      case 'lose':
        [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.7, { gain: 0.14, delay: i * 0.28 }));
        break;
      case 'chirp':
        for (let i = 0; i < 3; i++) this.tone(4300 + rand(-150, 150), 0.03, { gain: 0.025 * v, delay: i * 0.055, out: this.amb });
        break;
      case 'bird': {
        const f = rand(2300, 3200);
        this.tone(f, 0.12, { to: f * 1.4, gain: 0.025 * v, out: this.amb });
        this.tone(f * 1.3, 0.14, { to: f * 0.9, gain: 0.02 * v, delay: 0.14, out: this.amb });
        break;
      }
    }
  }

  // Ambient bed follows weather, time of day and the current view.
  update(dt, g) {
    if (!this.ctx || !g.world) return;
    this.t += dt;
    const w = g.world, day = w.dayInfo(), now = this.ctx.currentTime;
    const under = g.view === 'nest';
    const muffle = under ? 0.35 : 1;
    this.wind.g.gain.setTargetAtTime((0.05 + 0.025 * Math.sin(this.t * 0.31)) * muffle, now, 0.5);
    this.wind.f.frequency.setTargetAtTime(under ? 220 : 420, now, 0.3);
    this.rain.g.gain.setTargetAtTime(w.rain > 0 ? 0.16 * muffle : 0, now, 0.8);
    this.rain.f.frequency.setTargetAtTime(under ? 700 : 2600, now, 0.3);
    const p = w.player;
    const digging = under && p.nest && p.nest.job && p.diggers > 0 && g.speed > 0;
    const scrape = 0.5 + 0.5 * Math.sin(this.t * 11) * Math.sin(this.t * 3.7);
    this.dig.g.gain.setTargetAtTime(digging ? 0.06 * scrape : 0, now, 0.05);
    if (g.speed === 0 || g.demo) return;
    if (day.night > 0.5 && Math.random() < dt * 1.5) this.play('chirp', muffle * day.night);
    if (day.light > 0.8 && w.rain <= 0 && Math.random() < dt * 0.12) this.play('bird', muffle);
  }
}

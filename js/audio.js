// Synthesised audio (Web Audio): engines per aircraft, wind, transonic buffet, sonic boom, blasts, warnings.
(function () {
  'use strict';
  const clamp = G.clamp;
  class Audio {
    constructor() { this.ctx = null; this.muted = false; this.boomArmed = true; this.beepT = 0; }
    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const c = this.ctx = new AC();
      this.master = c.createGain(); this.master.gain.value = 0.8;
      const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
      this.master.connect(comp); comp.connect(c.destination);
      const mk = (brown) => {
        const b = c.createBuffer(1, c.sampleRate * 3, c.sampleRate), d = b.getChannelData(0); let l = 0;
        for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; if (brown) { l = (l + 0.02 * w) / 1.02; d[i] = l * 3.5; } else d[i] = w; }
        return b;
      };
      this.white = mk(false); this.brown = mk(true);
      // engine bus
      this.engBus = c.createGain(); this.engBus.gain.value = 0;
      this.engLP = c.createBiquadFilter(); this.engLP.type = 'lowpass'; this.engLP.frequency.value = 9000;
      this.engBus.connect(this.engLP); this.engLP.connect(this.master);
      const src = (buf) => { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; };
      const chain = (node, type, freq, q, dest) => {
        const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = c.createGain(); g.gain.value = 0;
        node.connect(f); f.connect(g); g.connect(dest || this.engBus); return { f, g };
      };
      this.roar = chain(src(this.white), 'bandpass', 800, 0.6);
      this.rumble = chain(src(this.brown), 'lowpass', 140, 0.7);
      this.osc1 = c.createOscillator(); this.osc2 = c.createOscillator(); this.osc1.start(); this.osc2.start();
      this.whine = chain(this.osc1, 'bandpass', 2000, 1.5); this.whine2 = chain(this.osc2, 'bandpass', 2000, 1.5);
      // afterburner: distorted brown noise with crackle modulation
      const ws = c.createWaveShaper(), curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 6); }
      ws.curve = curve; const abSrc = src(this.brown); abSrc.connect(ws);
      this.ab = chain(ws, 'lowpass', 420, 0.5);
      const lfo = c.createOscillator(); lfo.type = 'sawtooth'; lfo.frequency.value = 37; const lg = c.createGain(); lg.gain.value = 0; lfo.connect(lg); lg.connect(this.ab.g.gain); lfo.start(); this.abLfo = lg;
      // wind + transonic buffet
      this.wind = chain(src(this.white), 'bandpass', 600, 0.5, this.master);
      this.buffet = chain(src(this.brown), 'lowpass', 90, 1, this.master);
      const bl = c.createOscillator(); bl.frequency.value = 11; const bg = c.createGain(); bg.gain.value = 0; bl.connect(bg); bg.connect(this.buffet.g.gain); bl.start(); this.buffetLfo = bg;
      this.hiss = chain(src(this.white), 'highpass', 2500, 0.5, this.master);
    }
    setAircraft(spec) { this.snd = spec.sound; if (this.ctx) { this.osc1.type = this.osc2.type = spec.sound.whine[3]; } this.boomArmed = true; }
    toggleMute() { this.muted = !this.muted; if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.05); return this.muted; }
    silence() { if (!this.ctx) return; const t = this.ctx.currentTime; [this.engBus, this.wind.g, this.buffet.g, this.hiss.g].forEach((g) => g.gain.setTargetAtTime(0, t, 0.15)); this.buffetLfo.gain.setTargetAtTime(0, t, 0.1); }

    // st: {rpm, ab, V, mach, cockpit, rear (-1..1 camera behind aircraft), active}
    update(st, dt) {
      const c = this.ctx; if (!c || !this.snd) return;
      const t = c.currentTime, s = this.snd, set = (p, v, tc) => p.setTargetAtTime(v, t, tc || 0.08);
      const rpm = st.rpm, r2 = 0.12 + 0.88 * rpm * rpm;
      const sup = st.mach > 1.02 && !st.cockpit ? 0.55 : 1; // outrunning own sound from outside
      const rearK = st.cockpit ? 0.55 : 0.6 + 0.5 * clamp(st.rear, 0, 1);
      set(this.engBus.gain, st.active ? (st.air === undefined ? 1 : st.air) : 0, 0.2);
      set(this.engLP.frequency, st.cockpit ? 1500 : 5000 + 5000 * clamp(st.rear, 0, 1));
      const wf = s.whine[0] + (s.whine[1] - s.whine[0]) * rpm;
      set(this.osc1.frequency, wf); set(this.osc2.frequency, wf * 1.012 + 3);
      set(this.whine.f.frequency, wf); set(this.whine2.f.frequency, wf);
      const wg = s.whine[2] * (0.35 + 0.65 * rpm) * (st.cockpit ? 0.7 : 1) * (1.3 - 0.5 * clamp(st.rear, 0, 1));
      set(this.whine.g.gain, wg); set(this.whine2.g.gain, wg * 0.7);
      set(this.roar.f.frequency, s.roar[0] * (0.6 + 0.6 * rpm)); set(this.roar.g.gain, s.roar[1] * r2 * rearK * sup * 0.5);
      set(this.rumble.f.frequency, s.rumble[0] * (0.7 + 0.5 * rpm)); set(this.rumble.g.gain, s.rumble[1] * r2 * rearK * sup);
      set(this.ab.g.gain, s.ab * st.ab * rearK * 0.9 * sup); set(this.abLfo.gain, s.ab * st.ab * 0.25 * sup);
      const v = clamp(st.V / 340, 0, 2.2);
      set(this.wind.f.frequency, 300 + 900 * v); set(this.wind.g.gain, st.active ? Math.min(0.5, v * v * (st.cockpit ? 0.22 : 0.14)) : 0);
      // transonic: strongest at Mach 1
      const tr = st.active ? Math.exp(-Math.pow((st.mach - 1.0) / 0.055, 2)) : 0;
      set(this.buffet.g.gain, tr * 0.9); set(this.buffetLfo.gain, tr * 0.5); set(this.hiss.g.gain, tr * 0.12);
      this.transonic = tr;
      if (st.mach > 1.0 && this.boomArmed && st.active) { this.boomArmed = false; this.sonicBoom(); this.boomed = true; }
      if (st.mach < 0.94) this.boomArmed = true;
    }

    _burst(when, dur, freq, gain, buf, q) {
      const c = this.ctx, s = c.createBufferSource(); s.buffer = buf || this.brown; s.loop = true;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(freq, when); f.frequency.exponentialRampToValueAtTime(Math.max(30, freq * 0.15), when + dur); f.Q.value = q || 0.7;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0002), when + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      s.connect(f); f.connect(g); g.connect(this.master); s.start(when, Math.random() * 2); s.stop(when + dur + 0.1);
    }
    _tone(when, dur, f0, f1, gain, type) {
      const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.type = type || 'sine';
      o.frequency.setValueAtTime(f0, when); o.frequency.exponentialRampToValueAtTime(f1, when + dur);
      g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(gain, when + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      o.connect(g); g.connect(this.master); o.start(when); o.stop(when + dur + 0.05);
    }
    sonicBoom() { // N-wave: two sharp pressure jumps
      if (!this.ctx) return; const t = this.ctx.currentTime + 0.02;
      [0, 0.11].forEach((d, i) => { this._burst(t + d, 0.5, 900, 1.6 - i * 0.3, this.white); this._burst(t + d, 1.6, 160, 1.8); this._tone(t + d, 0.5, 70, 28, 1.2); });
      this._burst(t + 0.25, 4, 90, 0.7);
    }
    explosion(dist, scale) { // sound arrives after dist / 343 s
      if (!this.ctx) return;
      const t = this.ctx.currentTime + dist / 343, vol = clamp(scale * 260 / (dist + 120), 0, 2.2); if (vol < 0.01) return;
      const far = clamp(dist / 4000, 0, 1);
      this._burst(t, 0.35 + far, 2400 * (1 - far * 0.9), vol * (1 - far * 0.7), this.white);
      this._burst(t, 1.6 + scale * 0.5 + far * 2, 320 * (1 - far * 0.5), vol * 1.4);
      this._tone(t, 0.7, 85, 30, vol);
    }
    megaBlast(dist) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime + dist / 343, vol = clamp(30000 / (dist + 6000), 0.5, 2.5);
      this._burst(t, 1.2, 1800, vol, this.white); this._burst(t, 14, 220, vol * 1.6); this._burst(t + 1.5, 22, 90, vol * 1.2); this._tone(t, 3, 60, 22, vol * 1.3);
    }
    beep(f, dur, gain, type) { if (this.ctx) this._tone(this.ctx.currentTime, dur || 0.08, f, f, gain || 0.15, type || 'square'); }
    cash() { if (!this.ctx) return; const t = this.ctx.currentTime; this._tone(t, 0.12, 1320, 1320, 0.12, 'triangle'); this._tone(t + 0.09, 0.3, 1760, 1760, 0.12, 'triangle'); }
    release() { if (this.ctx) { const t = this.ctx.currentTime; this._burst(t, 0.12, 500, 0.5); this._tone(t, 0.1, 140, 60, 0.4); } }
    touchdown(sink) { if (this.ctx) { const t = this.ctx.currentTime; this._burst(t, 0.35, 3500, 0.35, this.white, 3); this._burst(t, 0.4, 200, 0.5 + sink * 0.15); } }
    clunk() { if (this.ctx) { const t = this.ctx.currentTime; this._burst(t, 0.2, 300, 0.5); } }
    pop() { if (this.ctx) this._burst(this.ctx.currentTime, 0.15, 2500, 0.3, this.white); }
    whoosh() { if (this.ctx) this._burst(this.ctx.currentTime, 1.4, 1800, 0.6, this.white); }
    // periodic warnings: kind 'missile' | 'stall' | 'lock'
    warn(kind, dt, urgency) {
      this.beepT -= dt; if (this.beepT > 0) return;
      if (kind === 'missile') { this.beep(1500, 0.07, 0.16); this.beepT = clamp(0.5 - urgency * 0.42, 0.08, 0.5); }
      else if (kind === 'stall') { this.beep(420, 0.16, 0.14, 'sawtooth'); this.beepT = 0.26; }
      else if (kind === 'lock') { this.beep(700, 0.05, 0.07); this.beepT = 1.1; }
      else if (kind === 'pullup') { this.beep(980, 0.14, 0.2); this.beepT = 0.3; }
    }
  }
  G.audio = new Audio();
})();

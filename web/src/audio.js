// Everything audible is synthesised with WebAudio: ambience, generative score and sound effects.

const SONGS = [
  // root MIDI note, scale degrees (semitones), chord roots as scale indices, seconds per chord
  { root: 50, scale: [0, 2, 4, 7, 9, 12, 14, 16, 19, 21], chords: [0, 3, 4, 2], bar: 6.0, mel: 0.55, bright: 1 },
  { root: 45, scale: [0, 2, 3, 5, 7, 9, 10, 12, 14, 15], chords: [0, 5, 3, 4], bar: 6.5, mel: 0.45, bright: 0.8 },
  { root: 47, scale: [0, 2, 3, 7, 8, 12, 14, 15, 19, 20], chords: [0, 4, 3, 1], bar: 7.0, mel: 0.35, bright: 0.6 },
  { root: 40, scale: [0, 1, 3, 5, 7, 8, 12, 13, 15, 17], chords: [0, 1, 5, 4], bar: 8.0, mel: 0.25, bright: 0.45 },
  // boss
  { root: 38, scale: [0, 1, 3, 6, 7, 10, 12, 13, 15, 18], chords: [0, 1, 0, 3], bar: 3.2, mel: 0.6, bright: 0.7, pulse: true },
  // title / ending
  { root: 52, scale: [0, 2, 4, 7, 9, 11, 12, 14, 16, 19], chords: [0, 5, 3, 4], bar: 7.0, mel: 0.5, bright: 1 },
];

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Audio {
  constructor() {
    this.ctx = null;
    this.vol = { master: 0.8, music: 0.7, sfx: 0.8 };
    this.song = null;
    this.nextBar = 0;
    this.barIndex = 0;
    this.underwater = true;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(3.2);
    const revGain = ctx.createGain(); revGain.gain.value = 0.55;
    this.reverb.connect(revGain).connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.musicSend = ctx.createGain(); this.musicSend.gain.value = 0.9;
    this.musicBus.connect(this.musicSend).connect(this.reverb);
    // World sounds go through an underwater muffle filter.
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass'; this.muffle.frequency.value = 1400; this.muffle.Q.value = 0.5;
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.muffle).connect(this.master);
    const sfxSend = ctx.createGain(); sfxSend.gain.value = 0.35;
    this.muffle.connect(sfxSend).connect(this.reverb);
    this.uiBus = ctx.createGain();
    this.uiBus.connect(this.master);
    this.delay = ctx.createDelay(2); this.delay.delayTime.value = 0.42;
    const fb = ctx.createGain(); fb.gain.value = 0.38;
    this.delay.connect(fb).connect(this.delay);
    this.delay.connect(this.musicBus);
    this.applyVolumes();
    this.startAmbience();
  }

  impulse(sec) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6);
    }
    return b;
  }

  noiseBuffer(sec, brown = false) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return b;
  }

  setVolumes(v) { Object.assign(this.vol, v); this.applyVolumes(); }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.vol.music * 0.55, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
    this.uiBus.gain.setTargetAtTime(this.vol.sfx * 0.6, t, 0.05);
  }

  setUnderwater(u) {
    if (!this.ctx || u === this.underwater) return;
    this.underwater = u;
    const t = this.ctx.currentTime;
    this.muffle.frequency.setTargetAtTime(u ? 1400 : 16000, t, 0.08);
    this.ambGain.gain.setTargetAtTime(u ? 0.32 : 0.08, t, 0.1);
    this.surfGain.gain.setTargetAtTime(u ? 0.0 : 0.22, t, 0.1);
  }

  startAmbience() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(6, true); src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
    this.ambGain = ctx.createGain(); this.ambGain.gain.value = 0.32;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lfoG = ctx.createGain(); lfoG.gain.value = 140;
    lfo.connect(lfoG).connect(lp.frequency);
    src.connect(lp).connect(this.ambGain).connect(this.master);
    src.start(); lfo.start();
    // Waves heard above the surface.
    const s2 = ctx.createBufferSource();
    s2.buffer = this.noiseBuffer(5); s2.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.4;
    this.surfGain = ctx.createGain(); this.surfGain.gain.value = 0;
    const swell = ctx.createGain(); swell.gain.value = 0.6;
    const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.18;
    const lfo2G = ctx.createGain(); lfo2G.gain.value = 0.4;
    lfo2.connect(lfo2G).connect(swell.gain);
    s2.connect(bp).connect(swell).connect(this.surfGain).connect(this.master);
    s2.start(); lfo2.start();
  }

  // ---- music ----
  playSong(i) {
    if (!this.ctx) { this.pendingSong = i; return; }
    if (this.song === SONGS[i]) return;
    this.song = SONGS[i];
    this.nextBar = Math.max(this.nextBar, this.ctx.currentTime + 0.3);
    this.barIndex = 0;
  }

  stopSong() { this.song = null; }

  update() {
    if (!this.ctx) return;
    if (this.pendingSong !== undefined) { const s = this.pendingSong; this.pendingSong = undefined; this.playSong(s); }
    if (!this.song) return;
    // After the window was hidden, resume from now instead of catching up on missed bars.
    if (this.nextBar < this.ctx.currentTime - 1) this.nextBar = this.ctx.currentTime + 0.1;
    while (this.nextBar < this.ctx.currentTime + 0.6) {
      this.scheduleBar(this.nextBar);
      this.nextBar += this.song.bar;
      this.barIndex++;
    }
  }

  scheduleBar(t) {
    const s = this.song;
    const deg = s.chords[this.barIndex % s.chords.length];
    const note = (k) => s.root + s.scale[(deg + k) % s.scale.length] + 12 * Math.floor((deg + k) / s.scale.length);
    const chord = [note(0) - 12, note(0), note(2), note(4), note(6) + 12];
    chord.forEach((m, i) => this.pad(mtof(m), t, s.bar + 1.5, i === 0 ? 0.12 : 0.05, s.bright));
    if (s.pulse) {
      for (let b = 0; b < 4; b++) this.kick(t + b * s.bar / 4, b % 2 ? 0.25 : 0.45);
    }
    // Sparse bell melody over the chord.
    const steps = 8;
    for (let k = 0; k < steps; k++) {
      if (Math.random() > s.mel * (k % 2 ? 0.6 : 1)) continue;
      const m = note(Math.floor(Math.random() * 5) * 1) + 24 + (Math.random() < 0.2 ? 12 : 0);
      this.bell(mtof(m), t + (k * s.bar) / steps + Math.random() * 0.05, 0.06 + Math.random() * 0.04);
    }
  }

  pad(freq, t, dur, gain, bright) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + dur * 0.35);
    g.gain.linearRampToValueAtTime(0, t + dur);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(500 * bright, t);
    lp.frequency.linearRampToValueAtTime(1400 * bright, t + dur * 0.5);
    lp.frequency.linearRampToValueAtTime(500 * bright, t + dur);
    lp.connect(g).connect(this.musicBus);
    for (const det of [-7, 6]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = freq; o.detune.value = det;
      o.connect(lp); o.start(t); o.stop(t + dur + 0.1);
    }
    const s = ctx.createOscillator(); s.type = 'sine'; s.frequency.value = freq;
    const sg = ctx.createGain(); sg.gain.value = 1.4;
    s.connect(sg).connect(lp); s.start(t); s.stop(t + dur + 0.1);
  }

  bell(freq, t, gain) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    const mod = ctx.createOscillator(); mod.frequency.value = freq * 3.5;
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(freq * 1.2, t); mg.gain.exponentialRampToValueAtTime(1, t + 1.2);
    mod.connect(mg).connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    o.connect(g); g.connect(this.musicBus); g.connect(this.delay);
    o.start(t); mod.start(t); o.stop(t + 3.3); mod.stop(t + 3.3);
  }

  kick(t, gain) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g).connect(this.musicBus); o.start(t); o.stop(t + 0.55);
  }

  // ---- sound effects ----
  tone({ type = 'sine', f0, f1 = f0, dur, gain = 0.3, bus = 'sfx', attack = 0.005, at = 0 }) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + at;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus === 'ui' ? this.uiBus : this.sfxBus);
    o.start(t); o.stop(t + dur + 0.05);
  }

  noise({ dur, gain = 0.3, f0 = 1000, f1 = f0, q = 1, type = 'bandpass', at = 0 }) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + at;
    const s = ctx.createBufferSource();
    s.buffer = this._nb || (this._nb = this.noiseBuffer(2));
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.sfxBus);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  sfx(name, k = 1) {
    if (!this.ctx) return;
    switch (name) {
      case 'sonar':
        // Dolphin click train followed by a whistle.
        for (let i = 0; i < 5; i++) this.tone({ type: 'square', f0: 3200, f1: 1800, dur: 0.03, gain: 0.07, at: i * 0.035 });
        this.tone({ f0: 2400, f1: 5200, dur: 0.35, gain: 0.12, at: 0.15, attack: 0.05 });
        break;
      case 'song':
        [0, 4, 7, 12, 16].forEach((s, i) => this.tone({ f0: 660 * Math.pow(2, s / 12), f1: 700 * Math.pow(2, s / 12), dur: 1.4, gain: 0.08, at: i * 0.07, attack: 0.08 }));
        this.tone({ f0: 1800, f1: 3600, dur: 0.9, gain: 0.08, attack: 0.1 });
        break;
      case 'charge':
        this.tone({ f0: 500 + 900 * k, f1: 520 + 900 * k, dur: 0.12, gain: 0.03, bus: 'ui' });
        break;
      case 'dash':
        this.noise({ dur: 0.35, gain: 0.35, f0: 400, f1: 2400, q: 0.8 });
        break;
      case 'splash':
        this.noise({ dur: 0.35 + 0.4 * k, gain: Math.min(0.7, 0.18 + 0.25 * k), f0: 2000 + 1000 * k, f1: 300, q: 0.5, type: 'lowpass' });
        for (let i = 0; i < 6; i++) this.tone({ f0: 300 + Math.random() * 500, f1: 900 + Math.random() * 900, dur: 0.08, gain: 0.08, at: 0.1 + i * 0.05 });
        break;
      case 'breath':
        this.noise({ dur: 0.45, gain: 0.25, f0: 1800, f1: 700, q: 0.7 });
        break;
      case 'bubble':
        this.tone({ f0: 280 + Math.random() * 300, f1: 900 + Math.random() * 700, dur: 0.07, gain: 0.05 });
        break;
      case 'hurt':
        this.tone({ type: 'triangle', f0: 220, f1: 70, dur: 0.4, gain: 0.35 });
        this.noise({ dur: 0.3, gain: 0.25, f0: 800, f1: 200 });
        this.tone({ f0: 1600, f1: 900, dur: 0.25, gain: 0.08, at: 0.05 });
        break;
      case 'eat':
        this.tone({ type: 'triangle', f0: 520, f1: 780, dur: 0.15, gain: 0.15 });
        this.tone({ f0: 1040, f1: 1040, dur: 0.25, gain: 0.07, at: 0.08 });
        break;
      case 'pearl':
        [0, 7, 12, 19].forEach((s, i) => this.tone({ f0: 1046 * Math.pow(2, s / 12), dur: 0.8, gain: 0.08, at: i * 0.06 }));
        break;
      case 'stone':
        [0, 5, 9].forEach((s, i) => this.tone({ f0: 392 * Math.pow(2, s / 12), dur: 2.2, gain: 0.09, at: i * 0.12, attack: 0.2 }));
        break;
      case 'gate':
        this.noise({ dur: 1.4, gain: 0.4, f0: 6000, f1: 800, q: 2 });
        [0, 3, 7, 10, 14].forEach((s, i) => this.tone({ f0: 880 * Math.pow(2, s / 12), dur: 1.6, gain: 0.07, at: i * 0.05 }));
        break;
      case 'pod':
        [0, 4, 7, 11, 14, 19].forEach((s, i) => this.tone({ f0: 587 * Math.pow(2, s / 12), f1: 600 * Math.pow(2, s / 12), dur: 1.8, gain: 0.08, at: i * 0.1, attack: 0.05 }));
        this.tone({ f0: 1400, f1: 4200, dur: 0.6, gain: 0.08, at: 0.3, attack: 0.1 });
        break;
      case 'jelly':
        this.tone({ type: 'triangle', f0: 900, f1: 200, dur: 0.3, gain: 0.12 });
        break;
      case 'shark':
        this.tone({ type: 'sawtooth', f0: 90, f1: 60, dur: 0.6, gain: 0.12 });
        break;
      case 'roar':
        this.tone({ type: 'sawtooth', f0: 70, f1: 38, dur: 2.0, gain: 0.3, attack: 0.3 });
        this.noise({ dur: 2.0, gain: 0.3, f0: 300, f1: 90, q: 1.5 });
        break;
      case 'core':
        this.noise({ dur: 1.0, gain: 0.45, f0: 4000, f1: 300, q: 1 });
        [0, 7, 12].forEach((s, i) => this.tone({ f0: 330 * Math.pow(2, s / 12), dur: 1.5, gain: 0.12, at: i * 0.05 }));
        break;
      case 'wave':
        this.tone({ type: 'sawtooth', f0: 160, f1: 50, dur: 1.2, gain: 0.12, attack: 0.1 });
        break;
      case 'ui':
        this.tone({ f0: 1200, f1: 1250, dur: 0.08, gain: 0.08, bus: 'ui' });
        break;
      case 'select':
        this.tone({ f0: 880, dur: 0.25, gain: 0.1, bus: 'ui' });
        this.tone({ f0: 1320, dur: 0.35, gain: 0.08, at: 0.06, bus: 'ui' });
        break;
      case 'clear':
        [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => this.tone({ f0: 523 * Math.pow(2, s / 12), dur: 2.4, gain: 0.07, at: i * 0.11, attack: 0.03 }));
        break;
      default: break;
    }
  }
}

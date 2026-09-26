type NoiseKind = "white" | "pink" | "brown";

export class ArenaAudio {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  sfx: GainNode | null = null;
  music: GainNode | null = null;
  volume = 0.72;
  muted = false;
  private drone: OscillatorNode | null = null;
  private drone2: OscillatorNode | null = null;
  private droneNoise: AudioBufferSourceNode | null = null;
  private cryptGain: GainNode | null = null;
  private cryptAir: AudioBufferSourceNode | null = null;
  private cryptHum: OscillatorNode | null = null;
  private cryptLevel = 0;
  private dripIn = 1.4;
  private verb: DelayNode | null = null;
  private verbGain: GainNode | null = null;
  private buffers = new Map<NoiseKind, AudioBuffer>();

  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx({ latencyHint: "interactive" });
      this.master = this.ctx.createGain();
      this.sfx = this.ctx.createGain();
      this.music = this.ctx.createGain();
      this.sfx.gain.value = 0.92;
      this.music.gain.value = 0.05;

      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 12;
      comp.ratio.value = 3.2;
      comp.attack.value = 0.003;
      comp.release.value = 0.12;

      this.verb = this.ctx.createDelay(0.35);
      this.verb.delayTime.value = 0.048;
      const verbFilter = this.ctx.createBiquadFilter();
      verbFilter.type = "lowpass";
      verbFilter.frequency.value = 2200;
      this.verbGain = this.ctx.createGain();
      this.verbGain.gain.value = 0.18;
      const verbFb = this.ctx.createGain();
      verbFb.gain.value = 0.28;
      this.verb.connect(verbFilter);
      verbFilter.connect(this.verbGain);
      this.verbGain.connect(comp);
      verbFilter.connect(verbFb);
      verbFb.connect(this.verb);

      this.sfx.connect(comp);
      this.music.connect(comp);
      comp.connect(this.master);
      this.master.connect(this.ctx.destination);
      this.applyVolume();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  setVolume(v: number) {
    this.volume = v;
    this.applyVolume();
  }

  private applyVolume() {
    if (!this.master || !this.ctx) return;
    const g = this.muted ? 0 : this.volume * this.volume;
    this.master.gain.setTargetAtTime(g, this.ctx.currentTime, 0.02);
  }

  private sendVerb(node: AudioNode, amount = 0.22) {
    if (!this.verb || !this.ctx) return;
    const g = this.ctx.createGain();
    g.gain.value = amount;
    node.connect(g);
    g.connect(this.verb);
  }

  private env(duration: number, peak: number, attack = 0.003, dest?: AudioNode): GainNode | null {
    if (!this.ctx || !this.sfx) return null;
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    g.connect(dest ?? this.sfx);
    return g;
  }

  private noiseBuffer(kind: NoiseKind): AudioBuffer | null {
    if (!this.ctx) return null;
    const cached = this.buffers.get(kind);
    if (cached) return cached;
    const n = Math.floor(this.ctx.sampleRate * 0.9);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let brown = 0;
    for (let i = 0; i < n; i++) {
      const white = Math.random() * 2 - 1;
      if (kind === "white") data[i] = white;
      else if (kind === "pink") {
        b0 = 0.99765 * b0 + white * 0.099046;
        b1 = 0.963 * b1 + white * 0.2965164;
        b2 = 0.57 * b2 + white * 1.052691;
        data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.32;
      } else {
        brown = Math.max(-1, Math.min(1, (brown + white * 0.02) / 1.02));
        data[i] = brown * 3.5;
      }
    }
    this.buffers.set(kind, buf);
    return buf;
  }

  private noise(kind: NoiseKind, duration: number): AudioBufferSourceNode | null {
    if (!this.ctx) return null;
    const buf = this.noiseBuffer(kind);
    if (!buf) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = duration > 0.12;
    src.playbackRate.value = 0.92 + Math.random() * 0.16;
    return src;
  }

  private tone(freq: number, type: OscillatorType, duration: number, peak: number, slide?: number) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(28, slide), this.ctx.currentTime + duration);
    const g = this.env(duration, peak);
    if (!g) return;
    osc.connect(g);
    this.sendVerb(g, 0.12);
    osc.start();
    osc.stop(this.ctx.currentTime + duration + 0.03);
  }

  private layer(
    kind: NoiseKind,
    duration: number,
    peak: number,
    type: BiquadFilterType,
    freq: number,
    q = 0.7,
    verb = 0.2,
  ) {
    if (!this.ctx) return;
    const src = this.noise(kind, duration);
    if (!src) return;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.env(duration, peak, 0.0015);
    if (!g) return;
    src.connect(f);
    f.connect(g);
    this.sendVerb(g, verb);
    src.start();
    src.stop(this.ctx.currentTime + duration + 0.02);
  }

  fire(weapon: string) {
    this.unlock();
    const r = 0.97 + Math.random() * 0.06;
    if (weapon === "pulse") {
      this.tone(220 * r, "triangle", 0.055, 0.052, 128);
      this.layer("pink", 0.045, 0.046, "bandpass", 980, 1.2, 0.045);
      this.layer("white", 0.018, 0.018, "highpass", 3600, 0.55, 0.018);
    } else if (weapon === "scatter") {
      this.tone(96 * r, "triangle", 0.09, 0.07, 58);
      this.layer("pink", 0.075, 0.065, "lowpass", 720, 0.6, 0.07);
      this.layer("white", 0.028, 0.025, "bandpass", 2100, 1.1, 0.03);
    } else if (weapon === "torpedo") {
      this.tone(78 * r, "sine", 0.11, 0.065, 42);
      this.layer("brown", 0.1, 0.055, "lowpass", 240, 0.5, 0.055);
      this.layer("white", 0.018, 0.018, "bandpass", 1450, 0.9, 0.025);
    } else if (weapon === "lance") {
      this.tone(880 * r, "sine", 0.07, 0.052, 470);
      this.layer("white", 0.04, 0.04, "bandpass", 1800, 1.6, 0.035);
    } else if (weapon === "ion") {
      this.tone(640 * r, "triangle", 0.06, 0.046, 390);
      this.layer("white", 0.035, 0.035, "bandpass", 2200, 2, 0.035);
    }
  }

  /** Paso corto y filtrado: se llama por cadencia, nunca por cada frame. */
  step(speed: number, hard = false) {
    this.unlock();
    const run = Math.max(0, Math.min(1, (speed - 2) / 9));
    this.layer("brown", hard ? 0.085 : 0.052, 0.025 + run * 0.035, "lowpass", hard ? 230 : 340, 0.5, 0.018);
    this.tone(74 + run * 22, "sine", hard ? 0.07 : 0.045, 0.012 + run * 0.018, 48 + run * 9);
  }

  explode() {
    this.unlock();
    this.layer("white", 0.05, 0.28, "highpass", 2800, 0.4, 0.08);
    this.layer("pink", 0.18, 0.32, "bandpass", 620, 0.7, 0.2);
    this.layer("brown", 0.72, 0.5, "lowpass", 160, 0.45, 0.38);
    this.layer("brown", 0.9, 0.18, "lowpass", 70, 0.4, 0.22);
    this.tone(42, "sine", 0.62, 0.34, 18);
    this.tone(88, "triangle", 0.28, 0.1, 32);
    this.tone(190, "sawtooth", 0.12, 0.05, 55);
  }

  hit() {
    this.unlock();
    this.layer("white", 0.045, 0.105, "highpass", 2200, 0.8, 0.065);
    this.layer("pink", 0.07, 0.035, "bandpass", 760, 1.4, 0.045);
    this.tone(980 + Math.random() * 120, "triangle", 0.045, 0.065, 640);
  }

  hurt() {
    this.unlock();
    this.layer("pink", 0.14, 0.12, "bandpass", 280, 0.8, 0.1);
    this.tone(140, "sawtooth", 0.18, 0.1, 55);
  }

  pickup() {
    this.unlock();
    this.tone(620, "sine", 0.07, 0.07, 880);
    this.tone(930, "sine", 0.11, 0.05, 1240);
  }

  power() {
    this.unlock();
    this.layer("pink", 0.12, 0.08, "bandpass", 700, 1.6, 0.16);
    this.tone(280, "triangle", 0.14, 0.08, 760);
    this.tone(980, "sine", 0.18, 0.06, 1500);
  }

  blink() {
    this.unlock();
    this.layer("white", 0.07, 0.12, "highpass", 1400, 0.7, 0.12);
    this.tone(720, "sine", 0.09, 0.08, 180);
  }

  jump() {
    this.unlock();
    this.layer("pink", 0.06, 0.08, "lowpass", 420, 0.6, 0.05);
    this.tone(90, "sine", 0.06, 0.05, 50);
  }

  land(hard: boolean) {
    this.unlock();
    this.layer("brown", hard ? 0.16 : 0.07, hard ? 0.18 : 0.08, "lowpass", hard ? 180 : 280, 0.5, 0.08);
    this.tone(hard ? 52 : 70, "sine", hard ? 0.14 : 0.07, hard ? 0.12 : 0.05, 28);
  }

  frag() {
    this.unlock();
    this.tone(523, "sine", 0.08, 0.04, 784);
  }

  death() {
    this.unlock();
    this.tone(196, "sine", 0.18, 0.05, 88);
    this.layer("pink", 0.08, 0.03, "lowpass", 280, 0.5, 0.03);
  }

  down() {
    this.unlock();
    this.tone(240, "sine", 0.05, 0.018, 150);
  }

  empty() {
    this.unlock();
    this.layer("white", 0.04, 0.05, "bandpass", 2800, 2, 0.04);
    this.tone(180, "square", 0.04, 0.035);
  }

  pad() {
    this.unlock();
    this.layer("pink", 0.12, 0.07, "bandpass", 380, 1.2, 0.14);
    this.tone(220, "sine", 0.18, 0.07, 540);
  }

  startDrone() {
    this.unlock();
    if (!this.ctx || !this.music || this.drone) return;
    const o1 = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 280;
    f.Q.value = 0.8;
    o1.type = "sine";
    o2.type = "triangle";
    o1.frequency.value = 46;
    o2.frequency.value = 69.3;
    const g = this.ctx.createGain();
    g.gain.value = 0.22;
    o1.connect(f);
    o2.connect(f);
    f.connect(g);
    g.connect(this.music);

    const wind = this.noise("brown", 8);
    if (wind) {
      const wf = this.ctx.createBiquadFilter();
      wf.type = "lowpass";
      wf.frequency.value = 180;
      const wg = this.ctx.createGain();
      wg.gain.value = 0.12;
      wind.connect(wf);
      wf.connect(wg);
      wg.connect(this.music);
      wind.loop = true;
      wind.start();
      this.droneNoise = wind;
    }

    o1.start();
    o2.start();
    this.drone = o1;
    this.drone2 = o2;
  }

  stopDrone() {
    try {
      this.drone?.stop();
      this.drone2?.stop();
      this.droneNoise?.stop();
      this.cryptAir?.stop();
      this.cryptHum?.stop();
    } catch {
      /* already stopped */
    }
    this.drone = null;
    this.drone2 = null;
    this.droneNoise = null;
    this.cryptAir = null;
    this.cryptHum = null;
    this.cryptGain = null;
    this.cryptLevel = 0;
  }

  /** depth 0 en la superficie, 1 dentro de las catacumbas. */
  setCrypt(depth: number, dt: number) {
    this.unlock();
    if (!this.ctx || !this.sfx) return;
    this.ensureCrypt();
    const target = Math.max(0, Math.min(1, depth));
    this.cryptLevel += (target - this.cryptLevel) * (1 - Math.exp(-2.4 * dt));
    if (this.cryptGain) {
      this.cryptGain.gain.setTargetAtTime(this.cryptLevel, this.ctx.currentTime, 0.08);
    }
    if (this.cryptLevel < 0.08) return;
    this.dripIn -= dt;
    if (this.dripIn > 0) return;
    this.dripIn = 0.55 + Math.random() * 2.4;
    this.drip();
  }

  private ensureCrypt() {
    if (!this.ctx || !this.sfx || this.cryptGain) return;
    const bus = this.ctx.createGain();
    bus.gain.value = 0;
    const wet = this.ctx.createBiquadFilter();
    wet.type = "lowpass";
    wet.frequency.value = 900;
    bus.connect(wet);
    wet.connect(this.sfx);
    this.sendVerb(wet, 0.55);

    const air = this.noise("brown", 6);
    if (air) {
      const f = this.ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 240;
      f.Q.value = 0.45;
      const g = this.ctx.createGain();
      g.gain.value = 0.22;
      air.connect(f);
      f.connect(g);
      g.connect(bus);
      air.loop = true;
      air.start();
      this.cryptAir = air;
    }

    const hum = this.ctx.createOscillator();
    hum.type = "sine";
    hum.frequency.value = 48;
    const hg = this.ctx.createGain();
    hg.gain.value = 0.08;
    hum.connect(hg);
    hg.connect(bus);
    hum.start();
    this.cryptHum = hum;
    this.cryptGain = bus;
  }

  private drip() {
    if (!this.ctx || !this.cryptGain) return;
    const ping = 680 + Math.random() * 900;
    const src = this.noise("white", 0.08);
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(ping, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(ping * 0.72, this.ctx.currentTime + 0.09);
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16 + Math.random() * 0.08, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(g);
    g.connect(this.cryptGain);
    osc.start(t);
    osc.stop(t + 0.18);
    if (src) {
      const hf = this.ctx.createBiquadFilter();
      hf.type = "highpass";
      hf.frequency.value = 1400;
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.05, t);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      src.connect(hf);
      hf.connect(ng);
      ng.connect(this.cryptGain);
      src.start(t);
      src.stop(t + 0.06);
    }
  }
}

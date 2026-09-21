export class ArenaAudio {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  sfx: GainNode | null = null;
  music: GainNode | null = null;
  volume = 0.72;
  muted = false;
  private drone: OscillatorNode | null = null;
  private drone2: OscillatorNode | null = null;

  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx({ latencyHint: "interactive" });
      this.master = this.ctx.createGain();
      this.sfx = this.ctx.createGain();
      this.music = this.ctx.createGain();
      this.sfx.gain.value = 0.9;
      this.music.gain.value = 0.18;
      this.sfx.connect(this.master);
      this.music.connect(this.master);
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

  private env(duration: number, peak: number, attack = 0.004): GainNode | null {
    if (!this.ctx || !this.sfx) return null;
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    g.connect(this.sfx);
    return g;
  }

  private noise(duration: number): AudioBufferSourceNode | null {
    if (!this.ctx) return null;
    const n = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }

  private tone(freq: number, type: OscillatorType, duration: number, peak: number, slide?: number) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slide), this.ctx.currentTime + duration);
    const g = this.env(duration, peak);
    if (!g) return;
    osc.connect(g);
    osc.start();
    osc.stop(this.ctx.currentTime + duration + 0.02);
  }

  fire(weapon: string) {
    this.unlock();
    const rate = 0.94 + Math.random() * 0.12;
    if (weapon === "pulse") {
      this.tone(420 * rate, "square", 0.05, 0.09, 180);
      this.burst(0.04, 0.08, 1800);
    } else if (weapon === "scatter") {
      this.burst(0.14, 0.28, 900);
      this.tone(140 * rate, "sawtooth", 0.12, 0.12, 60);
    } else if (weapon === "torpedo") {
      this.tone(180 * rate, "sawtooth", 0.18, 0.12, 70);
      this.burst(0.08, 0.1, 600);
    } else if (weapon === "lance") {
      this.tone(1680 * rate, "sine", 0.22, 0.16, 220);
      this.tone(880 * rate, "square", 0.12, 0.05, 140);
      this.burst(0.06, 0.08, 4000);
    } else if (weapon === "ion") {
      this.tone(640 * rate, "sine", 0.07, 0.08, 240);
    }
  }

  explode() {
    this.unlock();
    this.burst(0.32, 0.36, 400);
    this.tone(90, "sine", 0.34, 0.2, 40);
  }

  hit() {
    this.unlock();
    this.tone(920 + Math.random() * 80, "square", 0.045, 0.07);
  }

  hurt() {
    this.unlock();
    this.tone(160, "sawtooth", 0.16, 0.12, 70);
  }

  pickup() {
    this.unlock();
    this.tone(520, "sine", 0.08, 0.08, 780);
    this.tone(780, "sine", 0.1, 0.06, 1040);
  }

  power() {
    this.unlock();
    this.tone(360, "square", 0.12, 0.1, 720);
    this.tone(900, "sine", 0.16, 0.08, 1400);
  }

  blink() {
    this.unlock();
    this.burst(0.08, 0.1, 900);
    this.tone(880, "sine", 0.1, 0.1, 220);
  }

  jump() {
    this.unlock();
    this.burst(0.05, 0.06, 300);
  }

  land(hard: boolean) {
    this.unlock();
    this.burst(hard ? 0.1 : 0.05, hard ? 0.1 : 0.05, hard ? 180 : 260);
  }

  frag() {
    this.unlock();
    this.tone(440, "square", 0.1, 0.08);
    this.tone(660, "square", 0.14, 0.07);
  }

  death() {
    this.unlock();
    this.tone(220, "sawtooth", 0.4, 0.14, 50);
    this.burst(0.25, 0.18, 200);
  }

  empty() {
    this.unlock();
    this.tone(140, "square", 0.05, 0.05);
  }

  pad() {
    this.unlock();
    this.tone(240, "sine", 0.16, 0.08, 520);
  }

  startDrone() {
    this.unlock();
    if (!this.ctx || !this.music || this.drone) return;
    const o1 = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 420;
    o1.type = "sawtooth";
    o2.type = "triangle";
    o1.frequency.value = 55;
    o2.frequency.value = 82.4;
    const g = this.ctx.createGain();
    g.gain.value = 0.35;
    o1.connect(f);
    o2.connect(f);
    f.connect(g);
    g.connect(this.music);
    o1.start();
    o2.start();
    this.drone = o1;
    this.drone2 = o2;
  }

  stopDrone() {
    try {
      this.drone?.stop();
      this.drone2?.stop();
    } catch {
      /* already stopped */
    }
    this.drone = null;
    this.drone2 = null;
  }

  private burst(duration: number, peak: number, cutoff: number) {
    if (!this.ctx) return;
    const src = this.noise(duration);
    if (!src) return;
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = cutoff;
    const g = this.env(duration, peak, 0.002);
    if (!g) return;
    src.connect(f);
    f.connect(g);
    src.start();
  }
}

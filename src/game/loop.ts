import { MAX_ACCUM, STEP } from "./constants";

/** Fixed-step accumulator for the simulation tick. */
export class FrameLoop {
  acc = 0;
  last = 0;
  readonly step: number;
  readonly maxAccum: number;

  constructor(step = STEP, maxAccum = MAX_ACCUM) {
    this.step = step;
    this.maxAccum = maxAccum;
  }

  start(nowMs = performance.now()) {
    this.last = nowMs;
    this.acc = 0;
  }

  /** Returns clamped frame delta in seconds and banks it into the accumulator. */
  begin(nowMs: number): number {
    let dt = (nowMs - this.last) / 1000;
    this.last = nowMs;
    dt = Math.min(dt, 0.1);
    this.acc += dt;
    if (this.acc > this.maxAccum) this.acc = this.maxAccum;
    return dt;
  }

  consumeFixed(tick: (dt: number) => void) {
    let n = 0;
    while (this.acc >= this.step && n < 5) {
      try {
        tick(this.step);
      } finally {
        this.acc -= this.step;
        n += 1;
      }
    }
    if (this.acc > this.step * 2) this.acc = this.step;
  }
}

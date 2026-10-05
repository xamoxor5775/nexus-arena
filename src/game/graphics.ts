/**
 * Graphics quality presets + dynamic resolution (desktop build).
 *
 * "scale" is the renderer pixel ratio (device pixels per CSS pixel). Fixed
 * presets render at a fixed scale; "auto" adapts the scale to hold ~60 FPS
 * (fast to drop, slow to rise, with back-off against oscillation) and drops
 * shadows only when even the minimum scale is not enough.
 */
export type QualityId = "auto" | "bajo" | "medio" | "alto" | "ultra";

export const QUALITY_ORDER: QualityId[] = ["auto", "bajo", "medio", "alto", "ultra"];

export type QualityPreset = {
  id: QualityId;
  label: string;
  hint: string;
  /** Scale bounds (pixel ratio). Fixed presets use max. */
  minScale: number;
  maxScale: number;
  adaptive: boolean;
  shadows: boolean;
  shadowMap: number;
  shadowRadius: number;
  anisotropy: number;
  /** MSAA is a context attribute: only honoured when the game starts with this preset. */
  msaa: boolean;
};

export const DEFAULT_QUALITY: QualityId = "auto";

export function isQualityId(v: unknown): v is QualityId {
  return typeof v === "string" && (QUALITY_ORDER as string[]).includes(v);
}

export function normalizeQuality(v: unknown): QualityId {
  return isQualityId(v) ? v : DEFAULT_QUALITY;
}

/** Presets resolved for this display (devicePixelRatio) and device class. */
export function qualityPreset(id: QualityId, dpr = 1, lowPower = false): QualityPreset {
  const d = Math.max(1, dpr || 1);
  switch (id) {
    case "bajo":
      return { id, label: "Bajo", hint: "70% resolución · sin sombras", minScale: 0.7, maxScale: 0.7, adaptive: false, shadows: false, shadowMap: 512, shadowRadius: 1, anisotropy: 1, msaa: false };
    case "medio":
      return { id, label: "Medio", hint: "Nativo · sombras 1K", minScale: 1, maxScale: Math.min(d, 1), adaptive: false, shadows: !lowPower, shadowMap: 1024, shadowRadius: 2, anisotropy: 4, msaa: false };
    case "alto":
      return { id, label: "Alto", hint: "Nativo · sombras 2K · AA", minScale: 1, maxScale: Math.min(d, 1.5), adaptive: false, shadows: true, shadowMap: 2048, shadowRadius: 3, anisotropy: 8, msaa: true };
    case "ultra":
      return { id, label: "Ultra", hint: "Superresolución · sombras 4K", minScale: 1.5, maxScale: Math.min(2, d * 1.5), adaptive: false, shadows: true, shadowMap: 4096, shadowRadius: 4, anisotropy: 16, msaa: true };
    default:
      return {
        id: "auto",
        label: "Auto",
        hint: "Ajusta la resolución para 60 FPS",
        minScale: lowPower ? 0.5 : 0.6,
        maxScale: lowPower ? 0.85 : Math.min(d, 1.25),
        adaptive: true,
        shadows: !lowPower,
        shadowMap: 2048,
        shadowRadius: 3,
        anisotropy: lowPower ? 2 : 8,
        msaa: false,
      };
  }
}

const TARGET_MS = 1000 / 60;
/** Window average above this (≈57 FPS) → drop scale. */
const SLOW_MS = 17.5;
/** Window average under this (≈59 FPS) and few slow frames → may raise scale. */
const OK_MS = 17.0;
const WINDOW_MS = 500;

export type ScaleDecision = { scale: number; shadows: boolean; changed: boolean; shadowChanged: boolean };

/**
 * Frame-time controller. Pure (no DOM/three), unit-testable: feed frame times
 * with `frame(ms, now)`; it returns a decision every WINDOW_MS.
 */
export class DynamicResolution {
  scale: number;
  shadows: boolean;
  private min: number;
  private max: number;
  private shadowsAllowed: boolean;
  private sum = 0;
  private n = 0;
  private slow = 0;
  private windowStart = 0;
  private lastChange = 0;
  private lastUp = -1e9;
  private upDelay = 2000;
  private stableSince = 0;
  private floorStrikes = 0;
  private noShadowSince = 0;
  /** Scale that just proved too expensive; not retried until ceilingUntil. */
  private ceiling = Infinity;
  private ceilingUntil = 0;

  constructor(p: QualityPreset, startScale?: number) {
    this.min = p.minScale;
    this.max = p.maxScale;
    this.shadowsAllowed = p.shadows;
    this.shadows = p.shadows;
    this.scale = clamp(startScale ?? Math.min(1, p.maxScale), this.min, this.max);
  }

  /** Average FPS of the last full window (for overlays/debug). */
  lastFps = 0;

  frame(ms: number, now: number): ScaleDecision | null {
    if (!this.windowStart) this.windowStart = now;
    // Ignore long stalls (tab switch, pause, first frame); cap hitches so a single
    // shader compile does not dominate the window but a slow GPU still counts.
    if (ms > 0 && ms < 1000) {
      this.sum += Math.min(ms, 120);
      this.n++;
      if (ms > 20) this.slow++;
    }
    if (now - this.windowStart < WINDOW_MS || this.n < 3) return null;
    const avg = this.sum / this.n;
    const slowFrac = this.slow / this.n;
    this.sum = this.n = this.slow = 0;
    this.windowStart = now;
    this.lastFps = 1000 / avg;
    const prevScale = this.scale;
    const prevShadows = this.shadows;

    if (avg > SLOW_MS) {
      this.stableSince = now;
      if (this.scale > this.min + 0.001) {
        // Proportional step down (bounded), rounded to 0.05.
        const factor = clamp(TARGET_MS / avg, 0.8, 0.94);
        this.scale = clamp(round05(this.scale * factor), this.min, this.max);
        if (this.scale === prevScale) this.scale = clamp(round05(prevScale - 0.05), this.min, this.max);
        // A drop right after a raise means the raise was too much: wait longer next time.
        if (now - this.lastUp < 3000) {
          this.upDelay = Math.min(16000, this.upDelay * 2);
          this.ceiling = prevScale;
          this.ceilingUntil = now + 45000;
        }
        this.lastChange = now;
        this.floorStrikes = 0;
      } else if (this.shadows && ++this.floorStrikes >= 3) {
        this.shadows = false;
        this.noShadowSince = now;
        this.floorStrikes = 0;
        this.lastChange = now;
      }
    } else {
      this.floorStrikes = 0;
      if (now - this.stableSince > 30000) this.upDelay = 2000;
      if (avg < OK_MS && slowFrac < 0.05 && now - this.lastChange > this.upDelay) {
        if (!this.shadows && this.shadowsAllowed && this.scale >= this.min + 0.25 && now - this.noShadowSince > 10000) {
          this.shadows = true;
          this.lastChange = now;
        } else if (this.scale < this.max - 0.001 && (now > this.ceilingUntil || this.scale + 0.05 < this.ceiling - 0.001)) {
          this.scale = clamp(round05(this.scale + 0.05), this.min, this.max);
          this.lastChange = now;
          this.lastUp = now;
        }
      }
    }
    return { scale: this.scale, shadows: this.shadows, changed: this.scale !== prevScale, shadowChanged: this.shadows !== prevShadows };
  }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
function round05(v: number) {
  return Math.round(v * 20) / 20;
}

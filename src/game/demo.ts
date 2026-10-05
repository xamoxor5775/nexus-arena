import type { ArenaId, MatchMode } from "./types";

/**
 * Free 1-minute demo, pure helpers (no DOM, no React).
 *
 * The demo runs fully offline: single player vs bots in the main arena
 * (`pozo`, deathmatch). There is no signaling or P2P room, so the server never
 * sees a demo player and /api/rtc keeps rejecting anyone without paid access.
 * The play counter lives in localStorage and is only a light deterrent.
 */
export const DEMO_SECONDS = 60;
export const DEMO_ARENA: ArenaId = "pozo";
export const DEMO_MODE: MatchMode = "dm";
export const DEMO_MAX_PLAYS = 3;
export const DEMO_PLAYS_KEY = "nexus-arena-demo-plays-v1";

type KV = Pick<Storage, "getItem" | "setItem">;

/** Whole seconds left (ceil), clamped to [0, total]. `startedAt === null` = not started yet. */
export function demoSecondsLeft(startedAt: number | null, now: number, total = DEMO_SECONDS): number {
  if (startedAt === null) return total;
  const left = Math.ceil((startedAt + total * 1000 - now) / 1000);
  return Math.max(0, Math.min(total, left));
}

/** "0:59" style clock. */
export function formatDemoClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function demoPlays(storage: KV | null | undefined): number {
  try {
    const n = Number.parseInt(storage?.getItem(DEMO_PLAYS_KEY) ?? "0", 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function canStartDemo(storage: KV | null | undefined, max = DEMO_MAX_PLAYS): boolean {
  return demoPlays(storage) < max;
}

/** Count one demo start; returns the new count. Storage errors are ignored (demo still allowed). */
export function recordDemoPlay(storage: KV | null | undefined): number {
  const next = demoPlays(storage) + 1;
  try {
    storage?.setItem(DEMO_PLAYS_KEY, String(next));
  } catch {
    /* private mode etc. */
  }
  return next;
}

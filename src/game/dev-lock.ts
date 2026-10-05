import type { ArenaId, MatchMode, Settings } from "./types";

/**
 * Dev room ("SALA 1 · DEV") arena lock, pure helpers used by the store.
 *
 * While a tester is in the dev room the client plays the server-chosen arena
 * (NEXUS_DEV_ARENA, default `pozo`) in deathmatch, whatever they picked, so all
 * testers share the same map. Their own pick is kept aside (and is what gets
 * persisted), and arena/mode changes are ignored while the lock is on.
 */
export type DevLock = { arena: ArenaId; saved: { arena: ArenaId; mode: MatchMode } };

export const DEV_LOCK_MODE: MatchMode = "dm";

/** Engage (or move) the lock. Keeps the player's original pick if already locked. */
export function lockSettings(settings: Settings, arena: ArenaId, current: DevLock | null): { settings: Settings; lock: DevLock } {
  const saved = current?.saved ?? { arena: settings.arena, mode: settings.mode };
  return { settings: { ...settings, arena, mode: DEV_LOCK_MODE }, lock: { arena, saved } };
}

/** Patch under the lock: arena/mode changes are dropped. */
export function patchLocked(settings: Settings, patch: Partial<Settings>, lock: DevLock | null): Settings {
  if (!lock) return { ...settings, ...patch };
  const { arena: _arena, mode: _mode, ...rest } = patch;
  void _arena;
  void _mode;
  return { ...settings, ...rest, arena: lock.arena, mode: DEV_LOCK_MODE };
}

/** What to write to localStorage: never the forced arena, always the player's own pick. */
export function persistable(settings: Settings, lock: DevLock | null): Settings {
  return lock ? { ...settings, arena: lock.saved.arena, mode: lock.saved.mode } : settings;
}

/** Leave the lock and restore the player's pick. */
export function unlockSettings(settings: Settings, lock: DevLock | null): Settings {
  return persistable(settings, lock);
}

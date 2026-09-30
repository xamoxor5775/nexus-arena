import { isArenaId, isPublicRoomId } from "../game/constants.ts";
import type { ArenaId } from "../game/types.ts";

/**
 * Fixed development room for testers ("SALA 1 · DEV").
 *
 * Server env:
 * - NEXUS_DEV_SESSIONS: comma-separated access-session ids (the `<id>` in a
 *   `session.<id>.<ts>.<nonce>.<hmac>` token). Empty/unset = feature off.
 * - NEXUS_DEV_ROOM: optional room id, defaults to `nexus-dev-1`.
 * - NEXUS_DEV_ARENA: optional arena everyone in the dev room plays (deathmatch),
 *   defaults to `pozo`; unknown values fall back to the default. Returned in
 *   the poll response as `devArena` and forced by the client.
 *
 * A peer whose HMAC-validated session id is listed is always routed into the
 * dev room, whatever room it asked for (no cap, no overflow, no 409). Nobody
 * else can ever join or signal into it.
 */
export const DEFAULT_DEV_ROOM = "nexus-dev-1";
export const DEFAULT_DEV_ARENA: ArenaId = "pozo";
const DEV_ROOM_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
const SESSION_ID_RE = /^[A-Za-z0-9_-]{1,100}$/;

export type DevRoomConfig = { sessions: ReadonlySet<string>; room: string; arena: ArenaId };

export function parseDevSessions(raw: string | undefined | null): Set<string> {
  const out = new Set<string>();
  for (const part of String(raw ?? "").split(",")) {
    const id = part.trim();
    if (id && SESSION_ID_RE.test(id)) out.add(id);
  }
  return out;
}

export function parseDevRoom(raw: string | undefined | null): string {
  const room = String(raw ?? "").trim().toLowerCase();
  // Never let the dev room alias a public room (it would bypass caps there).
  return room && DEV_ROOM_RE.test(room) && !isPublicRoomId(room) ? room : DEFAULT_DEV_ROOM;
}

export function parseDevArena(raw: string | undefined | null): ArenaId {
  const arena = String(raw ?? "").trim().toLowerCase();
  return isArenaId(arena) ? arena : DEFAULT_DEV_ARENA;
}

let cacheKey: string | null = null;
let cached: DevRoomConfig = { sessions: new Set(), room: DEFAULT_DEV_ROOM, arena: DEFAULT_DEV_ARENA };

/** Config from process.env; re-parsed only when the raw values change. */
export function devRoomConfig(env: Record<string, string | undefined> = process.env): DevRoomConfig {
  const rawSessions = env.NEXUS_DEV_SESSIONS ?? "";
  const rawRoom = env.NEXUS_DEV_ROOM ?? "";
  const rawArena = env.NEXUS_DEV_ARENA ?? "";
  const key = `${rawSessions}\n${rawRoom}\n${rawArena}`;
  if (key !== cacheKey) {
    cached = { sessions: parseDevSessions(rawSessions), room: parseDevRoom(rawRoom), arena: parseDevArena(rawArena) };
    cacheKey = key;
  }
  return cached;
}

export type RoomRoute = { ok: true; room: string; dev: boolean } | { ok: false; status: 400 | 403; error: string };

/**
 * Decide which signaling room a request really uses.
 * `sessionId` must come from an HMAC-validated access token (or be null).
 */
export function routeRoom(requested: string, sessionId: string | null, config: DevRoomConfig): RoomRoute {
  if (sessionId && config.sessions.has(sessionId)) return { ok: true, room: config.room, dev: true };
  if (requested === config.room) return { ok: false, status: 403, error: "Room reserved" };
  if (!isPublicRoomId(requested)) return { ok: false, status: 400, error: "Invalid room" };
  return { ok: true, room: requested, dev: false };
}

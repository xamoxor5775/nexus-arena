/**
 * PvP damage/death protocol over the P2P `reliable` channel.
 *
 * Victim-authoritative: the shooter only *reports* a hit to the victim
 * (`hit`), the victim applies it to its own health and, when it dies,
 * broadcasts `kill` to every peer so killfeed and frags agree everywhere.
 * Pure module (no three.js) so it can be unit tested under plain node.
 */
import type { WeaponId } from "./types.ts";

export type PvpVec3 = [number, number, number];

export type PvpHitMessage = {
  type: "hit";
  /** Unique per shooter (`<shooterId>:<seq>`); the victim dedupes on it. */
  id: string;
  shooter: string;
  victim: string;
  weapon: WeaponId;
  damage: number;
  headshot: boolean;
  dir: PvpVec3;
  knock: number;
  /** Shooter wall clock (ms). Informational only: peer clocks are not synced. */
  at: number;
};

export type PvpKillMessage = {
  type: "kill";
  id: string;
  victim: string;
  /** Peer id of the killing human, or null (bot / world / suicide). */
  killer: string | null;
  /** Display name when the killer is not a human peer (e.g. a bot on the victim's client). */
  killerName: string | null;
  weapon: WeaponId | "world";
  headshot: boolean;
  at: number;
};

export type WeaponDamageTable = Record<WeaponId, { damage: number; knock: number }>;

export type AcceptedHit = {
  weapon: WeaponId;
  damage: number;
  headshot: boolean;
  dir: PvpVec3;
  knock: number;
};

export type AcceptedKill = {
  victim: string;
  /** "self" when the local player is credited with the kill. */
  killer: "self" | string | null;
  killerName: string | null;
  weapon: WeaponId | "world";
  headshot: boolean;
};

/** Multipliers the engine can stack on a single hit: MEGAVATIO (volt) and headshot. */
export const VOLT_DAMAGE_MUL = 1.45;
export const HEADSHOT_MUL = 1.6;
/** Pixel grenade rides the "torpedo" weapon id with its own knock. */
const GRENADE_KNOCK = 13;

export function maxHitDamage(weapon: WeaponId, table: WeaponDamageTable): number {
  return table[weapon].damage * VOLT_DAMAGE_MUL * HEADSHOT_MUL;
}

export function maxHitKnock(weapon: WeaponId, table: WeaponDamageTable): number {
  return Math.max(table[weapon].knock, weapon === "torpedo" ? GRENADE_KNOCK : 0) * 1.25;
}

const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 100;
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function cleanDir(v: unknown): PvpVec3 {
  if (!Array.isArray(v) || v.length !== 3 || !v.every(finite)) return [0, 0, 0];
  const [x, y, z] = v as number[];
  const len = Math.hypot(x!, y!, z!);
  return len > 1e-6 ? [x! / len, y! / len, z! / len] : [0, 0, 0];
}

export function makeHitMessage(
  shooter: string,
  victim: string,
  seq: number,
  hit: AcceptedHit,
  now = Date.now(),
): PvpHitMessage {
  return {
    type: "hit",
    id: `${shooter}:${seq}`,
    shooter,
    victim,
    weapon: hit.weapon,
    damage: Math.round(hit.damage * 100) / 100,
    headshot: hit.headshot,
    dir: [hit.dir[0], hit.dir[1], hit.dir[2]],
    knock: hit.knock,
    at: now,
  };
}

export function makeKillMessage(
  victim: string,
  seq: number,
  death: { killer: string | null; killerName: string | null; weapon: WeaponId | "world"; headshot: boolean },
  now = Date.now(),
): PvpKillMessage {
  return {
    type: "kill",
    id: `${victim}:k${seq}`,
    victim,
    killer: death.killer,
    killerName: death.killerName ? death.killerName.slice(0, 24) : null,
    weapon: death.weapon,
    headshot: death.headshot,
    at: now,
  };
}

/** Bounded "seen ids" set (FIFO eviction) for idempotent reliable messages. */
export class RecentIds {
  private readonly order: string[] = [];
  private readonly set = new Set<string>();
  private readonly cap: number;
  constructor(cap = 1024) {
    this.cap = cap;
  }
  /** Returns false when `id` was already seen. */
  add(id: string): boolean {
    if (this.set.has(id)) return false;
    this.set.add(id);
    this.order.push(id);
    if (this.order.length > this.cap) this.set.delete(this.order.shift()!);
    return true;
  }
}

/**
 * Validates inbound PvP messages for one local peer. Rejects spoofed senders
 * (a hit must come from its shooter, a kill from its victim), hits not aimed
 * at us, duplicates, and clamps damage/knock to what the weapon can deal.
 * Game-state checks (dead, respawn protection, match running) stay in the engine.
 */
export class PvpInbox {
  private readonly hits = new RecentIds();
  private readonly kills = new RecentIds(256);
  private readonly selfId: string;
  private readonly table: WeaponDamageTable;
  constructor(selfId: string, table: WeaponDamageTable) {
    this.selfId = selfId;
    this.table = table;
  }

  private weapon(v: unknown): WeaponId | null {
    return typeof v === "string" && Object.prototype.hasOwnProperty.call(this.table, v) ? (v as WeaponId) : null;
  }

  acceptHit(from: string, raw: unknown): AcceptedHit | null {
    if (!raw || typeof raw !== "object") return null;
    const m = raw as Partial<PvpHitMessage>;
    if (m.type !== "hit" || !isId(m.id) || m.shooter !== from || m.victim !== this.selfId) return null;
    if (from === this.selfId) return null;
    const weapon = this.weapon(m.weapon);
    if (!weapon || !finite(m.damage) || m.damage <= 0) return null;
    if (!this.hits.add(m.id)) return null;
    return {
      weapon,
      damage: Math.min(m.damage, maxHitDamage(weapon, this.table)),
      headshot: m.headshot === true,
      dir: cleanDir(m.dir),
      knock: finite(m.knock) ? Math.max(0, Math.min(m.knock, maxHitKnock(weapon, this.table))) : 0,
    };
  }

  acceptKill(from: string, raw: unknown): AcceptedKill | null {
    if (!raw || typeof raw !== "object") return null;
    const m = raw as Partial<PvpKillMessage>;
    if (m.type !== "kill" || !isId(m.id) || m.victim !== from || from === this.selfId) return null;
    const weapon = m.weapon === "world" ? "world" : this.weapon(m.weapon);
    if (!weapon) return null;
    let killer: string | null;
    if (m.killer == null || m.killer === from) killer = null; // bot, world or suicide
    else if (isId(m.killer)) killer = m.killer;
    else return null;
    if (!this.kills.add(m.id)) return null;
    return {
      victim: from,
      killer: killer === this.selfId ? "self" : killer,
      killerName: typeof m.killerName === "string" && m.killerName ? m.killerName.slice(0, 24) : null,
      weapon,
      headshot: m.headshot === true,
    };
  }
}

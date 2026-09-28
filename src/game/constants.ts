import type { ArenaId, MatchMode, PowerId, RoundPrize, Settings, ShopItemId, SkinId, TouchActionId, TouchHand, WeaponId } from "./types";

export const STEP = 1 / 60;
export const MAX_ACCUM = 0.25;
export const ROUND_SECONDS = 10 * 60;
export const STARTING_GRENADES = 5;

export const PLAYER_H = 1.76;
export const CROUCH_H = 1.14;
export const PLAYER_HW = 0.3;
export const EYE = 1.58;
export const CROUCH_EYE = 1.02;

export const GRAVITY = 24.5;
export const JUMP_VEL = 10.4;
export const GROUND_ACCEL = 20;
export const AIR_ACCEL = 28;
export const FRICTION = 5.2;
export const STOP_SPEED = 1.15;
export const MAX_GROUND = 9.8;
export const MAX_AIR = 13;
export const SPRINT = 1.22;
/** Tope del wish en el aire. Más alto que el suelo deja que el strafe sume velocidad, como en Quake. */
export const AIR_WISH_CAP = 8;
export const STEP_HEIGHT = 0.52;
export const GROUND_SNAP = 0.5;
export const COYOTE = 0.2;
export const JUMP_BUF = 0.18;

export const DEFAULT_SETTINGS: Settings = {
  name: "Raven",
  sens: 1,
  fov: 82,
  volume: 0.72,
  shake: 1,
  bots: 4,
  botSpeed: 0.58,
  fragLimit: 15,
  capLimit: 3,
  arena: "pozo",
  mode: "dm",
  skin: "cian",
  touchHand: "right",
  touchOrder: ["jump", "weapon", "reload", "grenade", "aim"],
};

export const TOUCH_ACTIONS: { id: TouchActionId; label: string; short: string }[] = [
  { id: "jump", label: "Salto", short: "SALTO" },
  { id: "weapon", label: "Arma", short: "ARMA" },
  { id: "reload", label: "Recarga", short: "REC" },
  { id: "grenade", label: "Granada", short: "GRAN" },
  { id: "aim", label: "Mira", short: "MIRA" },
];

const TOUCH_IDS = new Set<TouchActionId>(TOUCH_ACTIONS.map((a) => a.id));

export function normalizeTouchHand(hand: string | undefined): TouchHand {
  return hand === "left" ? "left" : "right";
}

export function normalizeTouchOrder(raw: unknown): TouchActionId[] {
  const ids: TouchActionId[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string" && TOUCH_IDS.has(item as TouchActionId) && !ids.includes(item as TouchActionId)) {
        ids.push(item as TouchActionId);
      }
    }
  }
  for (const id of DEFAULT_SETTINGS.touchOrder) if (!ids.includes(id)) ids.push(id);
  return ids;
}

export function normalizeArena(id: string | undefined): ArenaId {
  if (id === "mar") return id;
  if (id === "cumbre" || id === "lave" || id === "luna" || id === "laberinto") return id;
  return "pozo";
}

export const XP_PER_LEVEL = 500;

export const SKINS: Record<SkinId, { label: string; color: number; css: string }> = {
  cian: { label: "Cian", color: 0x7af0ff, css: "#7af0ff" },
  ambar: { label: "Ámbar", color: 0xffc44d, css: "#ffc44d" },
  violeta: { label: "Violeta", color: 0xb07cff, css: "#b07cff" },
  ascua: { label: "Ascua", color: 0xff5a3a, css: "#ff5a3a" },
  lima: { label: "Lima", color: 0x9dff3a, css: "#9dff3a" },
};

export const PRIZE_LABEL: Record<RoundPrize, string> = {
  torpedo: "Próxima ronda: Torpedo cargado",
  scatter: "Próxima ronda: Scatter cargado",
  armor: "Próxima ronda: +50 armadura",
  rush: "Próxima ronda: Velocidad al salir",
};

export function levelFromXp(xp: number) {
  return 1 + Math.floor(Math.max(0, xp) / XP_PER_LEVEL);
}

export function prizeForPlace(place: number): RoundPrize {
  if (place === 1) return "torpedo";
  if (place === 2) return "scatter";
  if (place === 3) return "armor";
  return "rush";
}

export const BOT_NAMES = ["Gladiador", "Operadora", "Ingeniero", "Nyx"] as const;
export const BOT_COLORS = [0xe24a2b, 0x2ee0c8, 0x5aa8ff, 0xd4b45a] as const;
export const BOT_COLOR_CSS = ["#e24a2b", "#2ee0c8", "#5aa8ff", "#d4b45a"] as const;

export const TEAM_META = {
  ion: { label: "Ion", color: 0x7af0ff, css: "#7af0ff" },
  ember: { label: "Ascua", color: 0xff5a3a, css: "#ff5a3a" },
} as const;

export function normalizeMode(mode: string | undefined): MatchMode {
  if (mode === "ctf") return "ctf";
  if (mode === "duel") return "duel";
  return "dm";
}

const PILOT_TAGS = ["Lince", "Condor", "Puma", "Quilla", "Roca", "Nube", "Fuego", "Hielo", "Viento", "Sombra", "Halcon", "Zorro", "Rayo", "Marea", "Cobre"] as const;

export function sanitizePilotName(raw: string | undefined): string {
  return String(raw ?? "")
    .replace(/[^\p{L}\p{N} _.-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 14);
}

export function isPlaceholderPilotName(raw: string | undefined): boolean {
  const name = sanitizePilotName(raw);
  return !name || /^(raven|player|piloto)$/i.test(name);
}

export function randomPilotName(): string {
  const tag = PILOT_TAGS[Math.floor(Math.random() * PILOT_TAGS.length)] ?? "Lince";
  const n = 10 + Math.floor(Math.random() * 90);
  return `${tag}-${n}`;
}

export function publicRoomId(arena: ArenaId, mode: MatchMode): string {
  if (mode === "ctf") return "nexus-luna-ctf";
  return `nexus-${normalizeArena(arena)}-${mode === "duel" ? "duel" : "dm"}`;
}

export function canonicalRoomId(room: string): string {
  return room === "nexus-arena-public-v1" ? "nexus-pozo-dm" : room;
}

export function isPublicRoomId(room: string): boolean {
  return room === "nexus-arena-public-v1" || /^(nexus-(pozo|cumbre|lave|luna|laberinto|mar)-(dm|duel)|nexus-luna-ctf)$/.test(room);
}

export const WEAPON_ORDER: WeaponId[] = ["pulse", "scatter", "torpedo", "lance", "ion"];

export function isWeaponId(k: string): k is WeaponId {
  return k === "pulse" || k === "scatter" || k === "torpedo" || k === "lance" || k === "ion";
}

export const WEAPON_META: Record<
  WeaponId,
  {
    label: string;
    slot: number;
    kind: "hitscan" | "projectile";
    rpm: number;
    damage: number;
    pellets: number;
    spread: number;
    kick: number;
    range: number;
    speed: number;
    splash: number;
    knock: number;
    mag: number;
    reserve: number;
    reload: number;
    color: number;
  }
> = {
  pulse: {
    label: "PULSE",
    slot: 1,
    kind: "hitscan",
    rpm: 620,
    damage: 9,
    pellets: 1,
    spread: 0.016,
    kick: 0.01,
    range: 110,
    speed: 0,
    splash: 0,
    knock: 1.1,
    mag: 40,
    reserve: 80,
    reload: 1.15,
    color: 0xe8c36a,
  },
  scatter: {
    label: "SCATTER",
    slot: 2,
    kind: "hitscan",
    rpm: 72,
    damage: 8,
    pellets: 8,
    spread: 0.078,
    kick: 0.045,
    range: 36,
    speed: 0,
    splash: 0,
    knock: 2.2,
    mag: 8,
    reserve: 24,
    reload: 1.7,
    color: 0xe24a2b,
  },
  torpedo: {
    label: "TORPEDO",
    slot: 3,
    kind: "projectile",
    rpm: 58,
    damage: 92,
    pellets: 1,
    spread: 0.004,
    kick: 0.06,
    range: 130,
    speed: 29,
    splash: 3.4,
    knock: 18,
    mag: 8,
    reserve: 16,
    reload: 1.9,
    color: 0xff7a3a,
  },
  lance: {
    label: "LANCE",
    slot: 4,
    kind: "hitscan",
    rpm: 38,
    damage: 86,
    pellets: 1,
    spread: 0,
    kick: 0.07,
    range: 160,
    speed: 0,
    splash: 0,
    knock: 4,
    mag: 5,
    reserve: 15,
    reload: 1.5,
    color: 0x2ee0c8,
  },
  ion: {
    label: "ION",
    slot: 5,
    kind: "projectile",
    rpm: 390,
    damage: 17,
    pellets: 1,
    spread: 0.012,
    kick: 0.012,
    range: 95,
    speed: 34,
    splash: 0.7,
    knock: 2.4,
    mag: 40,
    reserve: 80,
    reload: 1.35,
    color: 0x5aa8ff,
  },
};

export const POWER_ORDER: PowerId[] = ["rush", "blink", "volt", "leap"];

export const POWER_META: Record<
  PowerId,
  { label: string; color: number; css: string; duration: number; respawn: number }
> = {
  rush: { label: "VELOCIDAD", color: 0xffc44d, css: "#ffc44d", duration: 7.5, respawn: 22 },
  blink: { label: "FASE", color: 0x7af0ff, css: "#7af0ff", duration: 11, respawn: 26 },
  volt: { label: "MEGAVATIO", color: 0xff5a3a, css: "#ff5a3a", duration: 8.5, respawn: 24 },
  leap: { label: "SUPERSALTO", color: 0x9dff3a, css: "#9dff3a", duration: 9, respawn: 24 },
};

export const SHOP_META: Record<ShopItemId, { label: string; cost: number; kind: "weapon" | "power"; color: string }> = {
  pulse: { label: "PULSE", cost: 0, kind: "weapon", color: "#e8c36a" },
  scatter: { label: "SCATTER", cost: 60, kind: "weapon", color: "#e24a2b" },
  torpedo: { label: "TORPEDO", cost: 120, kind: "weapon", color: "#ff7a3a" },
  lance: { label: "LANCE", cost: 160, kind: "weapon", color: "#2ee0c8" },
  ion: { label: "ION", cost: 220, kind: "weapon", color: "#5aa8ff" },
  rush: { label: "VELOCIDAD", cost: 45, kind: "power", color: "#ffc44d" },
  blink: { label: "FASE", cost: 55, kind: "power", color: "#7af0ff" },
  volt: { label: "MEGAVATIO", cost: 70, kind: "power", color: "#ff5a3a" },
  leap: { label: "SUPERSALTO", cost: 50, kind: "power", color: "#9dff3a" },
};

/** Zoom mínimo y máximo con el clic derecho. Solo armas de distancia. */
export const SCOPE: Partial<Record<WeaponId, { min: number; max: number }>> = {
  lance: { min: 2.2, max: 6 },
  torpedo: { min: 1.7, max: 3.4 },
  ion: { min: 1.4, max: 2.4 },
};

export function isPower(k: string): k is PowerId {
  return k === "rush" || k === "blink" || k === "volt" || k === "leap";
}

export const SETTINGS_KEY = "nexus-arena-settings-v1";
export const BEST_KEY = "nexus-arena-best-v1";
export const CREDITS_KEY = "nexus-arena-credits-v1";
export const CAREER_KEY = "nexus-arena-career-v1";

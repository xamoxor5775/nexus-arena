import type { PowerId, Settings, WeaponId } from "./types";

export const STEP = 1 / 60;
export const MAX_ACCUM = 0.25;

export const PLAYER_H = 1.76;
export const CROUCH_H = 1.14;
export const PLAYER_HW = 0.3;
export const EYE = 1.58;
export const CROUCH_EYE = 1.02;

export const GRAVITY = 24.5;
export const JUMP_VEL = 10.4;
export const GROUND_ACCEL = 20;
export const AIR_ACCEL = 16;
export const FRICTION = 5.2;
export const STOP_SPEED = 1.15;
export const MAX_GROUND = 9.8;
export const MAX_AIR = 10.2;
export const SPRINT = 1.22;
export const AIR_WISH_CAP = 4.4;
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
  fragLimit: 15,
};

export const BOT_NAMES = ["Gladiador", "Operadora", "Ingeniero", "Nyx"] as const;
export const BOT_COLORS = [0xe24a2b, 0x2ee0c8, 0x5aa8ff, 0xd4b45a] as const;
export const BOT_COLOR_CSS = ["#e24a2b", "#2ee0c8", "#5aa8ff", "#d4b45a"] as const;

export const WEAPON_ORDER: WeaponId[] = ["pulse", "scatter", "torpedo", "lance", "ion"];

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

export const POWER_ORDER: PowerId[] = ["rush", "blink", "volt"];

export const POWER_META: Record<
  PowerId,
  { label: string; color: number; css: string; duration: number; respawn: number }
> = {
  rush: { label: "VELOCIDAD", color: 0xffc44d, css: "#ffc44d", duration: 7.5, respawn: 22 },
  blink: { label: "FASE", color: 0x7af0ff, css: "#7af0ff", duration: 11, respawn: 26 },
  volt: { label: "MEGAVATIO", color: 0xff5a3a, css: "#ff5a3a", duration: 8.5, respawn: 24 },
};

export function isPower(k: string): k is PowerId {
  return k === "rush" || k === "blink" || k === "volt";
}

export const SETTINGS_KEY = "nexus-arena-settings-v1";
export const BEST_KEY = "nexus-arena-best-v1";

export type WeaponId = "pulse" | "scatter" | "torpedo" | "lance" | "ion";
export type PowerId = "rush" | "blink" | "volt";

export type Screen = "menu" | "playing" | "paused" | "ended" | "settings" | "help";

export type AABB = {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
};

export type Spawn = { x: number; y: number; z: number; yaw: number };

export type JumpPad = {
  aabb: AABB;
  vx: number;
  vy: number;
  vz: number;
};

export type ItemKind = "health" | "mega" | "armor" | "ammo" | WeaponId | PowerId;

export type ItemPad = {
  id: string;
  kind: ItemKind;
  x: number;
  y: number;
  z: number;
  respawn: number;
};

export type KillFeedItem = {
  id: number;
  attacker: string;
  victim: string;
  weapon: WeaponId | "world";
  headshot: boolean;
};

export type ScoreRow = {
  name: string;
  color: string;
  frags: number;
  deaths: number;
  isPlayer: boolean;
};

export type Settings = {
  name: string;
  sens: number;
  fov: number;
  volume: number;
  shake: number;
  bots: number;
  fragLimit: number;
};

export type HudSnapshot = {
  health: number;
  armor: number;
  ammo: number;
  reserve: number;
  weapon: WeaponId;
  weapons: WeaponId[];
  frags: number;
  deaths: number;
  fragLimit: number;
  countdown: number | null;
  pickup: string | null;
  hitmarker: number;
  hurt: number;
  killFeed: KillFeedItem[];
  scoreboard: ScoreRow[];
  winner: string | null;
  locked: boolean;
  yaw: number;
  speed: number;
  alive: boolean;
  powers: { id: PowerId; label: string; t: number; color: string }[];
};

export type ControlsProbe = {
  getYaw: () => number;
  getSpeed: () => number;
  setKeys: (codes: string[]) => void;
  getPos: () => { x: number; y: number; z: number };
};

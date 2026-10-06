export type WeaponId = "pulse" | "scatter" | "torpedo" | "lance" | "ion" | "fauces" | "knife" | "bate" | "martillo";
export type PowerId = "rush" | "blink" | "volt" | "leap";
export type ShopItemId = WeaponId | PowerId;

export type Screen = "menu" | "playing" | "paused" | "ended" | "settings" | "help" | "skin";
export type SkinId = "cian" | "ambar" | "violeta" | "ascua" | "lima";
/** Cámara del jugador: primera persona (FPS clásico) o tercera persona (sobre el hombro). */
export type ViewMode = "first" | "third";
export type RoundPrize = "torpedo" | "scatter" | "armor" | "rush";

export type AABB = {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
};

export type TeamId = "ion" | "ember";

export type Spawn = { x: number; y: number; z: number; yaw: number; team?: TeamId };

export type FlagPad = {
  team: TeamId;
  x: number;
  y: number;
  z: number;
};

export type JumpPad = {
  aabb: AABB;
  vx: number;
  vy: number;
  vz: number;
  chute?: boolean;
};

export type TeleportGate = {
  aabb: AABB;
  target: { x: number; y: number; z: number; yaw?: number };
  chute?: boolean;
};

/** Volumen de agua. Cilindro vertical: frena y reduce la gravedad, no quema. */
export type WaterZone = {
  x: number;
  y: number;
  z: number;
  radius: number;
  height: number;
};

/** Zona ambiental. Círculo si no hay hx/hz; rectángulo alineado al mapa si los hay. */
export type HazardZone = {
  x: number;
  y: number;
  z: number;
  radius: number;
  hx?: number;
  hz?: number;
  damage: number;
  color: number;
  label?: string;
  /** Trituradora: una sola caída mata y dispara hacia arriba. */
  crush?: boolean;
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
  team?: TeamId;
};

export type ArenaId = "pozo" | "cumbre" | "lave" | "luna" | "laberinto" | "mar";
export type MatchMode = "dm" | "ctf" | "duel";

export type FlagHud = {
  team: TeamId;
  state: "home" | "carried" | "dropped";
  carrier: string | null;
};

export type TouchActionId = "jump" | "weapon" | "reload" | "grenade" | "aim";
export type TouchHand = "right" | "left";

export type Settings = {
  name: string;
  sens: number;
  fov: number;
  volume: number;
  shake: number;
  bots: number;
  botSpeed: number;
  fragLimit: number;
  capLimit: number;
  arena: ArenaId;
  mode: MatchMode;
  skin: SkinId;
  touchHand: TouchHand;
  touchOrder: TouchActionId[];
  /** Graphics preset. Auto holds ~60 FPS by scaling resolution and shadows. */
  quality: import("./graphics").QualityId;
  /** Primera o tercera persona (tecla T / Ajustes / Pausa). */
  viewMode: ViewMode;
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
  mode: MatchMode;
  capLimit: number;
  teamScore: { ion: number; ember: number };
  flags: FlagHud[];
  playerTeam: TeamId | null;
  carrying: TeamId | null;
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
  roundSeconds: number;
  credits: number;
  score: number;
  level: number;
  xp: number;
  xpNeed: number;
  prize: string | null;
  leveled: boolean;
  grenades: number;
  aiming: boolean;
  scope: number | null;
  streak: number;
};

export type ControlsProbe = {
  getYaw: () => number;
  getSpeed: () => number;
  setKeys: (codes: string[]) => void;
  getPos: () => { x: number; y: number; z: number };
};

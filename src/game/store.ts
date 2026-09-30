import { create } from "zustand";
import { DEFAULT_SETTINGS, isPlaceholderPilotName, normalizeArena, normalizeMode, normalizeTouchHand, normalizeTouchOrder, randomPilotName, sanitizePilotName, SETTINGS_KEY } from "./constants";
import { lockSettings, patchLocked, persistable, unlockSettings, type DevLock } from "./dev-lock";
import type { ArenaId, HudSnapshot, Screen, Settings } from "./types";

function persistSettings(settings: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

function withPilotName(settings: Settings, rawName: string | undefined): Settings {
  const name = isPlaceholderPilotName(rawName) ? randomPilotName() : sanitizePilotName(rawName);
  return { ...settings, name };
}

function loadSettings(): Settings {
  try {
    if (typeof localStorage === "undefined") return withPilotName({ ...DEFAULT_SETTINGS }, undefined);
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      const settings = withPilotName({ ...DEFAULT_SETTINGS }, undefined);
      persistSettings(settings);
      return settings;
    }
    const parsed = JSON.parse(raw) as Partial<Settings> & { mode?: string };
    const settings = withPilotName(
      {
        ...DEFAULT_SETTINGS,
        ...parsed,
        mode: normalizeMode(parsed.mode),
        arena: normalizeArena(parsed.arena),
        touchHand: normalizeTouchHand(parsed.touchHand),
        touchOrder: normalizeTouchOrder(parsed.touchOrder),
      },
      parsed.name,
    );
    if (settings.name !== parsed.name) persistSettings(settings);
    return settings;
  } catch {
    return withPilotName({ ...DEFAULT_SETTINGS }, undefined);
  }
}

const emptyHud: HudSnapshot = {
  health: 100,
  armor: 0,
  ammo: 40,
  reserve: 80,
  weapon: "pulse",
  weapons: ["pulse"],
  frags: 0,
  deaths: 0,
  fragLimit: 15,
  mode: "dm",
  capLimit: 3,
  teamScore: { ion: 0, ember: 0 },
  flags: [],
  playerTeam: null,
  carrying: null,
  countdown: null,
  pickup: null,
  hitmarker: 0,
  hurt: 0,
  killFeed: [],
  scoreboard: [],
  winner: null,
  locked: false,
  yaw: 0,
  speed: 0,
  alive: true,
  powers: [],
  roundSeconds: 0,
  credits: 0,
  score: 0,
  level: 1,
  xp: 0,
  xpNeed: 500,
  prize: null,
  leveled: false,
  grenades: 2,
  aiming: false,
  scope: null,
  streak: 0,
};

export type ArenaStore = {
  screen: Screen;
  settings: Settings;
  hud: HudSnapshot;
  showBoard: boolean;
  isTouch: boolean;
  best: number;
  roomHost: boolean;
  /** Dev room arena lock (null = normal player). See dev-lock.ts. */
  devLock: DevLock | null;
  setScreen: (s: Screen) => void;
  setHud: (h: HudSnapshot) => void;
  patchSettings: (p: Partial<Settings>) => void;
  setShowBoard: (v: boolean) => void;
  setTouch: (v: boolean) => void;
  setBest: (n: number) => void;
  setRoomHost: (v: boolean) => void;
  /** Force `arena` + deathmatch (dev room), or pass null to restore the player's pick. */
  setDevArena: (arena: ArenaId | null) => void;
};

export const useArena = create<ArenaStore>((set, get) => ({
  screen: "menu",
  settings: loadSettings(),
  hud: emptyHud,
  showBoard: false,
  isTouch: false,
  best: 0,
  roomHost: true,
  devLock: null,
  setScreen: (screen) => set({ screen }),
  setHud: (hud) => set({ hud, showBoard: hud.alive ? get().showBoard : get().showBoard }),
  patchSettings: (p) => {
    const { devLock } = get();
    const next = patchLocked(get().settings, p, devLock);
    if ("name" in p) next.name = sanitizePilotName(next.name);
    const settings = next;
    set({ settings });
    persistSettings(persistable(settings, devLock));
  },
  setShowBoard: (showBoard) => set({ showBoard }),
  setTouch: (isTouch) => set({ isTouch }),
  setBest: (best) => set({ best }),
  setRoomHost: (roomHost) => set({ roomHost }),
  setDevArena: (arena) => {
    const { settings, devLock } = get();
    if (arena === null) {
      if (devLock) set({ settings: unlockSettings(settings, devLock), devLock: null });
      return;
    }
    if (devLock?.arena === arena && settings.arena === arena && settings.mode === "dm") return;
    const next = lockSettings(settings, arena, devLock);
    set({ settings: next.settings, devLock: next.lock });
  },
}));

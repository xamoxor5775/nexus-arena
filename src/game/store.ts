import { create } from "zustand";
import { DEFAULT_SETTINGS } from "./constants";
import { SETTINGS_KEY } from "./constants";
import type { HudSnapshot, Screen, Settings } from "./types";

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
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
};

export type ArenaId = "crucible" | "reactor";

const MAP_KEY = "nexus-arena-map-v1";

function loadMapId(): ArenaId {
  try {
    return localStorage.getItem(MAP_KEY) === "reactor" ? "reactor" : "crucible";
  } catch {
    return "crucible";
  }
}

export type ArenaStore = {
  screen: Screen;
  settings: Settings;
  hud: HudSnapshot;
  showBoard: boolean;
  isTouch: boolean;
  best: number;
  mapId: ArenaId;
  setScreen: (s: Screen) => void;
  setMapId: (id: ArenaId) => void;
  setHud: (h: HudSnapshot) => void;
  patchSettings: (p: Partial<Settings>) => void;
  setShowBoard: (v: boolean) => void;
  setTouch: (v: boolean) => void;
  setBest: (n: number) => void;
};

export const useArena = create<ArenaStore>((set, get) => ({
  screen: "menu",
  settings: loadSettings(),
  hud: emptyHud,
  showBoard: false,
  isTouch: false,
  best: 0,
  mapId: loadMapId(),
  setScreen: (screen) => set({ screen }),
  setMapId: (mapId) => {
    set({ mapId });
    try {
      localStorage.setItem(MAP_KEY, mapId);
    } catch {
      /* ignore */
    }
  },
  setHud: (hud) => set({ hud, showBoard: hud.alive ? get().showBoard : get().showBoard }),
  patchSettings: (p) => {
    const settings = { ...get().settings, ...p };
    set({ settings });
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  },
  setShowBoard: (showBoard) => set({ showBoard }),
  setTouch: (isTouch) => set({ isTouch }),
  setBest: (best) => set({ best }),
}));

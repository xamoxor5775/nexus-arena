/**
 * Weapon skins (cosmetic, first-person only). Each weapon keeps its stock model ("Original", free).
 * Alternative skins are third-party models (CC BY 4.0, credited in /CREDITS.txt and the CRÉDITOS
 * screen) sold per skin or as a bundle through Flow (prices: src/lib/skin-store.ts).
 *
 * Ownership: the server is the source of truth (/api/skins/owned, keyed by the Flow purchase email
 * + restore code). The browser keeps {email, code} and a cached owned list in localStorage; the
 * cache is re-validated against the server every time the game loads. Only owned skins can be
 * equipped; previews in ARSENAL are open to everyone. Skins never change damage/rate/range and
 * other players always see the stock models (nothing about skins is sent over the network).
 *
 * Calibration (per skin): `euler` rotates the raw glTF into the view frame (barrel/blade towards
 * -Z, up +Y), `length` is the size in metres along Z, `muzzleUV` picks the muzzle on the front
 * face, `hip`/`ads` are the first-person poses and `rotation` the hip tilt.
 */
import type { WeaponId } from "@/game/types";
import { SKIN_PRICE_CLP, isPaidSkin, normalizeEmail, normalizeRestoreCode } from "@/lib/skin-store";

type V3 = [number, number, number];

export type SkinCredit = {
  title: string;
  author: string;
  authorUrl: string;
  url: string;
  license: "CC BY 4.0";
  licenseUrl: string;
};

export type SkinDef = {
  id: string;
  weapon: WeaponId;
  name: string;
  /** Stock model (procedural or the bundled pack): always free and owned. */
  stock?: boolean;
  file?: string;
  euler?: V3;
  length?: number;
  muzzleUV?: [number, number];
  hip?: V3;
  ads?: V3;
  rotation?: V3;
  credit?: SkinCredit;
};

export type SkinPackSpec = {
  id: string;
  file: string;
  euler: V3;
  length: number;
  muzzleUV: [number, number];
  forward: V3;
  up: V3;
  muzzle: V3;
  hip: V3;
  ads: V3;
  rotation?: V3;
  melee: boolean;
};

const CC_BY = "https://creativecommons.org/licenses/by/4.0/";
const credit = (title: string, author: string, authorUrl: string, url: string): SkinCredit => ({ title, author, authorUrl, url, license: "CC BY 4.0", licenseUrl: CC_BY });

const stock = (weapon: WeaponId): SkinDef => ({ id: `${weapon}-default`, weapon, name: "Original", stock: true });

export const SKINS: SkinDef[] = [
  stock("pulse"),
  {
    id: "pulse-ar-h470", weapon: "pulse", name: "AR-H470", file: "pulse-ar-h470.glb",
    euler: [11, 180, 0], length: 0.5, muzzleUV: [0.5, 0.45], hip: [0.2, -0.2, -0.3], ads: [0, -0.12, -0.34],
    credit: credit("AR-H470", "Frostoise", "https://sketchfab.com/Frostoise", "https://sketchfab.com/3d-models/ar-h470-4b38c160243743d681d6fdaf3bd77ddb"),
  },
  {
    id: "pulse-lowpoly-smg", weapon: "pulse", name: "Neón SMG", file: "pulse-lowpoly-smg.glb",
    euler: [0, 180, 0], length: 0.36, muzzleUV: [0.5, 0.7], hip: [0.2, -0.19, -0.3], ads: [0, -0.09, -0.32],
    credit: credit("Low Poly Futuristic Sci Fi Sub Machine Gun", "Anatomy by Doctor Jana", "https://sketchfab.com/docjana", "https://sketchfab.com/3d-models/low-poly-futuristic-sci-fi-sub-machine-gun-39f1767e68834396b9ea1beea41c0abf"),
  },
  stock("scatter"),
  {
    id: "scatter-super-shotgun", weapon: "scatter", name: "Super Shotgun", file: "scatter-super-shotgun.glb",
    euler: [0, 180, 0], length: 0.58, muzzleUV: [0.5, 0.6], hip: [0.21, -0.18, -0.3], ads: [0, -0.08, -0.34],
    credit: credit("Sci-fi Super Shotgun", "tnnv", "https://sketchfab.com/tnnv", "https://sketchfab.com/3d-models/sci-fi-super-shotgun-5929e6949d1e421e927116e117248f07"),
  },
  stock("torpedo"),
  {
    id: "torpedo-brt-blaster", weapon: "torpedo", name: "BRT-Blaster", file: "torpedo-brt-blaster.glb",
    euler: [0, 90, 0], length: 0.54, muzzleUV: [0.5, 0.6], hip: [0.23, -0.2, -0.32], ads: [0, -0.1, -0.36],
    credit: credit("BRT-BLASTER v1 — Optimized Game-Ready Weapon", "D.Acee", "https://sketchfab.com/D.Acee", "https://sketchfab.com/3d-models/brt-blaster-v1-optimized-game-ready-weapon-270371dc262548ec9cfcacc514782d26"),
  },
  stock("lance"),
  {
    id: "lance-nexus-rail", weapon: "lance", name: "Nexus Rail", file: "lance-nexus-rail.glb",
    euler: [0, 180, 0], length: 0.62, muzzleUV: [0.5, 0.7], hip: [0.19, -0.18, -0.28], ads: [0, -0.075, -0.32],
    credit: credit("Nexus Rail Gun", "Bl4ckGh0st", "https://sketchfab.com/Bl4ckGh0st", "https://sketchfab.com/3d-models/nexus-rail-gun-c3952b3905b64f249cb240b5b3fe8d9d"),
  },
  stock("ion"),
  {
    id: "ion-stylized-laser", weapon: "ion", name: "Láser estilizado", file: "ion-stylized-laser.glb",
    euler: [0, 90, 0], length: 0.4, muzzleUV: [0.5, 0.7], hip: [0.2, -0.19, -0.34], ads: [0, -0.095, -0.36],
    credit: credit("Sci-fi Stylized Laser Gun - Game Ready Asset", "rkna", "https://sketchfab.com/diegorequena", "https://sketchfab.com/3d-models/sci-fi-stylized-laser-gun-game-ready-asset-ff82a081ec214b2d8eff8417e2b06545"),
  },
  stock("fauces"),
  {
    id: "fauces-cyborg", weapon: "fauces", name: "Cyborg", file: "fauces-cyborg.glb",
    euler: [0, 0, 0], length: 0.42, muzzleUV: [0.5, 0.6], hip: [0.2, -0.18, -0.34], ads: [0, -0.12, -0.4],
    credit: credit("Cyborg Weapon", "Enalrem", "https://sketchfab.com/enalrem", "https://sketchfab.com/3d-models/cyborg-weapon-8bf111f38ff34ad38068739819fdaf0d"),
  },
  stock("knife"),
  {
    id: "espada-neon-blade", weapon: "knife", name: "Hoja de neón", file: "espada-neon-blade.glb",
    euler: [0, 180, 0], length: 0.42, muzzleUV: [0.5, 0.5], hip: [0.21, -0.2, -0.4], ads: [0.16, -0.17, -0.42], rotation: [0.7, 0.1, -0.3],
    credit: credit("Neon Blade - Sword", "Wawann", "https://sketchfab.com/Wawann", "https://sketchfab.com/3d-models/neon-blade-sword-e3caffae38ff43aea3476cea700b6a00"),
  },
  stock("bate"),
  {
    id: "bate-metal-bat", weapon: "bate", name: "Bate metálico", file: "bate-metal-bat.glb",
    euler: [0, 90, 0], length: 0.5, muzzleUV: [0.5, 0.5], hip: [0.22, -0.2, -0.42], ads: [0.17, -0.17, -0.44], rotation: [0.7, 0.1, -0.3],
    credit: credit("Metal Baseball Bat", "Enshin", "https://sketchfab.com/enshin", "https://sketchfab.com/3d-models/metal-baseball-bat-ae15b871add9416a94dc940b117e6e2b"),
  },
  stock("martillo"),
  {
    id: "martillo-futuristic-mace", weapon: "martillo", name: "Maza futurista", file: "martillo-futuristic-mace.glb",
    euler: [143.8, -25.5, 69.4], length: 0.44, muzzleUV: [0.5, 0.5], hip: [0.22, -0.2, -0.42], ads: [0.17, -0.17, -0.44], rotation: [0.7, 0.1, -0.3],
    credit: credit("Futuristic Mace [Download]", "Oskar \"K1TT3N\" Adamczyk", "https://sketchfab.com/K1TT3N", "https://sketchfab.com/3d-models/futuristic-mace-download-67e32e394d774516a0742949359e0e4f"),
  },
];

const MELEE = new Set<WeaponId>(["knife", "bate", "martillo"]);
const SELECTION_KEY = "nexus-skins-selection-v1";
const OWNER_KEY = "nexus-skins-owner-v1";
const OWNED_KEY = "nexus-skins-owned-v1";
export const SKINS_CHANGED = "nexus-skins-changed";

export function skinsFor(weapon: WeaponId): SkinDef[] {
  return SKINS.filter((s) => s.weapon === weapon);
}
export function skinById(id: string): SkinDef | undefined {
  return SKINS.find((s) => s.id === id);
}
/** Price in CLP of a skin (null = free stock model). */
export function skinPrice(skin: SkinDef): number | null {
  return skin.stock ? null : SKIN_PRICE_CLP;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
function readJson<T>(key: string): T | null {
  try {
    const raw = storage()?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    if (value === null) storage()?.removeItem(key);
    else storage()?.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode */
  }
}
function emit(detail: Record<string, unknown> = {}) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(SKINS_CHANGED, { detail }));
}

// ---- ownership -------------------------------------------------------------------------------

export type SkinOwner = { email: string; code: string };
let owned: Set<string> | null = null;

function ownedSet(): Set<string> {
  if (owned) return owned;
  const cached = readJson<string[]>(OWNED_KEY);
  owned = new Set((Array.isArray(cached) ? cached : []).filter((id) => typeof id === "string" && isPaidSkin(id)));
  return owned;
}

export function isOwned(skin: SkinDef): boolean {
  return Boolean(skin.stock) || ownedSet().has(skin.id);
}
export function ownedSkinIds(): string[] {
  return [...ownedSet()];
}
export function skinOwner(): SkinOwner | null {
  const value = readJson<SkinOwner>(OWNER_KEY);
  return value && typeof value.email === "string" && typeof value.code === "string" ? value : null;
}

/** Replace the owned list (server answer). Equipped skins no longer owned fall back to Original. */
export function setOwnedSkins(ids: string[], owner?: SkinOwner | null) {
  owned = new Set(ids.filter((id) => isPaidSkin(id)));
  writeJson(OWNED_KEY, [...owned]);
  if (owner !== undefined) writeJson(OWNER_KEY, owner ? { email: normalizeEmail(owner.email), code: normalizeRestoreCode(owner.code) } : null);
  const sel = load();
  for (const [weapon, id] of Object.entries(sel)) {
    const skin = id ? skinById(id) : undefined;
    if (!skin || !isOwned(skin)) delete sel[weapon as WeaponId];
  }
  persist(sel);
  emit({ owned: [...owned] });
}

type OwnedAnswer = { ok?: boolean; skins?: string[]; error?: string };

/** Ask the server which skins {email, code} owns. Returns the list, or throws with a user message. */
export async function fetchOwnedSkins(owner: SkinOwner): Promise<string[]> {
  const response = await fetch("/api/skins/owned", {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ email: normalizeEmail(owner.email), code: normalizeRestoreCode(owner.code) }),
  });
  const body = (await response.json().catch(() => ({}))) as OwnedAnswer;
  if (!response.ok || !body.ok) throw new Error(body.error || "No pudimos validar tus compras.");
  return Array.isArray(body.skins) ? body.skins : [];
}

/** "Restaurar compras": validates email + code, stores them and the owned list. */
export async function restorePurchases(email: string, code: string): Promise<string[]> {
  const owner = { email: normalizeEmail(email), code: normalizeRestoreCode(code) };
  const skins = await fetchOwnedSkins(owner);
  setOwnedSkins(skins, owner);
  return skins;
}

let refreshing: Promise<void> | null = null;
/** Re-validate the cached ownership with the server (once per page load; errors keep the cache). */
export function refreshOwnedSkins(): Promise<void> {
  if (refreshing) return refreshing;
  const owner = skinOwner();
  if (!owner) {
    // No purchase on this browser: nothing paid can be equipped.
    if (ownedSet().size) setOwnedSkins([]);
    refreshing = Promise.resolve();
    return refreshing;
  }
  refreshing = fetchOwnedSkins(owner)
    .then((skins) => setOwnedSkins(skins))
    .catch((error: unknown) => {
      // Wrong/revoked code: drop it. Network/server trouble: keep the cache for now.
      if (error instanceof Error && /no coinciden|inválid/i.test(error.message)) setOwnedSkins([], null);
    });
  return refreshing;
}

export function forgetSkinOwner() {
  setOwnedSkins([], null);
}

// ---- selection -------------------------------------------------------------------------------

type Selection = Partial<Record<WeaponId, string>>;
let selection: Selection | null = null;

function persist(sel: Selection) {
  writeJson(SELECTION_KEY, sel);
}

function load(): Selection {
  if (selection) return selection;
  const parsed = readJson<Selection>(SELECTION_KEY) ?? {};
  const out: Selection = {};
  for (const [weapon, id] of Object.entries(parsed)) {
    const skin = typeof id === "string" ? skinById(id) : undefined;
    if (skin && skin.weapon === weapon && isOwned(skin)) out[weapon as WeaponId] = id;
  }
  selection = out;
  return selection;
}

export function selectedSkin(weapon: WeaponId): SkinDef {
  const id = load()[weapon];
  const skin = id ? skinById(id) : undefined;
  return skin && isOwned(skin) ? skin : stock(weapon);
}

/** HUD weapon-bar icon: the equipped skin's render, or the stock pickup icon. */
export function hudWeaponIcon(weapon: WeaponId): string {
  const skin = selectedSkin(weapon);
  return skin.stock ? `/textures/pickups/${weapon}-icon.jpg` : `/textures/pickups/skins/${skin.id}.webp`;
}

/** Equip a skin. Paid skins must be owned (returns false otherwise). */
export function selectSkin(weapon: WeaponId, id: string): boolean {
  const skin = skinById(id);
  if (!skin || skin.weapon !== weapon || !isOwned(skin)) return false;
  const sel = load();
  if (skin.stock) delete sel[weapon];
  else sel[weapon] = id;
  persist(sel);
  emit({ weapon, id });
  return true;
}

/** Pack spec for the first-person view (null = stock model). `skinId` overrides the selection (ARSENAL preview). */
export function skinPack(weapon: WeaponId, skinId?: string): SkinPackSpec | null {
  const skin = skinId ? skinById(skinId) : selectedSkin(weapon);
  if (!skin || skin.stock || !skin.file || skin.weapon !== weapon) return null;
  return {
    id: skin.id,
    file: skin.file,
    euler: skin.euler ?? [0, 0, 0],
    length: skin.length ?? 0.5,
    muzzleUV: skin.muzzleUV ?? [0.5, 0.5],
    forward: [0, 0, -1],
    up: [0, 1, 0],
    muzzle: [0, 0, 0],
    hip: skin.hip ?? [0.2, -0.18, -0.3],
    ads: skin.ads ?? [0, -0.07, -0.32],
    rotation: skin.rotation,
    melee: MELEE.has(weapon),
  };
}

/** All third-party models shipped (for the credits screen / CREDITS.txt). */
export function creditedSkins(): (SkinDef & { credit: SkinCredit })[] {
  return SKINS.filter((s): s is SkinDef & { credit: SkinCredit } => !!s.credit);
}

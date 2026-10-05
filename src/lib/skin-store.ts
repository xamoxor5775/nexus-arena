/**
 * Weapon skin store: THE single place for products and prices (CLP).
 * Shared by the browser (ARSENAL prices, checkout) and the server (Flow amount check).
 * Changing a price here only affects NEW orders; paid orders keep the amount they were charged.
 */

/** Price of one weapon skin, CLP. */
export const SKIN_PRICE_CLP = 1000;
/** Price of the bundle with every paid skin, CLP. */
export const SKIN_BUNDLE_PRICE_CLP = 10000;
/** Product id of the bundle. */
export const SKIN_BUNDLE_ID = "arsenal-completo";
export const SKIN_BUNDLE_NAME = "Arsenal completo (10 diseños)";

/** Paid skins (ids match src/skins/skins.ts). Stock "Original" models are always free. */
export const PAID_SKINS: { id: string; name: string }[] = [
  { id: "pulse-ar-h470", name: "Pulse · AR-H470" },
  { id: "pulse-lowpoly-smg", name: "Pulse · Neón SMG" },
  { id: "scatter-super-shotgun", name: "Scatter · Super Shotgun" },
  { id: "torpedo-brt-blaster", name: "Torpedo · BRT-Blaster" },
  { id: "lance-nexus-rail", name: "Lance · Nexus Rail" },
  { id: "ion-stylized-laser", name: "Ion · Láser estilizado" },
  { id: "fauces-cyborg", name: "Fauces · Cyborg" },
  { id: "espada-neon-blade", name: "Espada · Hoja de neón" },
  { id: "bate-metal-bat", name: "Bate · Bate metálico" },
  { id: "martillo-futuristic-mace", name: "Martillo · Maza futurista" },
];

export type SkinProduct = { id: string; name: string; amount: number; skins: string[] };

/** Product by id (a paid skin id or the bundle id), or null. */
export function skinProduct(id: string): SkinProduct | null {
  if (id === SKIN_BUNDLE_ID) {
    return { id, name: SKIN_BUNDLE_NAME, amount: SKIN_BUNDLE_PRICE_CLP, skins: PAID_SKINS.map((s) => s.id) };
  }
  const skin = PAID_SKINS.find((s) => s.id === id);
  return skin ? { id, name: skin.name, amount: SKIN_PRICE_CLP, skins: [skin.id] } : null;
}

export function isPaidSkin(id: string): boolean {
  return PAID_SKINS.some((s) => s.id === id);
}

/** "$1.000" (CLP, es-CL thousands separator). */
export function formatClp(amount: number): string {
  return `$${Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

/** Restore code shape: NX-XXXX-XXXX-XXXX (Crockford-ish base32, no 0/O/1/I). */
export const RESTORE_CODE = /^NX-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

export function normalizeRestoreCode(raw: string): string {
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^NX/, "");
  if (compact.length !== 12) return raw.trim().toUpperCase();
  return `NX-${compact.slice(0, 4)}-${compact.slice(4, 8)}-${compact.slice(8, 12)}`;
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

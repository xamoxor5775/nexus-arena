import { createHmac, timingSafeEqual } from "node:crypto";
import { RESTORE_CODE, isPaidSkin, normalizeEmail, normalizeRestoreCode } from "./skin-store.ts";

/**
 * Pure (no DB, no network) pieces of the weapon-skin purchases, unit-tested in skin-contract.test.ts.
 *
 * Restore code: derived from the purchase email with an HMAC of a server secret, so it never has to be
 * stored and can always be shown again to whoever proves the purchase (claim with the Flow order id).
 * Format NX-XXXX-XXXX-XXXX (60 bits). Knowing an email alone gives nothing.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 symbols, no 0/O/1/I

export function restoreCodeFor(email: string, secret: string): string {
  if (!secret) throw new Error("restore secret missing");
  const digest = createHmac("sha256", secret).update(`nexus-skins-restore:v1:${normalizeEmail(email)}`).digest();
  let out = "";
  for (let i = 0; i < 12; i++) out += ALPHABET[digest[i]! & 31];
  return `NX-${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}`;
}

export function restoreCodeMatches(email: string, code: string, secret: string): boolean {
  const given = normalizeRestoreCode(code);
  if (!RESTORE_CODE.test(given)) return false;
  const expected = restoreCodeFor(email, secret);
  return timingSafeEqual(Buffer.from(expected), Buffer.from(given));
}

/** Flow request signature (same algorithm as flow.server.ts `sign`): HMAC-SHA256 over sorted key+value pairs. */
export function flowSignature(params: Record<string, string | number>, secretKey: string): string {
  const raw = Object.keys(params).sort().map((key) => `${key}${params[key]}`).join("");
  return createHmac("sha256", secretKey).update(raw).digest("hex");
}

/** Union of the skin lists of paid orders ("a,b,c" each), only known paid skins, stable order. */
export function mergeOwnedSkins(rows: { skins: string | null }[]): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    for (const id of String(row.skins || "").split(",").map((s) => s.trim())) {
      if (id && isPaidSkin(id)) seen.add(id);
    }
  }
  return [...seen].sort();
}

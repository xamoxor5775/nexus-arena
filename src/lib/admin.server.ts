import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "nexus_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

function adminSecret(): string {
  const value = process.env.NEXUS_ADMIN_SECRET?.trim();
  if (!value) throw new Error("NEXUS_ADMIN_SECRET is required for the admin panel");
  return value;
}

function signature(payload: string): string {
  return createHmac("sha256", adminSecret()).update(payload).digest("hex");
}

export function createAdminSession(): string {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  return `${expiresAt}.${signature(String(expiresAt))}`;
}

export function adminSessionIsValid(cookieHeader: string | null): boolean {
  const raw = cookieHeader?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${ADMIN_COOKIE}=`));
  if (!raw) return false;
  const [expiresAt, provided] = decodeURIComponent(raw.slice(ADMIN_COOKIE.length + 1)).split(".");
  if (!expiresAt || !provided || Number(expiresAt) < Math.floor(Date.now() / 1000)) return false;
  const expected = signature(expiresAt);
  return expected.length === provided.length && timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

export function adminPasswordMatches(password: string): boolean {
  const configured = process.env.NEXUS_ADMIN_SECRET?.trim();
  if (!configured || !password) return false;
  const expected = Buffer.from(configured);
  const received = Buffer.from(password);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

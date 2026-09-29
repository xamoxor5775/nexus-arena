import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getCookie, getRequest } from "@tanstack/react-start/server";
import { getSql } from "./db";

export const ACCESS_SESSION_COOKIE = "nexus_access_session";

function secret(): string {
  const value = process.env.NEXUS_ACCESS_SECRET?.trim();
  if (!value) throw new Error("NEXUS_ACCESS_SECRET is required in production");
  return value;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function signAccessToken(orderId: string): string {
  const payload = `${orderId}.${Date.now()}.${randomBytes(12).toString("hex")}`;
  const signature = createHmac("sha256", secret()).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

export function accessTokenLooksValid(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 4) return false;
  const [orderId, issuedAt, nonce, signature] = parts;
  if (!orderId || !issuedAt || !nonce || !signature || !/^\d+$/.test(issuedAt)) return false;
  const payload = `${orderId}.${issuedAt}.${nonce}`;
  const expected = createHmac("sha256", secret()).update(payload).digest("hex");
  return expected.length === signature.length && timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export function signAccessSession(orderId: string): string {
  const payload = `session.${orderId}.${Date.now()}.${randomBytes(12).toString("hex")}`;
  const signature = createHmac("sha256", secret()).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

function sessionTokenLooksValid(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 5 || parts[0] !== "session") return false;
  const [, orderId, issuedAt, nonce, signature] = parts;
  if (!orderId || !issuedAt || !nonce || !signature || !/^\d+$/.test(issuedAt)) return false;
  const age = Date.now() - Number(issuedAt);
  if (age < 0 || age > 40 * 24 * 60 * 60 * 1000) return false;
  const payload = `session.${orderId}.${issuedAt}.${nonce}`;
  const expected = createHmac("sha256", secret()).update(payload).digest("hex");
  return expected.length === signature.length && timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

const ACCESS_OK_TTL_MS = 90_000;
const ACCESS_FAIL_TTL_MS = 4_000;
const ACCESS_CACHE_MAX = 256;
type AccessRow = { orderId: string; email: string };
type AccessCacheEntry = { value: AccessRow | null; until: number };
const accessCache = (globalThis as typeof globalThis & { __nexusAccessCache__?: Map<string, AccessCacheEntry> }).__nexusAccessCache__ ??= new Map();

function cacheRead(key: string): AccessCacheEntry | undefined {
  const hit = accessCache.get(key);
  if (!hit) return;
  if (hit.until < Date.now()) {
    accessCache.delete(key);
    return;
  }
  return hit;
}

function cacheWrite(key: string, value: AccessRow | null, ttl: number) {
  if (accessCache.size >= ACCESS_CACHE_MAX) {
    const oldest = accessCache.keys().next().value;
    if (oldest) accessCache.delete(oldest);
  }
  accessCache.set(key, { value, until: Date.now() + ttl });
}

async function lookupPaidSession(token: string): Promise<AccessRow | null> {
  const key = hashToken(token);
  const cached = cacheRead(key);
  if (cached) return cached.value;
  if (!sessionTokenLooksValid(token)) {
    cacheWrite(key, null, ACCESS_FAIL_TTL_MS);
    return null;
  }
  const [, orderId] = token.split(".");
  if (!orderId) return null;
  try {
    const sql = await getSql();
    const rows = await sql.query<{ email: string }>(
      "select email from nexus_orders where id = $1 and status = 'paid' and access_session_hash = $2 and (active_until is null or active_until > now()) limit 1",
      [orderId, key],
    );
    const value = rows[0] ? { orderId, email: rows[0].email } : null;
    cacheWrite(key, value, value ? ACCESS_OK_TTL_MS : ACCESS_FAIL_TTL_MS);
    return value;
  } catch {
    return null;
  }
}

export function accessSessionSigned(headers: Headers): boolean {
  const token = headers.get("authorization")?.replace(/^Bearer\s+/i, "") || sessionCookieToken(headers.get("cookie"));
  return Boolean(token && sessionTokenLooksValid(token));
}

export async function accessFromHeaders(headers: Headers): Promise<AccessRow | null> {
  const token = headers.get("authorization")?.replace(/^Bearer\s+/i, "") || sessionCookieToken(headers.get("cookie"));
  if (!token) return null;
  return lookupPaidSession(token);
}

export async function accessFromRequest(request = getRequest()): Promise<AccessRow | null> {
  const headers = request?.headers ?? new Headers();
  const token = headers.get("authorization")?.replace(/^Bearer\s+/i, "") || getCookie(ACCESS_SESSION_COOKIE);
  if (!token) return null;
  return lookupPaidSession(token);
}

function sessionCookieToken(cookieHeader: string | null): string | null {
  const item = cookieHeader?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${ACCESS_SESSION_COOKIE}=`));
  return item ? decodeURIComponent(item.slice(ACCESS_SESSION_COOKIE.length + 1)) : null;
}

export function tokenHash(token: string): string {
  return hashToken(token);
}

import { createHmac } from "node:crypto";

/** Default own/test IP prefixes (overridable with NEXUS_INTERNAL_IP_PREFIXES, comma separated). */
export const DEFAULT_INTERNAL_PREFIXES = ["104.30.180.", "190.114."];
export const JOIN_TIME_ZONE = "America/Santiago";

const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: JOIN_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/** Calendar day (YYYY-MM-DD) in Chile for a timestamp. */
export function joinDay(at: number | Date = Date.now()): string {
  return dayFormat.format(at);
}

/** Strip the IPv4-mapped IPv6 prefix so "::ffff:190.114.1.2" matches "190.114.". */
export function normalizeIp(ip: string): string {
  const value = ip.trim().toLowerCase();
  return value.startsWith("::ffff:") ? value.slice(7) : value;
}

export function parsePrefixes(raw: string | undefined): string[] {
  if (raw === undefined) return DEFAULT_INTERNAL_PREFIXES;
  return raw.split(",").map((part) => part.trim()).filter(Boolean);
}

export function isInternalIp(ip: string, prefixes: string[]): boolean {
  const value = normalizeIp(ip);
  return prefixes.some((prefix) => value.startsWith(prefix.toLowerCase()));
}

/** Keyed, truncated hash: lets us count unique visitors without storing raw IPs or session ids. */
export function hashId(value: string, secret: string): string {
  return createHmac("sha256", secret || "nexus-ingresos").update(value).digest("hex").slice(0, 16);
}

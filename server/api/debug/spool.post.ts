import { defineEventHandler, readBody, setResponseStatus } from "h3";
import { appendSpool } from "../../../src/lib/debug-spool.server";
import { clientIp } from "../../client-ip";

type Incoming = {
  t?: string;
  level?: string;
  scope?: string;
  message?: string;
  stack?: string;
  href?: string;
};

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 12;
const hits = (globalThis as typeof globalThis & { __nexusSpoolHits__?: Map<string, { n: number; until: number }> }).__nexusSpoolHits__ ??= new Map();

function allow(key: string) {
  const now = Date.now();
  const row = hits.get(key);
  if (!row || row.until < now) {
    hits.set(key, { n: 1, until: now + WINDOW_MS });
    if (hits.size > 256) {
      const oldest = hits.keys().next().value;
      if (oldest) hits.delete(oldest);
    }
    return true;
  }
  if (row.n >= MAX_PER_WINDOW) return false;
  row.n += 1;
  return true;
}

export default defineEventHandler(async (event) => {
  if (!allow(clientIp(event))) {
    setResponseStatus(event, 204);
    return null;
  }
  const body = await readBody<{ events?: Incoming[] }>(event);
  const events = Array.isArray(body?.events)
    ? body.events.filter((item) => item?.level === "warn" || item?.level === "error").slice(-12)
    : [];
  if (!events.length) return { ok: true, wrote: 0 };
  const lines = events.map((item) =>
    JSON.stringify({
      t: item.t || new Date().toISOString(),
      level: item.level,
      scope: String(item.scope || "client").slice(0, 80),
      message: String(item.message || "").slice(0, 2000),
      stack: item.stack ? String(item.stack).slice(0, 4000) : undefined,
      href: item.href ? String(item.href).slice(0, 180) : undefined,
      src: "client",
    }),
  );
  await appendSpool(lines);
  return { ok: true, wrote: lines.length };
});

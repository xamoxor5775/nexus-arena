/**
 * Client IP for rate limits, spoof-resistant behind our nginx (deploy/nginx/nexusarena.cl.conf):
 * 1. `X-Real-IP` — nginx overwrites it with `$remote_addr`, so the client cannot forge it.
 * 2. The LAST `X-Forwarded-For` entry — the one appended by the closest proxy (`$proxy_add_x_forwarded_for`);
 *    the first entries come from the client and can be anything.
 * 3. The socket address (direct connections / local dev).
 * Never trust the FIRST X-Forwarded-For value: a client can send `X-Forwarded-For: <random>` on every
 * request and get a fresh rate-limit bucket each time.
 */
export function clientIpFromHeaders(headers: Pick<Headers, "get">, socketAddress?: string | null): string {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((part) => part.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last;
  }
  return socketAddress?.trim() || "local";
}

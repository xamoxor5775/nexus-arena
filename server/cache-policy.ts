/**
 * Single source of truth for HTTP cache headers on static files.
 *
 * - `/assets/**` are Vite build outputs with a content hash in the filename,
 *   so a new build always produces new URLs: cache for a year, immutable.
 * - `/media`, `/textures`, `/models`, `/sfx` come straight from public/ with
 *   stable, non-hashed names that get replaced in place (e.g. a new
 *   `nexus-arena-demo.mp4` or a re-exported `.glb`). They get 7 days plus
 *   a day of stale-while-revalidate: repeat visits skip the download, and a
 *   replaced file propagates within a week (ETag/Last-Modified make the
 *   revalidation a cheap 304). NOT immutable on purpose.
 * - JSON under /media (the radio playlist) must reflect edits immediately:
 *   `no-cache` = always revalidate.
 * - HTML documents and `/api/**` stay `no-store` (set by server/middleware and
 *   the API handlers; `/api/**` is also pinned here).
 *
 * `deploy/nginx/nexusarena.cl.conf` mirrors these values; keep them in sync.
 */
export const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";
export const STATIC_CACHE = "public, max-age=604800, stale-while-revalidate=86400";
export const REVALIDATE_CACHE = "no-cache";
export const NO_STORE = "no-store, no-cache, must-revalidate";

export const STATIC_PREFIXES = ["/media/", "/textures/", "/models/", "/sfx/"] as const;

/** Cache-Control for a static path, or null when the path is not a static file. */
export function staticCacheControl(pathname: string): string | null {
  if (pathname.startsWith("/assets/")) return IMMUTABLE_CACHE;
  if (!STATIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;
  if (pathname.startsWith("/media/") && pathname.endsWith(".json")) return REVALIDATE_CACHE;
  return STATIC_CACHE;
}

const header = (value: string) => ({ headers: { "cache-control": value } });

/** Nitro routeRules. Later, more specific rules override earlier ones. */
export const STATIC_ROUTE_RULES = {
  "/assets/**": header(IMMUTABLE_CACHE),
  "/media/**": header(STATIC_CACHE),
  "/media/**/*.json": header(REVALIDATE_CACHE),
  "/media/*.json": header(REVALIDATE_CACHE),
  "/textures/**": header(STATIC_CACHE),
  "/models/**": header(STATIC_CACHE),
  "/sfx/**": header(STATIC_CACHE),
  "/api/**": header(NO_STORE),
};

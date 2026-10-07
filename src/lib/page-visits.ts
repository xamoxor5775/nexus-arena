/** Pure helpers for the visit counter (shared by the beacon endpoint and tests). */

/** Crawlers, link previewers, monitors and scripted clients: never counted as visits. */
const BOT_UA =
  /bot|crawl|spider|slurp|curl|wget|headless|python|httpclient|okhttp|java\/|go-http|axios|node-fetch|undici|scrapy|phantom|selenium|puppeteer|playwright|lighthouse|pingdom|uptime|monitor|preview|facebookexternalhit|whatsapp|telegram|discord|slack|embedly|validator|feedfetcher|scan/i;

export function isBotUserAgent(ua: string | null | undefined): boolean {
  const value = (ua || "").trim();
  if (value.length < 20) return true; // empty or absurdly short UA = script
  return BOT_UA.test(value);
}

/** Public pages only: the admin panel and internal paths do not count as visits. */
export function isCountablePath(path: unknown): boolean {
  if (typeof path !== "string" || !path.startsWith("/") || path.length > 200) return false;
  return !/^\/(admin|api|__grok)(\/|$)/.test(path);
}

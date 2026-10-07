import { test } from "node:test";
import assert from "node:assert/strict";
import { isBotUserAgent, isCountablePath } from "./page-visits.ts";

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0";

test("visits: real browsers count, bots and scripts do not", () => {
  assert.equal(isBotUserAgent(CHROME), false);
  assert.equal(isBotUserAgent(IPHONE), false);
  for (const ua of [
    "Googlebot/2.1 (+http://www.google.com/bot.html)",
    "curl/8.5.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0 Safari/537.36",
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "WhatsApp/2.23.20.0 A",
    "python-requests/2.31.0",
    "",
    null,
  ]) assert.equal(isBotUserAgent(ua), true, String(ua));
});

test("visits: only public paths count", () => {
  assert.equal(isCountablePath("/"), true);
  assert.equal(isCountablePath("/gracias?x=1"), true);
  assert.equal(isCountablePath("/admin/metrics"), false);
  assert.equal(isCountablePath("/admin"), false);
  assert.equal(isCountablePath("/api/visita"), false);
  assert.equal(isCountablePath("https://evil.example/"), false);
  assert.equal(isCountablePath(42), false);
  assert.equal(isCountablePath("/" + "a".repeat(300)), false);
});

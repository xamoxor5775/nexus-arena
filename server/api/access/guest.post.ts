import { defineEventHandler, getRequestIP, setCookie, setResponseStatus } from "h3";
import { randomBytes } from "node:crypto";
import { ACCESS_SESSION_COOKIE, accessSessionSigned, signAccessSession } from "../../../src/lib/access.server";
import { makeLimiter } from "../../rate-limit";

/**
 * Free play: anyone gets a signed guest session (`session.g-<random>.<ts>.<nonce>.<hmac>`, 40 days),
 * the same cookie the paid access used, so /api/rtc (signature check only) lets them into online rooms.
 * Room caps, overflow rooms, dev room and PvP logic are unchanged. A browser that already holds a
 * valid session (paid or guest) keeps it.
 */
const limited = makeLimiter(40, 10 * 60 * 1000);

export default defineEventHandler((event) => {
  if (accessSessionSigned(event.req.headers)) return { access: true, guest: false };
  if (limited(getRequestIP(event, { xForwardedFor: true }) || "local")) {
    setResponseStatus(event, 429);
    return { access: false, error: "Demasiados intentos. Espera unos minutos." };
  }
  const session = signAccessSession(`g-${randomBytes(9).toString("hex")}`);
  setCookie(event, ACCESS_SESSION_COOKIE, session, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NEXUS_COOKIE_SECURE === "true",
    path: "/",
    maxAge: 40 * 24 * 60 * 60,
  });
  return { access: true, guest: true };
});

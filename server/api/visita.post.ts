import { defineEventHandler, readBody, setResponseStatus } from "h3";
import { recordPageVisit } from "../../src/lib/page-visits.server";
import { isBotUserAgent, isCountablePath } from "../../src/lib/page-visits";
import { clientIp } from "../client-ip";
import { makeLimiter } from "../rate-limit";

/** Beacon sent once per public page load (see src/routes/__root.tsx). Always 204, counted or not. */
const limited = makeLimiter(30, 60_000);

export default defineEventHandler(async (event) => {
  setResponseStatus(event, 204);
  const body = await readBody<{ path?: unknown }>(event).catch(() => null);
  if (!isCountablePath(body?.path) || isBotUserAgent(event.req.headers.get("user-agent"))) return null;
  const ip = clientIp(event);
  if (limited(ip)) return null;
  await recordPageVisit(ip);
  return null;
});

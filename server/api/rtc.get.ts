import { defineEventHandler, getQuery, setResponseStatus } from "h3";
import { accessSessionId } from "../../src/lib/access.server";
import { devRoomConfig, routeRoom } from "../../src/lib/dev-room";
import { pollRoom } from "../../src/lib/rtc.server";

export default defineEventHandler(async (event) => {
  const sessionId = accessSessionId(event.req.headers);
  if (!sessionId) { setResponseStatus(event, 401); return { error: "Arena access required" }; }
  const query = getQuery(event);
  const peer = String(query.peer || "").trim();
  if (!peer || peer.length > 100) { setResponseStatus(event, 400); return { error: "Invalid room" }; }
  // Testers listed in NEXUS_DEV_SESSIONS are forced into the fixed dev room.
  const config = devRoomConfig();
  const route = routeRoom(String(query.room || "").trim(), sessionId, config);
  if (!route.ok) { setResponseStatus(event, route.status); return { error: route.error }; }
  const result = pollRoom(route.room, peer, String(query.name || "Piloto").slice(0, 14), Number(query.since || 0), route.dev ? { dev: true, devArena: config.arena } : undefined);
  // Room at capacity: 409 + { full, suggestedRoom } so the client hops to an overflow room.
  if (result.full) setResponseStatus(event, 409);
  return result;
});

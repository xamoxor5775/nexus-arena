import { defineEventHandler, getQuery, setResponseStatus } from "h3";
import { accessSessionSigned } from "../../src/lib/access.server";
import { isPublicRoomId } from "../../src/game/constants";
import { pollRoom } from "../../src/lib/rtc.server";

export default defineEventHandler(async (event) => {
  if (!accessSessionSigned(event.req.headers)) { setResponseStatus(event, 401); return { error: "Arena access required" }; }
  const query = getQuery(event);
  const room = String(query.room || "").trim();
  const peer = String(query.peer || "").trim();
  if (!isPublicRoomId(room) || !peer || peer.length > 100) { setResponseStatus(event, 400); return { error: "Invalid room" }; }
  const result = pollRoom(room, peer, String(query.name || "Piloto").slice(0, 14), Number(query.since || 0));
  // Room at capacity: 409 + { full, suggestedRoom } so the client hops to an overflow room.
  if (result.full) setResponseStatus(event, 409);
  return result;
});

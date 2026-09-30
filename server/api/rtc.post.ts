import { defineEventHandler, readBody, setResponseStatus } from "h3";
import { accessSessionId } from "../../src/lib/access.server";
import { devRoomConfig, routeRoom } from "../../src/lib/dev-room";
import { addSignal, leaveRoom } from "../../src/lib/rtc.server";

export default defineEventHandler(async (event) => {
  const sessionId = accessSessionId(event.req.headers);
  if (!sessionId) { setResponseStatus(event, 401); return { error: "Arena access required" }; }
  const body = await readBody<{ op?: string; room?: string; from?: string; to?: string; peer?: string; kind?: "offer" | "answer" | "ice"; payload?: unknown }>(event);
  const route = routeRoom(String(body?.room || "").trim(), sessionId, devRoomConfig());
  if (!route.ok) { setResponseStatus(event, route.status); return { error: route.error }; }
  const access = { dev: route.dev };
  if (body?.op === "leave") { leaveRoom(route.room, String(body.peer || ""), access); return { ok: true }; }
  if (body?.op === "signal" && body.from && body.to && body.kind) { addSignal(route.room, body.from, body.to, body.kind, body.payload, access); return { ok: true }; }
  setResponseStatus(event, 400);
  return { error: "Invalid signal" };
});

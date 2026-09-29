import { defineEventHandler, readBody, setResponseStatus } from "h3";
import { accessSessionSigned } from "../../src/lib/access.server";
import { isPublicRoomId } from "../../src/game/constants";
import { addSignal, leaveRoom } from "../../src/lib/rtc.server";

export default defineEventHandler(async (event) => {
  if (!accessSessionSigned(event.req.headers)) { setResponseStatus(event, 401); return { error: "Arena access required" }; }
  const body = await readBody<{ op?: string; room?: string; from?: string; to?: string; peer?: string; kind?: "offer" | "answer" | "ice"; payload?: unknown }>(event);
  const room = String(body?.room || "").trim();
  if (!isPublicRoomId(room)) { setResponseStatus(event, 400); return { error: "Invalid room" }; }
  if (body?.op === "leave") { leaveRoom(room, String(body.peer || "")); return { ok: true }; }
  if (body?.op === "signal" && body.from && body.to && body.kind) { addSignal(room, body.from, body.to, body.kind, body.payload); return { ok: true }; }
  setResponseStatus(event, 400);
  return { error: "Invalid signal" };
});

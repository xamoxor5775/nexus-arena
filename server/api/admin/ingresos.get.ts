import { defineEventHandler, getQuery, setResponseStatus } from "h3";
import { adminSessionIsValid } from "../../../src/lib/admin.server";
import { arenaJoinStats } from "../../../src/lib/arena-joins.server";

/** Arena joins per day (admin cookie required). `?dias=30` (1..365, default 14). */
export default defineEventHandler(async (event) => {
  if (!adminSessionIsValid(event.node?.req.headers.cookie || null)) {
    setResponseStatus(event, 401);
    return { error: "No autorizado" };
  }
  const requested = Number(getQuery(event).dias || 14);
  const days = Number.isFinite(requested) ? Math.min(365, Math.max(1, Math.floor(requested))) : 14;
  return arenaJoinStats(days);
});

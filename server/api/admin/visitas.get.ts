import { defineEventHandler, setResponseStatus } from "h3";
import { adminSessionIsValid } from "../../../src/lib/admin.server";
import { visitStats } from "../../../src/lib/page-visits.server";

/** Visit counter for the admin panel (admin cookie required). */
export default defineEventHandler(async (event) => {
  if (!adminSessionIsValid(event.node?.req.headers.cookie || null)) {
    setResponseStatus(event, 401);
    return { error: "No autorizado" };
  }
  return visitStats(14);
});

import { defineEventHandler, setResponseStatus } from "h3";
import { accessFromHeaders } from "../../../src/lib/access.server";

export default defineEventHandler(async (event) => {
  const access = await accessFromHeaders(event.req.headers);
  if (!access) {
    setResponseStatus(event, 401);
    return { access: false };
  }
  return { access: true };
});

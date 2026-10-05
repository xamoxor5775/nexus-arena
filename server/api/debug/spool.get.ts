import { defineEventHandler, getRequestHeader, setResponseStatus } from "h3";
import { adminSessionIsValid } from "../../../src/lib/admin.server";
import { readSpoolTail, spoolPath } from "../../../src/lib/debug-spool.server";

export default defineEventHandler(async (event) => {
  try {
    const cookies = getRequestHeader(event, "cookie") ?? null;
    if (!adminSessionIsValid(cookies)) {
      setResponseStatus(event, 401);
      return { ok: false, error: "Se requiere sesión de admin para leer el spool." };
    }
  } catch {
    setResponseStatus(event, 401);
    return { ok: false, error: "Admin no configurado." };
  }
  const text = await readSpoolTail();
  return { ok: true, path: spoolPath(), text };
});

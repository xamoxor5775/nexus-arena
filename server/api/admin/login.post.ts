import { defineEventHandler, readBody, setCookie, setResponseStatus } from "h3";
import { ADMIN_COOKIE, adminPasswordMatches, createAdminSession } from "../../../src/lib/admin.server";

export default defineEventHandler(async (event) => {
  const body = await readBody<{ password?: string }>(event);
  if (!adminPasswordMatches(String(body?.password || ""))) {
    setResponseStatus(event, 401);
    return { ok: false, error: "Credencial inválida" };
  }
  setCookie(event, ADMIN_COOKIE, createAdminSession(), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NEXUS_COOKIE_SECURE === "true",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return { ok: true };
});

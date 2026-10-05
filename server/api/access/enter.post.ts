import { defineEventHandler, readBody, setCookie, setResponseStatus } from "h3";
import { getSql } from "../../../src/lib/db";
import { ACCESS_SESSION_COOKIE, signAccessSession, accessTokenLooksValid, tokenHash } from "../../../src/lib/access.server";

export default defineEventHandler(async (event) => {
  const body = await readBody<{ token?: string }>(event);
  const token = String(body?.token || "").trim();
  if (!token || !accessTokenLooksValid(token)) {
    setResponseStatus(event, 401);
    return { access: false, error: "La llave no tiene un formato válido." };
  }
  const [orderId] = token.split(".");
  const sessionToken = signAccessSession(orderId!);
  const sql = await getSql();
  const rows = await sql.query<{ email: string }>(
    `update nexus_orders
       set status = 'paid',
           access_session_hash = $3,
           updated_at = now()
     where id = $1 and access_token_hash = $2
       and (active_until is null or active_until > now())
     returning email`,
    [orderId, tokenHash(token), tokenHash(sessionToken)],
  );
  if (!rows[0]) {
    setResponseStatus(event, 403);
    return { access: false, error: "La llave no está vigente o el pago no está confirmado." };
  }
  setCookie(event, ACCESS_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NEXUS_COOKIE_SECURE === "true",
    path: "/",
  });
  return { access: true };
});

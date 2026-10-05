import { defineEventHandler, getRequestIP, readBody, setResponseStatus } from "h3";
import { ownedSkinsWithProof } from "../../../src/lib/skins.server";
import { EMAIL_RE } from "../../../src/lib/skin-store";
import { makeLimiter } from "../../rate-limit";

// Called on every game load by buyers (cheap) and by "Restaurar compras" (brute-force target): 30 / 10 min / IP.
const limited = makeLimiter(30, 10 * 60 * 1000);

export default defineEventHandler(async (event) => {
  if (limited(getRequestIP(event, { xForwardedFor: true }) || "local")) {
    setResponseStatus(event, 429);
    return { ok: false, error: "Demasiados intentos. Espera unos minutos." };
  }
  const body = await readBody<{ email?: string; code?: string }>(event);
  const email = String(body?.email || "").trim().toLowerCase();
  const code = String(body?.code || "").trim();
  if (!EMAIL_RE.test(email) || !code) {
    setResponseStatus(event, 400);
    return { ok: false, error: "Ingresa el correo de la compra y tu código." };
  }
  try {
    const skins = await ownedSkinsWithProof(email, code);
    if (!skins) {
      setResponseStatus(event, 403);
      return { ok: false, error: "El correo y el código no coinciden." };
    }
    return { ok: true, skins };
  } catch (error) {
    console.error("[skins/owned]", error instanceof Error ? error.message : "error");
    setResponseStatus(event, 503);
    return { ok: false, error: "No pudimos validar tus compras. Intenta nuevamente." };
  }
});

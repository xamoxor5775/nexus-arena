import { defineEventHandler, getRequestIP, readBody, setResponseStatus } from "h3";
import { FlowCheckoutError } from "../../../src/lib/flow.server";
import { createSkinPayment } from "../../../src/lib/skins.server";
import { EMAIL_RE, skinProduct } from "../../../src/lib/skin-store";
import { makeLimiter } from "../../rate-limit";

const limited = makeLimiter(12, 10 * 60 * 1000);

export default defineEventHandler(async (event) => {
  if (limited(getRequestIP(event, { xForwardedFor: true }) || "local")) {
    setResponseStatus(event, 429);
    return { error: "Demasiados intentos. Espera unos minutos." };
  }
  try {
    const body = await readBody<{ product?: string; name?: string; email?: string }>(event);
    const product = String(body?.product || "").trim();
    const name = String(body?.name || "").trim().replace(/\s+/g, " ");
    const email = String(body?.email || "").trim().toLowerCase();
    if (!skinProduct(product)) {
      setResponseStatus(event, 400);
      return { error: "Ese diseño no está a la venta." };
    }
    if (name.length < 3) {
      setResponseStatus(event, 400);
      return { error: "Ingresa tu nombre completo" };
    }
    if (!EMAIL_RE.test(email)) {
      setResponseStatus(event, 400);
      return { error: "Ingresa un correo válido" };
    }
    return await createSkinPayment(product, name, email);
  } catch (error) {
    console.error("[skins/create]", error instanceof Error ? error.message : "error");
    if (error instanceof FlowCheckoutError) {
      setResponseStatus(event, error.statusCode);
      return { error: error.message };
    }
    setResponseStatus(event, 503);
    return { error: "No pudimos iniciar el pago. Intenta nuevamente." };
  }
});

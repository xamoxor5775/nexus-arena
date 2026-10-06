import { defineEventHandler, readBody, setResponseStatus } from "h3";
import { FlowCheckoutError } from "../../../src/lib/flow.server";
import { createSkinPayment } from "../../../src/lib/skins.server";
import { EMAIL_RE, flowEmailError, skinProduct } from "../../../src/lib/skin-store";
import { clientIp } from "../../client-ip";
import { makeLimiter } from "../../rate-limit";

const limited = makeLimiter(12, 10 * 60 * 1000);

export default defineEventHandler(async (event) => {
  if (limited(clientIp(event))) {
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
    // Before creating the order row or calling Flow: Flow rejects '+' (error 1620) and would leave a 'failed' row.
    const flowError = flowEmailError(email);
    if (flowError) {
      setResponseStatus(event, 400);
      return { error: flowError };
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

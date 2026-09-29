import { defineEventHandler, readBody, setResponseStatus } from "h3";
import { createFlowPayment } from "../../../src/lib/flow.server";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<{ name?: string; email?: string }>(event);
    const name = String(body?.name || "").trim().replace(/\s+/g, " ");
    const email = String(body?.email || "").trim().toLowerCase();
    if (name.length < 3) {
      setResponseStatus(event, 400);
      return { error: "Ingresa tu nombre completo" };
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setResponseStatus(event, 400);
      return { error: "Ingresa un correo válido" };
    }
    return await createFlowPayment(name, email);
  } catch (error) {
    console.error("[flow/create]", error);
    void import("../../../src/lib/debug-spool.server").then((mod) => mod.spoolServer("flow/create", error)).catch(() => undefined);
    setResponseStatus(event, 503);
    const detail = error instanceof Error ? error.message : "";
    if (/email/i.test(detail) && /not valid/i.test(detail)) {
      return { error: "Flow rechazó el correo. Revisa que esté bien escrito, por ejemplo nombre@gmail.com." };
    }
    return { error: "No pudimos iniciar el pago. Intenta nuevamente." };
  }
});

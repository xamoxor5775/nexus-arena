import { defineEventHandler, readBody, setResponseStatus } from "h3";
import { createFlowPayment, FlowCheckoutError } from "../../../src/lib/flow.server";

export default defineEventHandler(async (event) => {
  // Arena access is free now: no new $1.000 access orders (stale pages get a clear answer instead of a charge).
  // Existing paid keys keep working (claim/enter/recover/confirmation untouched). NEXUS_SELL_ACCESS=true re-enables.
  if (process.env.NEXUS_SELL_ACCESS !== "true") {
    setResponseStatus(event, 410);
    return { error: "Nexus Arena ahora es gratis: vuelve al inicio y pulsa JUGAR GRATIS." };
  }
  try {
    const body = await readBody<{ name?: string; email?: string }>(event);
    const name = String(body?.name || "").trim().replace(/\s+/g, " ");
    const email = String(body?.email || "").trim().toLowerCase();
    if (name.length < 3) {
      setResponseStatus(event, 400);
      return { error: "Ingresa tu nombre completo" };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setResponseStatus(event, 400);
      return { error: "Ingresa un correo válido" };
    }
    return await createFlowPayment(name, email);
  } catch (error) {
    console.error("[flow/create]", error instanceof Error ? error.message : "error");
    void import("../../../src/lib/debug-spool.server").then((mod) => mod.spoolServer("flow/create", error)).catch(() => undefined);
    if (error instanceof FlowCheckoutError) {
      setResponseStatus(event, error.statusCode);
      return { error: error.message };
    }
    setResponseStatus(event, 503);
    return { error: "No pudimos iniciar el pago. Intenta nuevamente." };
  }
});

import { defineEventHandler, getQuery, setResponseStatus } from "h3";
import { claimSkinOrder } from "../../../src/lib/skins.server";

export default defineEventHandler(async (event) => {
  const order = String(getQuery(event).order || "").trim();
  if (!order) {
    setResponseStatus(event, 400);
    return { paid: false, error: "Falta la orden" };
  }
  try {
    const claim = await claimSkinOrder(order);
    if (!claim.paid) {
      setResponseStatus(event, 402);
      return { paid: false, pending: true, error: "El pago todavía no está confirmado. Recarga en unos segundos." };
    }
    return claim;
  } catch (error) {
    console.error("[skins/claim]", error instanceof Error ? error.message : "error");
    setResponseStatus(event, 503);
    return { paid: false, error: "No pudimos validar el pago. Intenta nuevamente." };
  }
});

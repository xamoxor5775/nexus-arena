import { defineEventHandler, getQuery, setResponseStatus } from "h3";
import { claimPaidOrder } from "../../../src/lib/flow.server";

export default defineEventHandler(async (event) => {
  const flowOrder = String(getQuery(event).flow_order || "").trim();
  if (!flowOrder) {
    setResponseStatus(event, 400);
    return { access: false, error: "Falta la orden de Flow" };
  }
  const token = await claimPaidOrder(flowOrder);
  if (!token) {
    setResponseStatus(event, 402);
    return { access: false, pending: true, error: "El pago todavía no está confirmado" };
  }
  return { access: true, token };
});

import { defineEventHandler, getQuery, readBody, sendRedirect, setResponseStatus } from "h3";
import { confirmFlowPayment } from "../../../src/lib/flow.server";

export default defineEventHandler(async (event) => {
  const orderId = String(getQuery(event).order || "").trim();
  const body = await readBody<{ token?: string }>(event);
  const queryToken = String(getQuery(event).token || "").trim();
  const token = String(body?.token || queryToken).trim();
  if (!orderId || !token) {
    setResponseStatus(event, 400);
    return { ok: false, error: "Faltan datos del pago" };
  }
  try {
    const paid = await confirmFlowPayment(token);
    return sendRedirect(
      event,
      `${process.env.NEXUS_PUBLIC_URL || "https://nexusarena.cl"}/gracias?payment=${paid ? "paid" : "pending"}&flow_order=${encodeURIComponent(orderId)}`,
      303,
    );
  } catch (error) {
    console.error("[flow/return]", error);
    setResponseStatus(event, 502);
    return { ok: false };
  }
});

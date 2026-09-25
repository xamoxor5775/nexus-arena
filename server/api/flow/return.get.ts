import { defineEventHandler, getQuery, sendRedirect, setResponseStatus } from "h3";
import { confirmFlowPayment } from "../../../src/lib/flow.server";

export default defineEventHandler(async (event) => {
  const orderId = String(getQuery(event).order || "").trim();
  const token = String(getQuery(event).token || "").trim();
  const base = process.env.NEXUS_PUBLIC_URL || "https://nexusarena.cl";
  if (!orderId) {
    return sendRedirect(event, `${base}/gracias`, 303);
  }
  if (!token) {
    return sendRedirect(event, `${base}/gracias?payment=pending&flow_order=${encodeURIComponent(orderId)}`, 303);
  }
  try {
    const paid = await confirmFlowPayment(token);
    return sendRedirect(
      event,
      `${base}/gracias?payment=${paid ? "paid" : "pending"}&flow_order=${encodeURIComponent(orderId)}`,
      303,
    );
  } catch (error) {
    console.error("[flow/return]", error);
    setResponseStatus(event, 502);
    return { ok: false };
  }
});

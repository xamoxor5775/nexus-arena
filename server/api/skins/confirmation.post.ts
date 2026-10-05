import { defineEventHandler, getQuery, readRawBody, setResponseStatus } from "h3";
import { FlowCheckoutError, redact } from "../../../src/lib/flow.server";
import { parseFlowCallback } from "../../../src/lib/flow-contract";
import { confirmSkinPayment } from "../../../src/lib/skins.server";

/** Flow urlConfirmation for skin orders: POST token=<flow token>. Trust comes from the signed getStatus call. */
export default defineEventHandler(async (event) => {
  const raw = (await readRawBody(event, "utf8")) || "";
  const parsed = parseFlowCallback({ query: getQuery(event) as Record<string, unknown>, raw });
  if (!parsed.token) {
    setResponseStatus(event, 400);
    return { ok: false };
  }
  try {
    const result = await confirmSkinPayment(parsed.token, parsed.orderId);
    return { ok: result.paid };
  } catch (error) {
    console.error("[skins/confirmation]", redact(error instanceof Error ? error.message : "error"));
    if (error instanceof FlowCheckoutError && error.statusCode < 500) return { ok: false };
    setResponseStatus(event, 503);
    return { ok: false };
  }
});

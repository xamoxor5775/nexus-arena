import { defineEventHandler, getQuery, readRawBody, setResponseStatus } from "h3";
import { confirmFlowPayment, FlowCheckoutError } from "../../../src/lib/flow.server";
import { parseFlowCallback } from "../../../src/lib/flow-contract";

function redact(value: string): string {
  return value.replace(/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/gi, "[email]");
}

export default defineEventHandler(async (event) => {
  const raw = (await readRawBody(event, "utf8")) || "";
  const parsed = parseFlowCallback({ query: getQuery(event) as Record<string, unknown>, raw });
  if (!parsed.token) {
    setResponseStatus(event, 400);
    return { ok: false };
  }
  try {
    const result = await confirmFlowPayment(parsed.token, parsed.orderId);
    return { ok: result.paid };
  } catch (error) {
    console.error("[flow/confirmation]", redact(error instanceof Error ? error.message : "error"));
    if (error instanceof FlowCheckoutError && error.statusCode < 500) return { ok: false };
    setResponseStatus(event, 503);
    return { ok: false };
  }
});

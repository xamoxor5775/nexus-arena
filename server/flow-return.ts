import { getQuery, readRawBody, sendRedirect, type H3Event } from "h3";
import { confirmFlowPayment } from "../src/lib/flow.server";
import { parseFlowCallback } from "../src/lib/flow-contract";

function redact(value: string): string {
  return value.replace(/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/gi, "[email]");
}

/** El navegador vuelve de Flow por GET o POST. Siempre termina en /gracias. */
export async function resumeFlowReturn(event: H3Event) {
  const raw = (await readRawBody(event, "utf8")) || "";
  const parsed = parseFlowCallback({ query: getQuery(event) as Record<string, unknown>, raw });
  const base = (process.env.NEXUS_PUBLIC_URL || "https://nexusarena.cl").replace(/\/+$/, "");
  let paid = false;
  let orderId = parsed.orderId;
  if (parsed.token) {
    try {
      const result = await confirmFlowPayment(parsed.token, parsed.orderId);
      paid = result.paid;
      orderId = result.orderId || orderId;
    } catch (error) {
      console.error("[flow/return]", redact(error instanceof Error ? error.message : "error"));
    }
  }
  const target = new URL(`${base}/gracias`);
  if (orderId) target.searchParams.set("flow_order", orderId);
  target.searchParams.set("payment", paid ? "paid" : "pending");
  return sendRedirect(event, `${target.pathname}${target.search}`, 303);
}

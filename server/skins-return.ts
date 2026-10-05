import { getQuery, readRawBody, sendRedirect, type H3Event } from "h3";
import { redact } from "../src/lib/flow.server";
import { parseFlowCallback } from "../src/lib/flow-contract";
import { confirmSkinPayment } from "../src/lib/skins.server";

/** Browser back from Flow (GET or POST) after a skin purchase: always lands on /?skins_order=… */
export async function resumeSkinsReturn(event: H3Event) {
  const raw = (await readRawBody(event, "utf8")) || "";
  const parsed = parseFlowCallback({ query: getQuery(event) as Record<string, unknown>, raw });
  let paid = false;
  let orderId = parsed.orderId;
  if (parsed.token) {
    try {
      const result = await confirmSkinPayment(parsed.token, parsed.orderId);
      paid = result.paid;
      orderId = result.orderId || orderId;
    } catch (error) {
      console.error("[skins/return]", redact(error instanceof Error ? error.message : "error"));
    }
  }
  const target = new URLSearchParams();
  if (orderId) target.set("skins_order", orderId);
  target.set("payment", paid ? "paid" : "pending");
  return sendRedirect(event, `/?${target}`, 303);
}

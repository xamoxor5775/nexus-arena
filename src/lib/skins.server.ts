import { randomUUID } from "node:crypto";
import { getSql } from "./db";
import {
  FLOW_STATUS_PAID,
  FlowCheckoutError,
  emailDomainCanReceive,
  flowLocalStatus,
  flowRequest,
  openFlowCheckout,
  optionalOrderId,
  publicUrl,
  redact,
} from "./flow.server";
import { flowAmountMatches, isOrderId } from "./flow-contract";
import { skinProduct } from "./skin-store";
import { mergeOwnedSkins, restoreCodeFor, restoreCodeMatches } from "./skin-contract";

/**
 * Weapon skin purchases through Flow. Same persistence (PGlite/Postgres via getSql) and the same
 * Flow checks as the old access purchase (flow.server.ts): the payment is only trusted after a
 * signed /payment/getStatus call says status 2 (paid), the commerceOrder matches our order id and
 * the amount matches what we asked for.
 */

function restoreSecret(): string {
  const value = (process.env.NEXUS_SKINS_SECRET || process.env.NEXUS_ACCESS_SECRET || "").trim();
  if (!value) throw new Error("NEXUS_ACCESS_SECRET is required");
  return value;
}

export function skinRestoreCode(email: string): string {
  return restoreCodeFor(email, restoreSecret());
}

type SkinOrder = { id: string; email: string; amount_clp: number; status: string; flow_token: string | null; skins: string };

export async function createSkinPayment(productId: string, name: string, email: string): Promise<{ url: string; order: string }> {
  const product = skinProduct(productId);
  if (!product) throw new FlowCheckoutError("Ese diseño no está a la venta.", 400);
  if (!await emailDomainCanReceive(email)) {
    throw new FlowCheckoutError("Flow rechazó el correo. Usa uno que pueda recibir correo, por ejemplo nombre@gmail.com.", 400);
  }
  const sql = await getSql();
  const id = randomUUID();
  await sql.query(
    `insert into nexus_skin_orders (id, email, product, skins, amount_clp, status)
     values ($1, $2, $3, $4, $5, 'pending')`,
    [id, email, product.id, product.skins.join(","), product.amount],
  );
  const base = publicUrl();
  const params: Record<string, string | number> = {
    commerceOrder: id,
    subject: `Nexus Arena - ${product.name}`.slice(0, 90),
    currency: "CLP",
    amount: product.amount,
    email,
    urlConfirmation: `${base}/api/skins/confirmation`,
    urlReturn: `${base}/api/skins/return`,
    optional: JSON.stringify({ order: id, product: product.id, name: name.slice(0, 80) }),
    timeout: 1800,
  };
  const method = Number(process.env.FLOW_PAYMENT_METHOD || "9");
  if (Number.isFinite(method) && method > 0) params.paymentMethod = method;
  try {
    const payment = await openFlowCheckout(params);
    const token = String(payment.token || "");
    const url = String(payment.url || "");
    if (!token || !url) throw new FlowCheckoutError("Flow no entregó el link de pago.", 502);
    await sql.query(
      "update nexus_skin_orders set flow_token = $2, flow_order = $3, updated_at = now() where id = $1",
      [id, token, String(payment.flowOrder || "") || id],
    );
    const checkoutUrl = new URL(url);
    if (!checkoutUrl.searchParams.has("token")) checkoutUrl.searchParams.set("token", token);
    return { url: checkoutUrl.toString(), order: id };
  } catch (error) {
    await sql.query(
      "update nexus_skin_orders set status = 'failed', updated_at = now() where id = $1 and status = 'pending'",
      [id],
    ).catch(() => undefined);
    throw error;
  }
}

export type SkinConfirmResult = { paid: boolean; orderId: string | null };

/** Flow webhook / return / claim: asks Flow (signed getStatus) and marks the order paid if it really is. */
export async function confirmSkinPayment(flowToken: string, hintedOrderId = ""): Promise<SkinConfirmResult> {
  const status = await flowRequest("/payment/getStatus", { token: flowToken }, "GET");
  const sql = await getSql();
  const commerceOrder = String(status.commerceOrder || "").trim();
  const hinted = [hintedOrderId, commerceOrder, optionalOrderId(status.optional)].find((value) => isOrderId(value)) || "";
  let orders = await sql.query<SkinOrder>("select * from nexus_skin_orders where flow_token = $1 limit 1", [flowToken]);
  if (!orders[0] && hinted) {
    orders = await sql.query<SkinOrder>("select * from nexus_skin_orders where id = $1 limit 1", [hinted]);
    if (orders[0]) {
      await sql.query(
        "update nexus_skin_orders set flow_token = $2, updated_at = now() where id = $1 and (flow_token is null or flow_token = '')",
        [orders[0].id, flowToken],
      );
    }
  }
  const order = orders[0];
  if (!order) return { paid: false, orderId: null };
  if (order.status === "paid") return { paid: true, orderId: order.id };
  if (commerceOrder && commerceOrder !== order.id) return { paid: false, orderId: order.id };
  const flowStatus = Number(status.status);
  if (flowStatus !== FLOW_STATUS_PAID) {
    await sql.query(
      "update nexus_skin_orders set status = $2, updated_at = now() where id = $1 and status <> 'paid'",
      [order.id, flowLocalStatus(flowStatus)],
    );
    return { paid: false, orderId: order.id };
  }
  if (!flowAmountMatches(status, Number(order.amount_clp))) {
    console.error("[skins/confirm] amount mismatch", order.id);
    return { paid: false, orderId: order.id };
  }
  await sql.query(
    "update nexus_skin_orders set status = 'paid', paid_at = coalesce(paid_at, now()), updated_at = now() where id = $1",
    [order.id],
  );
  return { paid: true, orderId: order.id };
}

export async function ownedSkinsFor(email: string): Promise<string[]> {
  const sql = await getSql();
  const rows = await sql.query<{ skins: string }>(
    "select skins from nexus_skin_orders where lower(email) = $1 and status = 'paid'",
    [email.trim().toLowerCase()],
  );
  return mergeOwnedSkins(rows);
}

export type SkinClaim =
  | { paid: true; email: string; code: string; skins: string[]; product: string; amount: number }
  | { paid: false };

/** Return page: the buyer holds the order id (Flow sends it back) → owned skins + restore code. */
export async function claimSkinOrder(orderId: string): Promise<SkinClaim> {
  if (!isOrderId(orderId)) return { paid: false };
  const sql = await getSql();
  const rows = await sql.query<SkinOrder & { product: string }>("select * from nexus_skin_orders where id = $1 limit 1", [orderId]);
  let order = rows[0];
  if (!order) return { paid: false };
  if (order.status !== "paid" && order.flow_token) {
    try {
      await confirmSkinPayment(order.flow_token, order.id);
    } catch (error) {
      console.error("[skins/claim]", redact(error instanceof Error ? error.message : "error"));
    }
    order = (await sql.query<SkinOrder & { product: string }>("select * from nexus_skin_orders where id = $1 limit 1", [orderId]))[0]!;
  }
  if (order.status !== "paid") return { paid: false };
  const email = order.email.trim().toLowerCase();
  return { paid: true, email, code: skinRestoreCode(email), skins: await ownedSkinsFor(email), product: order.product, amount: Number(order.amount_clp) };
}

/**
 * "Restaurar compras": email + restore code (or + the id of any paid order of that email, which is the
 * "orden de comercio" in Flow's receipt e-mail). Returns the owned skins, or null if they don't match.
 */
export async function ownedSkinsWithProof(email: string, proof: string): Promise<string[] | null> {
  const clean = email.trim().toLowerCase();
  if (restoreCodeMatches(clean, proof, restoreSecret())) return ownedSkinsFor(clean);
  const order = proof.trim().toLowerCase();
  if (isOrderId(order)) {
    const sql = await getSql();
    const rows = await sql.query<{ id: string }>(
      "select id from nexus_skin_orders where id = $1 and lower(email) = $2 and status = 'paid' limit 1",
      [order, clean],
    );
    if (rows[0]) return ownedSkinsFor(clean);
  }
  return null;
}

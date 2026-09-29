import { createHmac, randomUUID } from "node:crypto";
import { getSql } from "./db";
import { signAccessToken, tokenHash } from "./access.server";

const FLOW_API = (process.env.FLOW_API_URL || "https://www.flow.cl/api").replace(/\/+$/, "");

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function sign(params: Record<string, string | number>): string {
  const raw = Object.keys(params).sort().map((key) => `${key}${params[key]}`).join("");
  return createHmac("sha256", required("FLOW_SECRET_KEY")).update(raw).digest("hex");
}

async function flowRequest(path: string, params: Record<string, string | number>, method: "POST" | "GET") {
  const body = { ...params, apiKey: required("FLOW_API_KEY") };
  const encoded = new URLSearchParams(Object.entries(body).map(([key, value]) => [key, String(value)]));
  const signature = sign(body);
  const url = `${FLOW_API}${path}`;
  const response = await fetch(method === "GET" ? `${url}?${encoded}&s=${signature}` : url, {
    method,
    headers: method === "POST" ? { "content-type": "application/x-www-form-urlencoded" } : undefined,
    body: method === "POST" ? `${encoded}&s=${signature}` : undefined,
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Flow HTTP ${response.status}: ${detail}`);
  }
  return response.json() as Promise<Record<string, unknown>>;
}

function publicUrl(): string { return required("NEXUS_PUBLIC_URL").replace(/\/+$/, ""); }

/** Flow.cl: 1 pendiente, 2 pagada, 3 rechazada, 4 anulada. */
const FLOW_STATUS_PAID = 2;

function flowPaidAmount(status: Record<string, unknown>): number {
  const data = status.paymentData;
  if (data && typeof data === "object" && "amount" in data) {
    return Number((data as { amount?: unknown }).amount);
  }
  return Number(status.amount);
}

function flowLocalStatus(flowStatus: number): string {
  if (flowStatus === 3) return "rejected";
  if (flowStatus === 4) return "cancelled";
  return "pending";
}

export async function confirmFlowPayment(flowToken: string): Promise<boolean> {
  const status = await flowRequest("/payment/getStatus", { token: flowToken }, "GET");
  const sql = await getSql();
  const orders = await sql.query<{ id: string; amount_clp: number }>(
    "select id, amount_clp from nexus_orders where flow_token = $1 limit 1",
    [flowToken],
  );
  if (!orders[0]) return false;
  const commerceOrder = String(status.commerceOrder || "");
  if (commerceOrder && commerceOrder !== orders[0].id) return false;
  const flowStatus = Number(status.status);
  if (flowStatus !== FLOW_STATUS_PAID) {
    const existing = await sql.query<{ status: string; access_token: string | null }>(
      "select status, access_token from nexus_orders where id = $1 limit 1",
      [orders[0].id],
    );
    if (existing[0]?.status === "paid" && existing[0].access_token) return true;
    await sql.query(
      `update nexus_orders set status = $2, updated_at = now()
       where id = $1 and access_token is null`,
      [orders[0].id, flowLocalStatus(flowStatus)],
    );
    return false;
  }
  const amount = flowPaidAmount(status);
  if (!Number.isFinite(amount) || amount !== Number(orders[0].amount_clp)) {
    const existing = await sql.query<{ status: string }>(
      "select status from nexus_orders where id = $1 limit 1",
      [orders[0].id],
    );
    return existing[0]?.status === "paid";
  }
  await sql.query(
    `update nexus_orders
       set status = 'paid',
           paid_at = coalesce(paid_at, now()),
           active_until = case when status <> 'paid' then now() + interval '30 days' else active_until end,
           subscription_status = 'manual_monthly',
           updated_at = now()
     where id = $1`,
    [orders[0].id],
  );
  return true;
}

export async function createFlowPayment(name: string, email: string): Promise<{ url: string; token: string; flowOrder: string }> {
  const sql = await getSql();
  const id = randomUUID();
  await sql.query(
    `insert into nexus_orders (id, email, amount_clp, status, subscription_status)
     values ($1, $2, $3, 'pending', 'pending_payment')`,
    [id, email, Number(process.env.FLOW_AMOUNT_CLP || "1000")],
  );
  const payment = await flowRequest("/payment/create", {
    commerceOrder: id,
    subject: "Nexus Arena - acceso mensual",
    currency: "CLP",
    amount: Number(process.env.FLOW_AMOUNT_CLP || "1000"),
    email,
    paymentMethod: Number(process.env.FLOW_PAYMENT_METHOD || "9"),
    urlConfirmation: `${publicUrl()}/api/flow/confirmation`,
    urlReturn: `${publicUrl()}/api/flow/return?order=${encodeURIComponent(id)}`,
    timeout: 1800,
  }, "POST");
  const token = String(payment.token || "");
  const url = String(payment.url || "");
  const flowOrder = String(payment.flowOrder || "");
  if (!token || !url) throw new Error("Flow returned an invalid payment link");
  await sql.query(
    "update nexus_orders set flow_token = $2, flow_order = $3, updated_at = now() where id = $1",
    [id, token, flowOrder || id],
  );
  const checkoutUrl = new URL(url);
  if (!checkoutUrl.searchParams.has("token")) checkoutUrl.searchParams.set("token", token);
  return { token, flowOrder: id, url: checkoutUrl.toString() };
}

export async function claimPaidOrder(flowOrder: string): Promise<string | null> {
  const sql = await getSql();
  const pending = await sql.query<{ id: string; flow_token: string | null }>(
    `select id, flow_token from nexus_orders where id = $1 limit 1`, [flowOrder],
  );
  const current = pending[0];
  if (!current?.flow_token) return null;
  const paid = await confirmFlowPayment(current.flow_token);
  if (!paid) return null;
  const orders = await sql.query<{ id: string; access_token: string | null }>(
    `select id, access_token from nexus_orders where id = $1 and status = 'paid'
      and (active_until is null or active_until > now()) limit 1`, [flowOrder],
  );
  const order = orders[0];
  if (!order) return null;
  if (order.access_token) return order.access_token;
  const accessToken = signAccessToken(order.id);
  await sql.query(
    "update nexus_orders set access_token = $2, access_token_hash = $3, updated_at = now() where id = $1 and status = 'paid' and access_token is null",
    [order.id, accessToken, tokenHash(accessToken)],
  );
  const stored = await sql.query<{ access_token: string }>(
    "select access_token from nexus_orders where id = $1 and status = 'paid' and access_token is not null limit 1",
    [order.id],
  );
  return stored[0]?.access_token || null;
}

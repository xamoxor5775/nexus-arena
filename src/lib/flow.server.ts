import { createHmac, randomUUID } from "node:crypto";
import { getSql } from "./db";
import { signAccessToken, tokenHash } from "./access.server";
import {
  describeFlowCreateFailure,
  flowAmountMatches,
  flowCallbackUrls,
  isOrderId,
} from "./flow-contract";

const FLOW_API = (process.env.FLOW_API_URL || "https://www.flow.cl/api").replace(/\/+$/, "");

export class FlowCheckoutError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly retryable = false,
    readonly dropPaymentMethod = false,
  ) {
    super(message);
  }
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function sign(params: Record<string, string | number>): string {
  const raw = Object.keys(params).sort().map((key) => `${key}${params[key]}`).join("");
  return createHmac("sha256", required("FLOW_SECRET_KEY")).update(raw).digest("hex");
}

export function redact(value: string): string {
  return value.replace(/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/gi, "[email]");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function flowRequest(path: string, params: Record<string, string | number>, method: "POST" | "GET") {
  const body = { ...params, apiKey: required("FLOW_API_KEY") };
  const encoded = new URLSearchParams(Object.entries(body).map(([key, value]) => [key, String(value)]));
  const signature = sign(body);
  const url = `${FLOW_API}${path}`;
  let lastError: FlowCheckoutError | null = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(method === "GET" ? `${url}?${encoded}&s=${signature}` : url, {
        method,
        headers: method === "POST" ? { "content-type": "application/x-www-form-urlencoded" } : undefined,
        body: method === "POST" ? `${encoded}&s=${signature}` : undefined,
        signal: AbortSignal.timeout(12_000),
      });
      if (response.ok) return response.json() as Promise<Record<string, unknown>>;
      const detail = (await response.text()).slice(0, 500);
      const failure = path === "/payment/create"
        ? describeFlowCreateFailure(response.status, detail)
        : {
            message: `Flow HTTP ${response.status}`,
            statusCode: response.status,
            retryable: response.status >= 500 || response.status === 408 || response.status === 429,
            dropPaymentMethod: false,
          };
      lastError = new FlowCheckoutError(failure.message, failure.statusCode, failure.retryable, failure.dropPaymentMethod);
      console.error("[flow]", path, response.status, redact(detail).slice(0, 180));
      if (!failure.retryable) throw lastError;
    } catch (error) {
      if (error instanceof FlowCheckoutError && !error.retryable) throw error;
      const message = error instanceof FlowCheckoutError ? error.message : "Flow no respondió. Intenta nuevamente.";
      lastError = error instanceof FlowCheckoutError
        ? error
        : new FlowCheckoutError(message, 503, true);
      console.error("[flow]", path, redact(error instanceof Error ? error.message : "network"));
    }
    if (attempt < 2) await delay(400 * attempt);
  }
  throw lastError ?? new FlowCheckoutError("Flow no respondió. Intenta nuevamente.", 503, true);
}

export function publicUrl(): string { return required("NEXUS_PUBLIC_URL").replace(/\/+$/, ""); }

/** Flow.cl: 1 pendiente, 2 pagada, 3 rechazada, 4 anulada. */
export const FLOW_STATUS_PAID = 2;

export function flowLocalStatus(flowStatus: number): string {
  if (flowStatus === 3) return "rejected";
  if (flowStatus === 4) return "cancelled";
  return "pending";
}

export function optionalOrderId(optional: unknown): string {
  if (!optional) return "";
  if (typeof optional === "string") {
    try {
      return optionalOrderId(JSON.parse(optional) as unknown);
    } catch {
      return "";
    }
  }
  if (typeof optional === "object" && "order" in optional) {
    const value = String((optional as { order?: unknown }).order || "").trim();
    return isOrderId(value) ? value : "";
  }
  return "";
}

export type FlowConfirmResult = { paid: boolean; orderId: string | null };

export async function confirmFlowPayment(flowToken: string, hintedOrderId = ""): Promise<FlowConfirmResult> {
  const status = await flowRequest("/payment/getStatus", { token: flowToken }, "GET");
  const sql = await getSql();
  const commerceOrder = String(status.commerceOrder || "").trim();
  const hinted = [hintedOrderId, commerceOrder, optionalOrderId(status.optional)].find((value) => isOrderId(value)) || "";
  let orders = await sql.query<{ id: string; amount_clp: number }>(
    "select id, amount_clp from nexus_orders where flow_token = $1 limit 1",
    [flowToken],
  );
  if (!orders[0] && hinted) {
    orders = await sql.query<{ id: string; amount_clp: number }>(
      "select id, amount_clp from nexus_orders where id = $1 limit 1",
      [hinted],
    );
    if (orders[0]) {
      await sql.query(
        "update nexus_orders set flow_token = $2, updated_at = now() where id = $1 and (flow_token is null or flow_token = '')",
        [orders[0].id, flowToken],
      );
    }
  }
  if (!orders[0]) return { paid: false, orderId: null };
  if (commerceOrder && commerceOrder !== orders[0].id) return { paid: false, orderId: orders[0].id };
  const flowStatus = Number(status.status);
  if (flowStatus !== FLOW_STATUS_PAID) {
    const existing = await sql.query<{ status: string }>(
      "select status from nexus_orders where id = $1 limit 1",
      [orders[0].id],
    );
    if (existing[0]?.status === "paid") return { paid: true, orderId: orders[0].id };
    await sql.query(
      `update nexus_orders set status = $2, updated_at = now()
       where id = $1 and status <> 'paid'`,
      [orders[0].id, flowLocalStatus(flowStatus)],
    );
    return { paid: false, orderId: orders[0].id };
  }
  if (!flowAmountMatches(status, Number(orders[0].amount_clp))) {
    const existing = await sql.query<{ status: string }>(
      "select status from nexus_orders where id = $1 limit 1",
      [orders[0].id],
    );
    return { paid: existing[0]?.status === "paid", orderId: orders[0].id };
  }
  await sql.query(
    `update nexus_orders
       set status = 'paid',
           paid_at = coalesce(paid_at, now()),
           active_until = case when status <> 'paid' then now() + interval '30 days' else coalesce(active_until, now() + interval '30 days') end,
           subscription_status = 'manual_monthly',
           updated_at = now()
     where id = $1`,
    [orders[0].id],
  );
  return { paid: true, orderId: orders[0].id };
}

export async function openFlowCheckout(params: Record<string, string | number>) {
  try {
    return await flowRequest("/payment/create", params, "POST");
  } catch (error) {
    if (error instanceof FlowCheckoutError && error.dropPaymentMethod && "paymentMethod" in params) {
      const retry = { ...params };
      delete retry.paymentMethod;
      return flowRequest("/payment/create", retry, "POST");
    }
    throw error;
  }
}

export async function emailDomainCanReceive(email: string): Promise<boolean> {
  const domain = email.split("@")[1]?.trim().toLowerCase() || "";
  if (!domain.includes(".")) return false;
  const dns = await import("node:dns/promises");
  const lookup = dns.resolveMx(domain).then(
    (rows) => rows.some((row) => row.exchange),
    (error: { code?: string }) => {
      if (error?.code === "ENODATA" || error?.code === "ENOTFOUND" || error?.code === "ENOENT") return false;
      return true;
    },
  );
  return Promise.race([lookup, delay(2000).then(() => true)]);
}

export async function createFlowPayment(name: string, email: string): Promise<{ url: string; token: string; flowOrder: string }> {
  if (!await emailDomainCanReceive(email)) {
    throw new FlowCheckoutError(
      "Flow rechazó el correo. Usa uno que pueda recibir correo, por ejemplo nombre@gmail.com.",
      400,
    );
  }
  const sql = await getSql();
  const id = randomUUID();
  const amount = Number(process.env.FLOW_AMOUNT_CLP || "1000");
  await sql.query(
    `insert into nexus_orders (id, email, amount_clp, status, subscription_status)
     values ($1, $2, $3, 'pending', 'pending_payment')`,
    [id, email, amount],
  );
  const callbacks = flowCallbackUrls(publicUrl());
  const params: Record<string, string | number> = {
    commerceOrder: id,
    subject: "Nexus Arena - acceso mensual",
    currency: "CLP",
    amount,
    email,
    urlConfirmation: callbacks.urlConfirmation,
    urlReturn: callbacks.urlReturn,
    optional: JSON.stringify({ order: id, name: name.slice(0, 80) }),
    timeout: 1800,
  };
  const method = Number(process.env.FLOW_PAYMENT_METHOD || "9");
  if (Number.isFinite(method) && method > 0) params.paymentMethod = method;
  try {
    const payment = await openFlowCheckout(params);
    const token = String(payment.token || "");
    const url = String(payment.url || "");
    const flowOrder = String(payment.flowOrder || "");
    if (!token || !url) throw new FlowCheckoutError("Flow no entregó el link de pago.", 502);
    await sql.query(
      "update nexus_orders set flow_token = $2, flow_order = $3, updated_at = now() where id = $1",
      [id, token, flowOrder || id],
    );
    const checkoutUrl = new URL(url);
    if (!checkoutUrl.searchParams.has("token")) checkoutUrl.searchParams.set("token", token);
    return { token, flowOrder: id, url: checkoutUrl.toString() };
  } catch (error) {
    await sql.query(
      `update nexus_orders set status = 'failed', subscription_status = 'create_failed', updated_at = now()
       where id = $1 and status = 'pending'`,
      [id],
    ).catch(() => undefined);
    throw error;
  }
}

async function issueAccessToken(orderId: string): Promise<string | null> {
  const sql = await getSql();
  const orders = await sql.query<{ id: string; access_token: string | null }>(
    `select id, access_token from nexus_orders where id = $1 and status = 'paid'
      and (active_until is null or active_until > now()) limit 1`,
    [orderId],
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

export async function claimPaidOrder(flowOrder: string): Promise<string | null> {
  if (!isOrderId(flowOrder)) return null;
  const sql = await getSql();
  const pending = await sql.query<{ id: string; flow_token: string | null }>(
    "select id, flow_token from nexus_orders where id = $1 limit 1",
    [flowOrder],
  );
  const current = pending[0];
  if (!current?.flow_token) return null;
  const confirmed = await confirmFlowPayment(current.flow_token, current.id);
  if (!confirmed.paid) return null;
  return issueAccessToken(confirmed.orderId || current.id);
}

export async function recoverPaidAccess(email: string): Promise<string | null> {
  const sql = await getSql();
  const rows = await sql.query<{ id: string; flow_token: string | null }>(
    `select id, flow_token from nexus_orders
      where lower(email) = $1 and status = 'paid'
        and (active_until is null or active_until > now())
      order by coalesce(paid_at, created_at) desc
      limit 1`,
    [email],
  );
  const row = rows[0];
  if (!row) return null;
  if (row.flow_token) {
    try {
      const confirmed = await confirmFlowPayment(row.flow_token, row.id);
      if (!confirmed.paid) return null;
    } catch (error) {
      console.error("[flow/recover]", redact(error instanceof Error ? error.message : "error"));
    }
  }
  return issueAccessToken(row.id);
}

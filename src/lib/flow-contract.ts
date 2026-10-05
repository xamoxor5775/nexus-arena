const ORDER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isOrderId(value: string): boolean {
  return ORDER_ID.test(value);
}

export function flowCallbackUrls(publicBase: string): { urlConfirmation: string; urlReturn: string } {
  const base = publicBase.replace(/\/+$/, "");
  return {
    urlConfirmation: `${base}/api/flow/confirmation`,
    urlReturn: `${base}/api/flow/return`,
  };
}

/** Flow a veces manda el monto como "1000" o "1000.00". */
export function amountsMatch(actual: unknown, expected: number): boolean {
  if (typeof actual === "string" && actual.trim() === "") return false;
  const value = typeof actual === "string" ? Number(actual.trim()) : Number(actual);
  return Number.isFinite(value) && Math.round(value) === Math.round(expected);
}

export function flowAmountMatches(status: { amount?: unknown; paymentData?: unknown }, expected: number): boolean {
  if (amountsMatch(status.amount, expected)) return true;
  const data = status.paymentData;
  if (data && typeof data === "object" && "amount" in data) {
    return amountsMatch((data as { amount?: unknown }).amount, expected);
  }
  return false;
}

function firstString(value: unknown): string {
  if (Array.isArray(value)) return firstString(value[0]);
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function fieldsFromRaw(raw: string): Record<string, string> {
  const text = raw.trim();
  if (!text) return {};
  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const fields: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed)) fields[key] = firstString(value);
      return fields;
    } catch {
      /* Flow también manda el cuerpo como formulario. */
    }
  }
  const fields: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(text).entries()) fields[key] = value.trim();
  return fields;
}

/** Separa order y token aunque Flow pegue `?token=` encima de una urlReturn que ya traía `?`. */
export function splitOrderAndToken(order: string, token: string): { orderId: string; token: string } {
  let orderId = order.trim();
  let nextToken = token.trim();
  const glued = orderId.match(/^([0-9a-f-]{36})(?:\?|&)token=([^&\s]+)$/i);
  if (glued) {
    orderId = glued[1];
    if (!nextToken) {
      try {
        nextToken = decodeURIComponent(glued[2]);
      } catch {
        nextToken = glued[2];
      }
    }
  }
  if (!isOrderId(orderId)) orderId = "";
  return { orderId, token: nextToken };
}

export function parseFlowCallback(input: { query?: Record<string, unknown>; raw?: string }): { token: string; orderId: string } {
  const query = input.query || {};
  const rawFields = fieldsFromRaw(input.raw || "");
  const token = firstString(query.token) || rawFields.token || "";
  const order = firstString(query.order) || rawFields.order || rawFields.commerceOrder || "";
  return splitOrderAndToken(order, token);
}

export function describeFlowCreateFailure(httpStatus: number, detail: string): {
  message: string;
  statusCode: number;
  retryable: boolean;
  dropPaymentMethod: boolean;
} {
  let flowMessage = detail;
  try {
    const parsed = JSON.parse(detail) as { message?: unknown };
    if (parsed && typeof parsed.message === "string") flowMessage = parsed.message;
  } catch {
    /* texto plano */
  }
  const retryable = httpStatus >= 500 || httpStatus === 408 || httpStatus === 429;
  const dropPaymentMethod = /payment\s*method|medio de pago|m[eé]todo de pago/i.test(flowMessage);
  if (/email/i.test(flowMessage) && /not valid|inv[aá]lid/i.test(flowMessage)) {
    return {
      message: "Flow rechazó el correo. Usa uno real, por ejemplo nombre@gmail.com.",
      statusCode: 400,
      retryable: false,
      dropPaymentMethod: false,
    };
  }
  if (dropPaymentMethod) {
    return {
      message: "Ese medio de pago no está habilitado. Elige otro en la página de Flow.",
      statusCode: 400,
      retryable: false,
      dropPaymentMethod: true,
    };
  }
  if (retryable) {
    return {
      message: "Flow no respondió. Intenta nuevamente.",
      statusCode: 503,
      retryable: true,
      dropPaymentMethod: false,
    };
  }
  return {
    message: "Flow no pudo abrir el cobro. Revisa el correo e intenta otra vez.",
    statusCode: 400,
    retryable: false,
    dropPaymentMethod: false,
  };
}

import { defineEventHandler, readBody, setResponseStatus } from "h3";
import { confirmFlowPayment } from "../../../src/lib/flow.server";

export default defineEventHandler(async (event) => {
  const body = await readBody<{ token?: string }>(event);
  const token = String(body?.token || "").trim();
  if (!token) {
    setResponseStatus(event, 400);
    return { ok: false };
  }
  try {
    return { ok: await confirmFlowPayment(token) };
  } catch (error) {
    console.error("[flow/confirmation]", error);
    setResponseStatus(event, 502);
    return { ok: false };
  }
});

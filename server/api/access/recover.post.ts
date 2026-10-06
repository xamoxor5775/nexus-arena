import { defineEventHandler, readBody, setResponseStatus } from "h3";
import { recoverPaidAccess } from "../../../src/lib/flow.server";
import { clientIp } from "../../client-ip";

const hits = new Map<string, number[]>();

function limited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((stamp) => now - stamp < 10 * 60 * 1000);
  if (recent.length >= 5) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 500) {
    for (const [key, stamps] of hits) {
      if (stamps.every((stamp) => now - stamp >= 10 * 60 * 1000)) hits.delete(key);
    }
  }
  return false;
}

export default defineEventHandler(async (event) => {
  const ip = clientIp(event);
  if (limited(ip)) {
    setResponseStatus(event, 429);
    return { access: false, error: "Demasiados intentos. Espera unos minutos." };
  }
  const body = await readBody<{ email?: string }>(event);
  const email = String(body?.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setResponseStatus(event, 400);
    return { access: false, error: "Ingresa el correo con el que pagaste." };
  }
  const token = await recoverPaidAccess(email);
  if (!token) {
    setResponseStatus(event, 404);
    return { access: false, error: "No hay un pago vigente con ese correo." };
  }
  return { access: true, token };
});

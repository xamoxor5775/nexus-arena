import { debugSpool } from "@/lib/debug-spool";
import { trackBeginCheckout } from "@/lib/google-ads";

/**
 * Browser side of the $1.000 purchase, identical to the landing's
 * `startCheckout` (same validation, same POST /api/flow/create body, same
 * Google Ads begin_checkout + redirect). Used by the end-of-demo overlay so the
 * payment flow and endpoint stay exactly the same. Resolves with an error
 * message to show, or never resolves visibly because the page navigates to Flow.
 */
export async function startFlowCheckout(rawName: string, rawEmail: string): Promise<string | null> {
  const normalizedName = rawName.trim().replace(/\s+/g, " ");
  const normalizedEmail = rawEmail.trim();
  if (normalizedName.length < 3) return "Ingresa tu nombre completo para continuar.";
  if (!normalizedEmail || !normalizedEmail.includes("@")) return "Ingresa un correo válido para recibir tu acceso.";
  try {
    const response = await fetch("/api/flow/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: normalizedName, email: normalizedEmail }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.url) throw new Error(body.error || "Checkout no disponible");
    debugSpool.info("demo.checkout", "redirigiendo a Flow");
    const checkoutUrl = String(body.url);
    trackBeginCheckout(() => window.location.assign(checkoutUrl));
    return null;
  } catch (error) {
    debugSpool.error("demo.checkout", error);
    return error instanceof Error ? error.message : "No pudimos iniciar el pago.";
  }
}

import { debugSpool } from "@/lib/debug-spool";
import { trackBeginCheckout } from "@/lib/google-ads";
import { EMAIL_RE, flowEmailError, skinProduct } from "@/lib/skin-store";

/** Starts a Flow checkout for a skin or the bundle. Resolves with an error message, or navigates to Flow. */
export async function startSkinCheckout(productId: string, rawName: string, rawEmail: string): Promise<string | null> {
  const product = skinProduct(productId);
  if (!product) return "Ese diseño no está a la venta.";
  const name = rawName.trim().replace(/\s+/g, " ");
  const email = rawEmail.trim().toLowerCase();
  if (name.length < 3) return "Ingresa tu nombre completo para continuar.";
  if (!EMAIL_RE.test(email)) return "Ingresa un correo válido: con él restauras tus diseños.";
  const flowError = flowEmailError(email);
  if (flowError) return flowError;
  try {
    const response = await fetch("/api/skins/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ product: product.id, name, email }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.url) throw new Error(body.error || "Checkout no disponible");
    debugSpool.info("skins.checkout", `redirigiendo a Flow (${product.id})`);
    const url = String(body.url);
    trackBeginCheckout(() => window.location.assign(url), { value: product.amount, id: `skin:${product.id}`, name: product.name });
    return null;
  } catch (error) {
    debugSpool.error("skins.checkout", error);
    return error instanceof Error ? error.message : "No pudimos iniciar el pago.";
  }
}

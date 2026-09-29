import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { trackEnterArena, trackPurchase } from "@/lib/google-ads";

export const Route = createFileRoute("/gracias")({
  head: () => ({
    meta: [
      { title: "Gracias por tu acceso · Nexus Arena" },
      {
        name: "description",
        content: "Pago confirmado. Tu llave de Nexus Arena vale 30 días. Guárdala y entra al Crucible.",
      },
      { name: "robots", content: "noindex,follow" },
    ],
  }),
  component: GraciasPage,
});

function GraciasPage() {
  const [status, setStatus] = useState<"wait" | "paid" | "pending" | "idle">("wait");
  const [message, setMessage] = useState("Confirmando tu pago con Flow…");
  const [token, setToken] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const flowOrder = query.get("flow_order")?.trim() || "";
    const payment = query.get("payment");
    if (!flowOrder) {
      setStatus("idle");
      setMessage("Si acabas de pagar, Flow te trae de vuelta aquí con tu llave. Si aún no compras, vuelve al inicio.");
      return;
    }
    let cancelled = false;
    setStatus("wait");
    fetch(`/api/access/claim?flow_order=${encodeURIComponent(flowOrder)}`)
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (cancelled) return;
        const next = String(body.token || "").trim();
        if (response.ok && body.access && next) {
          setToken(next);
          setStatus("paid");
          setMessage("Pago confirmado. Guarda tu llave: vale 30 días.");
          trackPurchase(flowOrder);
          return;
        }
        setStatus(payment === "paid" ? "pending" : "pending");
        setMessage(body.error || "El pago aún se está confirmando. Recarga en unos segundos.");
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("pending");
          setMessage("No pudimos validar el pago. Recarga esta página.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function copyToken() {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setMessage("No se pudo copiar. Selecciona la llave a mano.");
    }
  }

  async function enterArena() {
    if (!token || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/access/enter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ token }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "La llave no permite el acceso.");
      trackEnterArena();
      window.location.assign("/");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No pudimos validar la llave.");
      setBusy(false);
    }
  }

  return (
    <main className="thanks-shell">
      <div className="landing-grid" />
      <header className="thanks-nav">
        <a className="landing-brand" href="/">
          <span className="landing-brand-mark">
            <b>N</b>
            <i />
          </span>
          <span>NEXUS ARENA</span>
        </a>
        <Link to="/" className="thanks-back">
          Volver al inicio
        </Link>
      </header>
      <section className="thanks-card" aria-live="polite">
        <p className="landing-kicker">ACCESO AL CRUCIBLE</p>
        <h1>Gracias.</h1>
        <p className="thanks-lede">
          {status === "paid"
            ? "Tu compra de $1.000 CLP quedó registrada. Tienes 30 días de arena deathmatch en el navegador."
            : "Esta es la página de confirmación después de pagar con Flow Chile."}
        </p>
        <p className="thanks-status">{message}</p>
        {token ? (
          <div className="landing-token">
            <strong>GUARDA ESTA LLAVE DE ACCESO</strong>
            <code>{token}</code>
            <button type="button" onClick={() => void copyToken()}>
              {copied ? "COPIADA" : "COPIAR TOKEN"}
            </button>
            <button type="button" onClick={() => void enterArena()} disabled={busy}>
              {busy ? "ENTRANDO…" : "ENTRAR A LA ARENA"}
            </button>
          </div>
        ) : (
          <div className="thanks-actions">
            <a className="landing-enter" href="/">
              <i /> IR AL INICIO
            </a>
          </div>
        )}
      </section>
    </main>
  );
}

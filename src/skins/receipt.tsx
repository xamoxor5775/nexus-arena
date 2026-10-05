import { useEffect, useState } from "react";
import { trackPurchase } from "@/lib/google-ads";
import { formatClp, skinProduct } from "@/lib/skin-store";
import { setOwnedSkins } from "./skins";
import "./skins.css";

type Claim = { paid: true; email: string; code: string; skins: string[]; product: string; amount: number };

/**
 * Back from Flow after a skin purchase (`/?skins_order=<id>`): confirms the order, stores the owner
 * (email + restore code) and the owned list in this browser, fires the Google Ads purchase conversion
 * and shows the restore code once more so the buyer can save it.
 */
export function SkinsReceipt({ order, onPlay, onClose }: { order: string; onPlay: () => void; onClose: () => void }) {
  const [claim, setClaim] = useState<Claim | null>(null);
  const [message, setMessage] = useState("Confirmando tu pago con Flow…");
  const [tries, setTries] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/skins/claim?order=${encodeURIComponent(order)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (response.ok && body.paid) {
          const result = body as Claim;
          setClaim(result);
          setOwnedSkins(result.skins, { email: result.email, code: result.code });
          const product = skinProduct(result.product);
          trackPurchase(order, { value: result.amount, id: `skin:${result.product}`, name: product?.name ?? result.product });
          try {
            const url = new URL(window.location.href);
            url.searchParams.delete("skins_order");
            url.searchParams.delete("payment");
            window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
          } catch {
            /* ignore */
          }
          return;
        }
        setMessage(body.error || "El pago aún se está confirmando. Reintenta en unos segundos.");
      })
      .catch(() => !cancelled && setMessage("No pudimos validar el pago. Reintenta en unos segundos."));
    return () => {
      cancelled = true;
    };
  }, [order, tries]);

  const copy = async () => {
    if (!claim) return;
    try {
      await navigator.clipboard.writeText(`${claim.email} · ${claim.code}`);
      setCopied(true);
    } catch {
      /* ignore */
    }
  };
  const product = claim ? skinProduct(claim.product) : null;

  return (
    <div className="nxd-scrim" role="presentation">
      <div className="nxd-panel nxd-receipt" role="dialog" aria-modal="true" aria-labelledby="nxd-receipt-title" data-testid="skins-receipt">
        <p className="nxd-kicker">Arsenal · Flow</p>
        {claim ? (
          <>
            <h2 id="nxd-receipt-title">Compra confirmada</h2>
            <p className="nxd-receipt-lead">{product?.name ?? claim.product} · {formatClp(claim.amount)} CLP. Ya puedes equiparlo en <b>ARSENAL</b>.</p>
            <div className="nxd-receipt-code">
              <span>Guarda tu código para restaurar tus diseños en otro navegador:</span>
              <code data-testid="receipt-code">{claim.code}</code>
              <span className="nxd-receipt-email">Correo: {claim.email}</span>
            </div>
            <div className="nxd-receipt-actions">
              <button type="button" className="nxd-equip" onClick={() => void copy()}>{copied ? "Copiado" : "Copiar correo + código"}</button>
              <button type="button" className="nxd-buy" onClick={onPlay} data-testid="receipt-play">Jugar ahora</button>
            </div>
          </>
        ) : (
          <>
            <h2 id="nxd-receipt-title">Tu compra</h2>
            <p className="nxd-receipt-lead" role="status">{message}</p>
            <div className="nxd-receipt-actions">
              <button type="button" className="nxd-equip" onClick={() => setTries((n) => n + 1)}>Reintentar</button>
              <button type="button" className="nxd-close" onClick={onClose}>Cerrar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

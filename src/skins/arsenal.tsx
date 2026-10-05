import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { MELEE_ORDER, WEAPON_META, WEAPON_ORDER } from "@/game/constants";
import type { WeaponId } from "@/game/types";
import { PAID_SKINS, SKIN_BUNDLE_ID, SKIN_BUNDLE_PRICE_CLP, SKIN_PRICE_CLP, formatClp, skinProduct } from "@/lib/skin-store";
import {
  SKINS_CHANGED,
  forgetSkinOwner,
  isOwned,
  ownedSkinIds,
  restorePurchases,
  selectSkin,
  selectedSkin,
  skinOwner,
  skinPrice,
  skinsFor,
  type SkinDef,
} from "./skins";
import { createSkinPreview, type SkinPreview } from "./preview";
import { startSkinCheckout } from "./checkout";

const WEAPONS: WeaponId[] = [...WEAPON_ORDER, ...MELEE_ORDER];
type Mode = { kind: "browse" } | { kind: "buy"; product: string } | { kind: "restore" };

/** ARSENAL / DISEÑOS: 3D preview for everyone, equip owned skins, buy the rest with Flow, restore purchases. */
export function ArsenalPanel({ onClose }: { onClose: () => void }) {
  const [weapon, setWeapon] = useState<WeaponId>("pulse");
  const [, bump] = useState(0);
  const equipped = selectedSkin(weapon);
  const [viewing, setViewing] = useState<string>(equipped.id);
  const [mode, setMode] = useState<Mode>({ kind: "browse" });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<SkinPreview | null>(null);
  const skins = useMemo(() => skinsFor(weapon), [weapon]);
  const shown = skins.find((s) => s.id === viewing) ?? equipped;
  const owner = skinOwner();
  const ownedCount = ownedSkinIds().length;
  const allOwned = ownedCount >= PAID_SKINS.length;

  useEffect(() => {
    const onChange = () => bump((n) => n + 1);
    window.addEventListener(SKINS_CHANGED, onChange);
    return () => window.removeEventListener(SKINS_CHANGED, onChange);
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    const preview = createSkinPreview(canvasRef.current);
    previewRef.current = preview;
    return () => {
      preview.dispose();
      previewRef.current = null;
    };
  }, []);

  useEffect(() => {
    previewRef.current?.show(weapon, shown.id);
  }, [weapon, shown.id]);

  const pickWeapon = (id: WeaponId) => {
    setWeapon(id);
    setViewing(selectedSkin(id).id);
  };
  const shownPrice = skinPrice(shown);

  return (
    <div className="nxd-panel nxd-arsenal" role="dialog" aria-modal="true" aria-labelledby="nxd-arsenal-title" data-testid="arsenal">
      <header className="nxd-panel-head">
        <div>
          <p className="nxd-kicker">Arsenal</p>
          <h2 id="nxd-arsenal-title">Diseños de armas</h2>
        </div>
        <div className="nxd-head-actions">
          <button type="button" className="nxd-link" onClick={() => setMode({ kind: "restore" })} data-testid="arsenal-restore">Restaurar compras</button>
          <button type="button" className="nxd-close" onClick={onClose} aria-label="Cerrar">Cerrar · Esc</button>
        </div>
      </header>
      <div className="nxd-arsenal-body">
        <nav className="nxd-weapons" aria-label="Armas">
          {WEAPONS.map((id) => {
            const sel = selectedSkin(id);
            return (
              <button type="button" key={id} className={`nxd-weapon ${id === weapon ? "is-on" : ""}`} onClick={() => pickWeapon(id)} data-testid={`arsenal-weapon-${id}`}>
                <span className="nxd-weapon-slot">{WEAPON_META[id].slot}</span>
                <span className="nxd-weapon-name">{WEAPON_META[id].label}</span>
                <span className="nxd-weapon-skin">{sel.name}</span>
              </button>
            );
          })}
        </nav>
        <section className="nxd-stage">
          <canvas ref={canvasRef} className="nxd-preview" data-testid="arsenal-preview" />
          {!isOwned(shown) && <span className="nxd-stage-lock" data-testid="stage-lock">Vista previa · {shownPrice != null ? formatClp(shownPrice) : ""}</span>}
          <div className="nxd-stage-caption">
            <b>{WEAPON_META[weapon].label} · {shown.name}</b>
            {shown.credit ? (
              <span>Modelo: “{shown.credit.title}” de {shown.credit.author} · {shown.credit.license} · modificado</span>
            ) : (
              <span>Modelo original de Nexus Arena · gratis</span>
            )}
          </div>
        </section>
        <aside className="nxd-skins" aria-label="Diseños disponibles">
          {mode.kind === "buy" ? (
            <BuyForm product={mode.product} defaultEmail={owner?.email ?? ""} onCancel={() => setMode({ kind: "browse" })} />
          ) : mode.kind === "restore" ? (
            <RestoreForm onDone={() => setMode({ kind: "browse" })} />
          ) : (
            <>
              {skins.map((skin) => (
                <SkinCard
                  key={skin.id}
                  skin={skin}
                  viewing={skin.id === shown.id}
                  equipped={skin.id === equipped.id}
                  onView={() => setViewing(skin.id)}
                  onEquip={() => {
                    if (selectSkin(weapon, skin.id)) setViewing(skin.id);
                  }}
                  onBuy={() => {
                    setViewing(skin.id);
                    setMode({ kind: "buy", product: skin.id });
                  }}
                />
              ))}
              {!allOwned && (
                <div className="nxd-bundle" data-testid="bundle">
                  <span className="nxd-skin-name">Arsenal completo</span>
                  <span className="nxd-skin-by">Los {PAID_SKINS.length} diseños · ahorra {formatClp(PAID_SKINS.length * SKIN_PRICE_CLP - SKIN_BUNDLE_PRICE_CLP)}</span>
                  <button type="button" className="nxd-buy" onClick={() => setMode({ kind: "buy", product: SKIN_BUNDLE_ID })} data-testid="buy-bundle">
                    Comprar todo · {formatClp(SKIN_BUNDLE_PRICE_CLP)}
                  </button>
                </div>
              )}
              {owner && (
                <div className="nxd-owner" data-testid="owner">
                  <span>Compras de <b>{owner.email}</b> · {ownedCount}/{PAID_SKINS.length}</span>
                  <span>Código para restaurar: <code data-testid="owner-code">{owner.code}</code></span>
                  <button type="button" className="nxd-link" onClick={() => forgetSkinOwner()}>Olvidar en este navegador</button>
                </div>
              )}
              <p className="nxd-note">El modelo Original de cada arma es gratis. Los diseños son solo cosméticos: no cambian daño, cadencia ni alcance, y solo tú los ves en primera persona.</p>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function SkinCard({ skin, viewing, equipped, onView, onEquip, onBuy }: { skin: SkinDef; viewing: boolean; equipped: boolean; onView: () => void; onEquip: () => void; onBuy: () => void }) {
  const owned = isOwned(skin);
  const price = skinPrice(skin);
  return (
    <div className={`nxd-skin ${viewing ? "is-viewing" : ""} ${equipped ? "is-equipped" : ""} ${owned ? "" : "is-locked"}`} data-testid={`skin-${skin.id}`}>
      <button type="button" className="nxd-skin-view" onClick={onView}>
        <span className="nxd-skin-name">{skin.name}</span>
        <span className="nxd-skin-by">{skin.credit ? `por ${skin.credit.author}` : "Nexus Arena"}</span>
      </button>
      <div className="nxd-skin-foot">
        <span className={`nxd-skin-tag ${owned ? "" : "is-price"}`} data-testid={`tag-${skin.id}`}>
          {skin.stock ? "Gratis" : owned ? "Tuyo" : price != null ? `🔒 ${formatClp(price)}` : "Bloqueado"}
        </span>
        {owned ? (
          <button type="button" className="nxd-equip" disabled={equipped} onClick={onEquip} data-testid={`equip-${skin.id}`}>
            {equipped ? "Equipado" : "Equipar"}
          </button>
        ) : (
          <button type="button" className="nxd-buy" onClick={onBuy} data-testid={`buy-${skin.id}`}>
            Comprar
          </button>
        )}
      </div>
    </div>
  );
}

function BuyForm({ product, defaultEmail, onCancel }: { product: string; defaultEmail: string; onCancel: () => void }) {
  const item = skinProduct(product);
  const [name, setName] = useState("");
  const [email, setEmail] = useState(defaultEmail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!item) return null;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const message = await startSkinCheckout(item.id, name, email);
    if (message) {
      setError(message);
      setBusy(false);
    }
  };
  return (
    <form className="nxd-form" onSubmit={(event) => void submit(event)} data-testid="buy-form">
      <p className="nxd-kicker">Comprar con Flow</p>
      <strong className="nxd-form-title">{item.name}</strong>
      <span className="nxd-form-price" data-testid="buy-price">{formatClp(item.amount)} CLP · pago único</span>
      <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre completo" aria-label="Nombre completo" autoComplete="name" required disabled={busy} />
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Tu correo" aria-label="Correo" autoComplete="email" inputMode="email" required disabled={busy} />
      <button type="submit" className="nxd-buy is-wide" disabled={busy} data-testid="buy-submit">{busy ? "Abriendo Flow…" : `Pagar ${formatClp(item.amount)} con Flow`}</button>
      {error && <p className="nxd-form-error" role="status">{error}</p>}
      <p className="nxd-note">Al volver de Flow verás un código. Con tu correo + ese código restauras tus diseños en cualquier navegador.</p>
      <button type="button" className="nxd-link" onClick={onCancel} disabled={busy}>Volver</button>
    </form>
  );
}

function RestoreForm({ onDone }: { onDone: () => void }) {
  const owner = skinOwner();
  const [email, setEmail] = useState(owner?.email ?? "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const skins = await restorePurchases(email, code);
      setMessage(skins.length ? `Listo: ${skins.length} diseño${skins.length === 1 ? "" : "s"} restaurado${skins.length === 1 ? "" : "s"}.` : "Código correcto, pero ese correo no tiene diseños pagados.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No pudimos restaurar tus compras.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="nxd-form" onSubmit={(event) => void submit(event)} data-testid="restore-form">
      <p className="nxd-kicker">Restaurar compras</p>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Correo de la compra" aria-label="Correo de la compra" autoComplete="email" required disabled={busy} />
      <input type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="NX-XXXX-XXXX-XXXX" aria-label="Código de restauración" autoComplete="off" spellCheck={false} required disabled={busy} />
      <button type="submit" className="nxd-buy is-wide" disabled={busy} data-testid="restore-submit">{busy ? "Validando…" : "Restaurar"}</button>
      {message && <p className="nxd-form-msg" role="status" data-testid="restore-msg">{message}</p>}
      <p className="nxd-note">¿Perdiste el código? También sirve el número de orden de comercio del comprobante de Flow.</p>
      <button type="button" className="nxd-link" onClick={onDone} disabled={busy}>Volver</button>
    </form>
  );
}

import { WEAPON_META } from "@/game/constants";
import { creditedSkins } from "./skins";

/** CRÉDITOS: third-party 3D models (CC BY 4.0) used as optional weapon skins. */
export function CreditsPanel({ onClose }: { onClose: () => void }) {
  const items = creditedSkins();
  return (
    <div className="nxd-panel nxd-credits" role="dialog" aria-modal="true" aria-labelledby="nxd-credits-title" data-testid="credits">
      <header className="nxd-panel-head">
        <div>
          <p className="nxd-kicker">Créditos</p>
          <h2 id="nxd-credits-title">Modelos 3D de terceros</h2>
        </div>
        <button type="button" className="nxd-close" onClick={onClose} aria-label="Cerrar">Cerrar · Esc</button>
      </header>
      <p className="nxd-credits-lead">
        Los diseños opcionales del Arsenal usan estos modelos publicados en Sketchfab bajo licencia Creative Commons
        Atribución 4.0 (CC BY 4.0). Sus autores no patrocinan ni respaldan Nexus Arena.
      </p>
      <ol className="nxd-credit-list">
        {items.map((s) => (
          <li key={s.id} className="nxd-credit" data-testid={`credit-${s.id}`}>
            <div className="nxd-credit-title">
              <a href={s.credit.url} target="_blank" rel="noreferrer">“{s.credit.title}”</a>
              <span className="nxd-credit-weapon">{WEAPON_META[s.weapon].label} · {s.name}</span>
            </div>
            <div className="nxd-credit-meta">
              <span>Autor: <a href={s.credit.authorUrl} target="_blank" rel="noreferrer">{s.credit.author}</a></span>
              <span>Fuente: <a href={s.credit.url} target="_blank" rel="noreferrer">{s.credit.url.replace("https://", "")}</a></span>
              <span>Licencia: <a href={s.credit.licenseUrl} target="_blank" rel="noreferrer">{s.credit.license}</a></span>
              <span>Modificado: optimizado/escalado (texturas reducidas y comprimidas, malla comprimida, reorientado y escalado para la vista en primera persona)</span>
            </div>
          </li>
        ))}
      </ol>
      <p className="nxd-credits-foot">El texto completo de atribuciones está en <a href="/CREDITS.txt" target="_blank" rel="noreferrer">/CREDITS.txt</a>.</p>
    </div>
  );
}

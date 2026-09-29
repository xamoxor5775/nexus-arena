/** Plantilla reutilizable de controles táctiles. No está montada en landing ni menú. */
export function TouchPreview({
  caption = "Así se ven los controles en el celular",
  compact = false,
}: {
  caption?: string;
  compact?: boolean;
}) {
  return (
    <figure className={`nx-preview${compact ? " nx-preview-compact" : ""}`}>
      <div className="nx-preview-phone" aria-label="Vista previa de controles táctiles">
        <span className="nx-preview-notch" aria-hidden />
        <header className="nx-preview-top">
          <b>3/15</b>
          <span>RONDA 09:42</span>
          <div>
            <i>TIENDA</i>
            <i>PAUSA</i>
          </div>
        </header>
        <div className="nx-preview-stage" aria-hidden />
        <div className="nx-preview-mid">
          <i>ARMA</i>
          <i>RECARGA</i>
          <i>GRANADA</i>
          <i>MIRA</i>
        </div>
        <div className="nx-preview-fire">FUEGO</div>
        <footer className="nx-preview-bot">
          <div className="nx-preview-pad nx-preview-move">
            <span>MOVER</span>
          </div>
          <i className="nx-preview-jump">SALTO</i>
          <div className="nx-preview-pad nx-preview-look">
            <span>MIRAR</span>
          </div>
        </footer>
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

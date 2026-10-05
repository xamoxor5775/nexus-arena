import { Suspense, lazy, useEffect } from "react";
import { useArena } from "@/game/store";
import { refreshOwnedSkins } from "./skins";
import { openSkinsPanel, useSkinsUi } from "./ui";
import { CreditsPanel } from "./credits";
import "./skins.css";

// The 3D preview (WebGL + loaders) only loads when ARSENAL is opened.
const ArsenalPanel = lazy(() => import("./arsenal").then((m) => ({ default: m.ArsenalPanel })));

/** ARSENAL / CRÉDITOS buttons on the main menu (top centre) + their overlays. */
export function SkinsChrome() {
  const screen = useArena((s) => s.screen);
  const onMenu = screen === "menu";
  useEffect(() => {
    void refreshOwnedSkins();
  }, []);
  // Leaving the menu (match start…) closes the panels for good: the preview is disposed.
  useEffect(() => {
    if (!onMenu && useSkinsUi.getState().panel) useSkinsUi.getState().setPanel(null);
  }, [onMenu]);
  if (!onMenu) return null;
  return (
    <>
      <SkinsPanels />
      <div className="nxd-menu-top" data-testid="skins-menu-top">
        <button type="button" className="nxd-feature" onClick={() => openSkinsPanel("arsenal")} title="Diseños de armas" data-testid="open-arsenal">
          <b>Arsenal</b><span>Diseños de armas</span>
        </button>
        <button type="button" onClick={() => openSkinsPanel("credits")} title="Modelos 3D y licencias" data-testid="open-credits">
          <b>Créditos</b><span>Modelos 3D</span>
        </button>
      </div>
    </>
  );
}

function SkinsPanels() {
  const panel = useSkinsUi((s) => s.panel);
  const setPanel = useSkinsUi((s) => s.setPanel);
  useEffect(() => {
    if (!panel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setPanel(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [panel, setPanel]);
  if (!panel || useArena.getState().screen !== "menu") return null;
  const close = () => setPanel(null);
  return (
    <div className="nxd-scrim" role="presentation" onClick={close}>
      <div className="nxd-scrim-inner" onClick={(e) => e.stopPropagation()}>
        {panel === "arsenal" ? (
          <Suspense fallback={<div className="nxd-panel nxd-loading">Cargando arsenal…</div>}>
            <ArsenalPanel onClose={close} />
          </Suspense>
        ) : (
          <CreditsPanel onClose={close} />
        )}
      </div>
    </div>
  );
}

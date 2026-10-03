import { Component, useEffect, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { NexusApp } from "@/components/nexus-app";
import { useArena } from "@/game/store";
import "./.generated/src/styles.css";
import "./shell.css";

declare global {
  interface Window {
    nexusDesktop?: {
      toggleFullscreen: () => Promise<boolean>;
      quit: () => Promise<void>;
      onPause: (callback: () => void) => () => void;
    };
  }
}
function pauseGame() {
  (window as unknown as { __nexus?: { pause: () => void } }).__nexus?.pause();
}

class GameBoundary extends Component<{ children: ReactNode }, { message: string | null }> {
  state = { message: null as string | null };
  static getDerivedStateFromError(error: unknown) {
    return { message: error instanceof Error ? error.message : String(error) };
  }
  onError = (event: ErrorEvent) => this.setState({ message: event.message });
  onRejection = (event: PromiseRejectionEvent) => this.setState({ message: String(event.reason?.message ?? event.reason) });
  componentDidMount() {
    window.addEventListener("error", this.onError);
    window.addEventListener("unhandledrejection", this.onRejection);
  }
  componentWillUnmount() {
    window.removeEventListener("error", this.onError);
    window.removeEventListener("unhandledrejection", this.onRejection);
  }
  render() {
    if (!this.state.message) return this.props.children;
    return <section className="desktop-error" role="alert">
      <h1>No se pudo iniciar Nexus Arena</h1>
      <p>Revisa el controlador de video y el archivo desktop.log en el perfil del juego.</p>
      <pre>{this.state.message}</pre>
      <button onClick={() => window.location.reload()}>Reintentar</button>
      <button onClick={() => void window.nexusDesktop?.quit()}>Salir</button>
    </section>;
  }
}

function DesktopShell() {
  const screen = useArena((state) => state.screen);
  const playing = screen === "playing";
  useEffect(() => {
    const visibility = () => { if (document.hidden) pauseGame(); };
    const unsubscribe = window.nexusDesktop?.onPause(pauseGame);
    window.addEventListener("blur", pauseGame);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      unsubscribe?.();
      window.removeEventListener("blur", pauseGame);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    return () => cancelAnimationFrame(frame);
  }, [playing]);
  return <div className={`desktop-shell${playing ? " is-playing" : ""}`}>
    {!playing && <header className="desktop-toolbar">
      <span>NEXUS ARENA <small>DESKTOP</small></span>
      <div>
        <button onClick={() => void window.nexusDesktop?.toggleFullscreen()}>Pantalla completa (F11)</button>
        <button onClick={() => void window.nexusDesktop?.quit()}>Salir</button>
      </div>
    </header>}
    <div className="desktop-game"><NexusApp /></div>
  </div>;
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");
createRoot(root).render(<GameBoundary><DesktopShell /></GameBoundary>);

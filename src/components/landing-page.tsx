import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ArrowRight, Crosshair, Gamepad2, ShieldCheck, Volume2, VolumeX, Zap } from "lucide-react";
import type { ReactNode } from "react";
import { debugSpool } from "@/lib/debug-spool";
import { trackEnterArena, trackPurchase } from "@/lib/google-ads";
import { SKIN_PRICE_CLP, formatClp } from "@/lib/skin-store";

// Below-the-fold promo (soundtrack, arenas, arsenal). Its JS/CSS/images load only when
// the visitor scrolls near it, so the first paint and its bytes stay exactly as before.
const LandingPromo = lazy(() => import("./landing-promo"));
const PROMO_STOP_EVENT = "nexus-promo-stop";

/**
 * Landing. The arena is free now: JUGAR GRATIS opens the online room (guest session), the offline
 * button plays vs bots. The old paid-key entry stays reachable (?access=1 / ?flow_order=) so
 * existing keys and late Flow returns keep working; nothing here sells access anymore.
 */
export function LandingPage({ onAccessGranted, onPlayFree, onStartOffline, joining = false }: { onAccessGranted: () => void; onPlayFree: () => void; onStartOffline?: () => void; joining?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [tokenMessage, setTokenMessage] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [showTokenEntry, setShowTokenEntry] = useState(false);
  const [copied, setCopied] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const tokenInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    // No autoplay: the 4 MB theme is fetched only when the user taps the audio button.
    audio.volume = 0.28;
  }, []);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const flowOrder = query.get("flow_order");
    if (query.get("access") === "1") setShowTokenEntry(true);
    if (!flowOrder) return;
    setBusy(true);
    fetch(`/api/access/claim?flow_order=${encodeURIComponent(flowOrder)}`)
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        const token = String(body.token || "").trim();
        if (response.ok && body.access && token) {
          setAccessToken(token);
          setMessage("Pago confirmado. Guarda tu llave antes de entrar.");
          trackPurchase(flowOrder);
          return;
        }
        setAccessToken("");
        setMessage(body.error || "El pago aún está siendo confirmado. Recarga en unos segundos.");
      })
      .catch(() => setMessage("No pudimos validar el pago. Intenta nuevamente."))
      .finally(() => setBusy(false));
  }, [onAccessGranted]);

  useEffect(() => {
    if (!showTokenEntry) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowTokenEntry(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [showTokenEntry]);

  function toggleAudio() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      window.dispatchEvent(new Event(PROMO_STOP_EVENT));
      audio.play().then(() => setAudioEnabled(true)).catch(() => undefined);
    } else {
      audio.pause();
      setAudioEnabled(false);
    }
  }

  async function activateToken(token: string) {
    setBusy(true);
    setMessage("");
    setTokenMessage("VALIDANDO LLAVE…");
    try {
      const response = await fetch("/api/access/enter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ token: token.trim() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "La llave no permite el acceso.");
      setTokenMessage("LLAVE CONFIRMADA. ENTRANDO A LA ARENA…");
      trackEnterArena();
      onAccessGranted();
    } catch (error) {
      debugSpool.warn("landing.enter", error instanceof Error ? error.message : "llave rechazada");
      const detail = error instanceof Error ? error.message : "No pudimos validar la llave.";
      setTokenMessage(detail);
      setMessage(detail);
    } finally {
      setBusy(false);
    }
  }

  function readTypedToken(form?: HTMLFormElement | null) {
    const named = form?.elements.namedItem("token");
    const fromForm = named instanceof HTMLInputElement ? named.value : "";
    const fromRef = tokenInputRef.current?.value ?? "";
    return (fromForm || fromRef || tokenInput).trim();
  }

  function submitToken(event?: { preventDefault(): void; currentTarget: EventTarget | null }) {
    event?.preventDefault();
    const form =
      event?.currentTarget instanceof HTMLFormElement
        ? event.currentTarget
        : tokenInputRef.current?.form ?? null;
    const token = readTypedToken(form);
    if (!token) {
      setShowTokenEntry(true);
      setTokenMessage("Pega tu llave antes de validar.");
      return;
    }
    if (busy) return;
    setTokenInput(token);
    void activateToken(token);
  }

  function enterArena() {
    if (accessToken) {
      void activateToken(accessToken);
      return;
    }
    if (showTokenEntry) {
      submitToken();
      return;
    }
    onPlayFree();
  }

  function pauseThemeForPreview() {
    const audio = audioRef.current;
    if (audio && !audio.paused) audio.pause();
    setAudioEnabled(false);
  }

  async function copyToken() {
    try {
      await navigator.clipboard.writeText(accessToken);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setMessage("No se pudo copiar. Selecciona la llave a mano.");
    }
  }

  return (
    <main className="landing-shell">
      <div className="landing-grid" />
      <audio ref={audioRef} src="/media/acceso-al-crucible.mp3" loop preload="none" aria-label="Tema de fondo Acceso al Crucible" />
      <header className="landing-nav">
        <div className="landing-brand">
          <span className="landing-brand-mark"><b>N</b><i /></span>
          <span>NEXUS ARENA</span>
        </div>
        <div className="landing-nav-actions">
          <button type="button" className="landing-audio" onClick={toggleAudio} aria-label={audioEnabled ? "Silenciar tema de fondo" : "Activar tema de fondo"} aria-pressed={audioEnabled}>
            {audioEnabled ? <Volume2 /> : <VolumeX />}
            <span>{audioEnabled ? "AUDIO ON" : "ACTIVAR AUDIO"}</span>
          </button>
          <button type="button" className="landing-enter" onClick={enterArena} disabled={joining} aria-expanded={showTokenEntry} aria-controls="token-entry-popover" data-testid="nav-play">
            <i /> {joining ? "ENTRANDO…" : "ACCEDER A LA ARENA"}
          </button>
          {showTokenEntry && (
            <form id="token-entry-popover" className="landing-token-popover" onSubmit={submitToken} role="dialog" aria-label="Validar llave de acceso">
              <div className="landing-token-popover-head">
                <strong>INGRESA TU LLAVE</strong>
                <button type="button" aria-label="Cerrar" onClick={() => setShowTokenEntry(false)}>×</button>
              </div>
              <input ref={tokenInputRef} name="token" type="text" value={tokenInput} onChange={(event) => setTokenInput(event.target.value)} placeholder="Pega aquí tu token" aria-label="Llave de acceso" autoComplete="off" spellCheck={false} disabled={busy} autoFocus />
              {tokenMessage && <p className="landing-token-popover-message" role="status">{tokenMessage}</p>}
              <button type="submit" className="landing-token-submit" disabled={busy}>{busy ? "VALIDANDO…" : "ENTRAR"}</button>
              <p className="landing-token-popover-hint">¿Tienes una llave pagada? Pégala y pulsa ENTRAR. La arena ahora también es gratis.</p>
            </form>
          )}
          <span className="landing-status"><i /> SERVIDORES ONLINE</span>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-copy">
          <p className="landing-kicker">ACCESO AL CRUCIBLE · TEMPORADA 01</p>
          <h1>Retroceder nunca,<br /><em>rendirse jamás</em></h1>
          <p className="landing-lede">Deathmatch FPS en el navegador. Cinco armas, bots letales y una arena industrial. Gratis: entra ahora y juega online o contra bots, sin instalar nada.</p>
          <div className="landing-actions">
            <button type="button" className="landing-buy landing-play-free" onClick={onPlayFree} disabled={joining} data-testid="play-free">
              <span><strong>{joining ? "ENTRANDO…" : "JUGAR GRATIS"}</strong><small>ONLINE · TODAS LAS ARENAS · SIN REGISTRO</small></span>
              <ArrowRight />
            </button>
          </div>
          {onStartOffline && (
            <button type="button" className="landing-demo" onClick={onStartOffline} data-testid="play-offline">
              <Gamepad2 aria-hidden="true" /> JUGAR OFFLINE CONTRA BOTS
            </button>
          )}
          <p className="landing-note">Gratis para todos · sin instalar · diseños de armas opcionales desde {formatClp(SKIN_PRICE_CLP)} en el Arsenal</p>
          {message && <p className="landing-message" role="status">{message}</p>}
          {showTokenEntry && (
            <form id="token-entry" className="landing-token-entry" onSubmit={submitToken}>
              <strong>INGRESA TU LLAVE DE ACCESO</strong>
              <input name="token" type="text" value={tokenInput} onChange={(event) => setTokenInput(event.target.value)} placeholder="Pega aquí tu token" aria-label="Llave de acceso" autoComplete="off" spellCheck={false} disabled={busy} />
              <button type="submit" disabled={busy}>{busy ? "VALIDANDO…" : "ENTRAR"}</button>
            </form>
          )}
          {accessToken && (
            <div className="landing-token">
              <strong>GUARDA ESTA LLAVE DE ACCESO</strong>
              <code>{accessToken}</code>
              <button type="button" onClick={() => void copyToken()}>{copied ? "COPIADA" : "COPIAR TOKEN"}</button>
              <button type="button" onClick={() => void activateToken(accessToken)} disabled={busy}>{busy ? "VALIDANDO…" : "ENTRAR A LA ARENA"}</button>
            </div>
          )}
          <p className="landing-demo-note">Dentro de la arena puedes cambiar temas con N y M · usa los MP3 de /media.</p>
        </div>
      </section>
      <section className="landing-features">
        <Feature icon={<Crosshair />} title="Combate directo" text="Apunta con el mouse, cambia de arma y gana el límite de frags." />
        <Feature icon={<Zap />} title="Movimiento brutal" text="Pads, rocket jumps y poderes para romper el ritmo de la arena." />
        <Feature icon={<ShieldCheck />} title="Gratis para todos" text="Juega online y contra bots sin pagar. Los diseños de armas del Arsenal son opcionales." />
        <Feature icon={<Gamepad2 />} title="Sin instalación" text="Abre el navegador y entra al pozo desde escritorio o móvil." />
      </section>
      <PromoMount>
        <Suspense fallback={null}>
          <LandingPromo onBuy={onPlayFree} onStartDemo={onStartOffline} onPreviewPlay={pauseThemeForPreview} />
        </Suspense>
      </PromoMount>
      <footer className="landing-footer">NEXUS ARENA <span>THE CRUCIBLE AWAITS</span></footer>
    </main>
  );
}

/**
 * Renders its children only after the visitor starts scrolling the landing and the
 * sentinel gets within ~400px of the visible area, so nothing extra loads on first paint.
 */
function PromoMount({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || show) return;
    if (typeof IntersectionObserver === "undefined") {
      setShow(true);
      return;
    }
    const shell = el.closest(".landing-shell");
    const scroller: EventTarget = shell ?? window;
    let io: IntersectionObserver | null = null;
    const arm = () => {
      scroller.removeEventListener("scroll", arm);
      io = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShow(true);
          io?.disconnect();
        }
      }, { root: shell, rootMargin: "400px 0px" });
      io.observe(el);
    };
    scroller.addEventListener("scroll", arm, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", arm);
      io?.disconnect();
    };
  }, [show]);
  return <div ref={ref} className="landing-promo-mount">{show ? children : null}</div>;
}

function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) { return <article className="landing-feature"><div className="landing-feature-icon">{icon}</div><div><h2>{title}</h2><p>{text}</p></div></article>; }

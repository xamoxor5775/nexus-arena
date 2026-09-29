import { useEffect, useRef, useState } from "react";
import { ArrowRight, Crosshair, Gamepad2, ShieldCheck, Volume2, VolumeX, Zap } from "lucide-react";
import type { ReactNode } from "react";
import { debugSpool } from "@/lib/debug-spool";
import { trackBeginCheckout, trackEnterArena, trackPurchase } from "@/lib/google-ads";
import landingVideoCss from "./landing-video.css?url";

export function LandingPage({ onAccessGranted }: { onAccessGranted: () => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
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
    audio.volume = 0.28;
    audio.play().then(() => setAudioEnabled(true)).catch(() => undefined);
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

  async function startCheckout() {
    const normalizedName = name.trim().replace(/\s+/g, " ");
    const normalizedEmail = email.trim();
    if (normalizedName.length < 3) {
      setMessage("Ingresa tu nombre completo para continuar.");
      return;
    }
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      setMessage("Ingresa un correo válido para recibir tu acceso.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/flow/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: normalizedName, email: normalizedEmail }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.url) throw new Error(body.error || "Checkout no disponible");
      debugSpool.info("landing.checkout", "redirigiendo a Flow");
      const checkoutUrl = String(body.url);
      trackBeginCheckout(() => window.location.assign(checkoutUrl));
    } catch (error) {
      debugSpool.error("landing.checkout", error);
      setMessage(error instanceof Error ? error.message : "No pudimos iniciar el pago.");
      setBusy(false);
    }
  }

  function toggleAudio() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
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
    setShowTokenEntry(true);
    setMessage("");
    setTokenMessage("");
  }

  function focusCheckout() {
    document.getElementById("checkout-nombre")?.focus();
    document.getElementById("checkout-pendiente")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
      <audio ref={audioRef} src="/media/acceso-al-crucible.mp3" loop preload="auto" aria-label="Tema de fondo Acceso al Crucible" />
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
          <button type="button" className="landing-enter" onClick={enterArena} aria-expanded={showTokenEntry} aria-controls="token-entry-popover">
            <i /> ACCEDER A LA ARENA
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
              <p className="landing-token-popover-hint">Pega la llave y pulsa ENTRAR. Vale 30 días.</p>
            </form>
          )}
          <span className="landing-status"><i /> SERVIDORES ONLINE</span>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-copy">
          <p className="landing-kicker">ACCESO AL CRUCIBLE · TEMPORADA 01</p>
          <h1>Retroceder nunca,<br /><em>rendirse jamás</em></h1>
          <p className="landing-lede">Deathmatch FPS en el navegador. Cinco armas, bots letales y una arena industrial. Compra, guarda tu llave y entra cuando quieras durante 30 días.</p>
          <div className="landing-actions">
            <button type="button" className="landing-buy" onClick={focusCheckout}>
              <span><strong>$1.000</strong><small>ACCESO POR 30 DÍAS · CLP</small></span>
              <ArrowRight />
            </button>
            <form
              className="landing-checkout"
              onSubmit={(event) => {
                event.preventDefault();
                void startCheckout();
              }}
            >
              <input id="checkout-nombre" type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre completo" aria-label="Nombre completo" autoComplete="name" required disabled={busy} />
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Tu correo" aria-label="Correo para comprar acceso" autoComplete="email" inputMode="email" required disabled={busy} />
              <button type="submit" disabled={busy}>{busy ? "PROCESANDO…" : "COMPRAR CON FLOW"}</button>
            </form>
          </div>
          <p id="checkout-pendiente" className="landing-note">Pago único · Flow Chile · la llave se entrega solo si el pago está confirmado</p>
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
        <LandingVideo onCta={focusCheckout} />
      </section>
      <section className="landing-features">
        <Feature icon={<Crosshair />} title="Combate directo" text="Apunta con el mouse, cambia de arma y gana el límite de frags." />
        <Feature icon={<Zap />} title="Movimiento brutal" text="Pads, rocket jumps y poderes para romper el ritmo de la arena." />
        <Feature icon={<ShieldCheck />} title="Acceso simple" text="Compra una llave de $1.000 CLP y úsala durante 30 días." />
        <Feature icon={<Gamepad2 />} title="Sin instalación" text="Abre el navegador y entra al pozo desde escritorio o móvil." />
      </section>
      <footer className="landing-footer">NEXUS ARENA <span>THE CRUCIBLE AWAITS</span></footer>
    </main>
  );
}

function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) { return <article className="landing-feature"><div className="landing-feature-icon">{icon}</div><div><h2>{title}</h2><p>{text}</p></div></article>; }

/**
 * Gameplay preview. The source file opens with ~7.7 s of non-gameplay (a screen
 * capture of the landing page, the pause menu and the 3-2-1 countdown), so the
 * preview starts — and loops back — at the first keyframe of real movement.
 * The file itself is untouched. Playback starts only while the block is on screen
 * (IntersectionObserver) and pauses when it scrolls away.
 */
const DEMO_VIDEO_START = 7.697;

function LandingVideo({ onCta }: { onCta: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // React does not reliably reflect `muted` as an attribute; iOS needs it set before play().
    video.muted = true;
    video.defaultMuted = true;
    video.loop = false;

    const toStart = () => {
      if (video.duration > DEMO_VIDEO_START + 1 && video.currentTime < DEMO_VIDEO_START) video.currentTime = DEMO_VIDEO_START;
    };
    const restart = () => {
      video.currentTime = video.duration > DEMO_VIDEO_START + 1 ? DEMO_VIDEO_START : 0;
      void video.play().catch(() => undefined);
    };
    const play = () => {
      if (video.readyState >= 1) toStart();
      void video.play().catch(() => undefined);
    };
    video.addEventListener("loadedmetadata", toStart);
    video.addEventListener("ended", restart);

    let observer: IntersectionObserver | undefined;
    if (typeof IntersectionObserver === "function") {
      observer = new IntersectionObserver(
        ([entry]) => {
          if (entry?.isIntersecting) play();
          else video.pause();
        },
        { threshold: 0.25 },
      );
      observer.observe(video);
    } else {
      play();
    }

    return () => {
      observer?.disconnect();
      video.removeEventListener("loadedmetadata", toStart);
      video.removeEventListener("ended", restart);
    };
  }, []);

  return (
    <figure className="nx-demo">
      <link rel="stylesheet" href={landingVideoCss} precedence="default" />
      <div className="nx-demo-frame">
        <video
          ref={videoRef}
          className="nx-demo-video"
          src="/media/nexus-arena-demo.mp4"
          poster="/media/nexus-arena-demo-poster-gameplay.svg"
          width={1280}
          height={520}
          muted
          loop
          playsInline
          preload="metadata"
          disablePictureInPicture
          disableRemotePlayback
          aria-label="Vista previa en video de Nexus Arena: gameplay real en el navegador"
        />
        <span className="nx-demo-live" aria-hidden="true"><i /> GAMEPLAY REAL</span>
      </div>
      <figcaption className="nx-demo-cta">
        <span>Así se juega en tu navegador. Sin instalar nada.</span>
        <button type="button" onClick={onCta}>
          JUGAR POR $1.000 <ArrowRight aria-hidden="true" />
        </button>
      </figcaption>
    </figure>
  );
}

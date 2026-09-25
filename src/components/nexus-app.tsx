import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BookOpen, Crosshair, Pause, Play, Settings as SettingsIcon, Skull, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import type { NexusArena, RemoteSnapshot } from "@/game/engine";
import { POWER_ORDER, SHOP_META, WEAPON_META, WEAPON_ORDER } from "@/game/constants";
import { P2PRoom } from "@/lib/multiplayer";
import type { ShopItemId } from "@/game/types";
import { useArena } from "@/game/store";
import { arenaRadio } from "@/game/radio";
import { debugSpool } from "@/lib/debug-spool";

export function NexusApp({ demoSeconds, autoStart = false, onDemoEnd }: { demoSeconds?: number; autoStart?: boolean; onDemoEnd?: () => void } = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<NexusArena | null>(null);
  const roomRef = useRef<P2PRoom | null>(null);
  const knownPeersRef = useRef(new Set<string>());
  const screen = useArena((s) => s.screen);
  const settings = useArena((s) => s.settings);
  const hud = useArena((s) => s.hud);
  const isTouch = useArena((s) => s.isTouch);
  const showBoard = useArena((s) => s.showBoard);
  const [shopOpen, setShopOpen] = useState(false);
  const [demoRemaining, setDemoRemaining] = useState(demoSeconds ?? null);
  const [networkState, setNetworkState] = useState("CONECTANDO");
  const [networkPlayers, setNetworkPlayers] = useState(1);
  const [radioTick, setRadioTick] = useState(0);
  const worldRev = 25;

  useEffect(() => {
    useArena.getState().setTouch(
      window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 720,
    );
    try {
      const best = Number(localStorage.getItem("nexus-arena-best-v1") || "0");
      useArena.getState().setBest(best);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const off = arenaRadio.subscribe(() => setRadioTick((n) => n + 1));
    void arenaRadio.boot().then(() => arenaRadio.play());
    return () => {
      off();
      arenaRadio.pause();
    };
  }, []);

  useEffect(() => {
    arenaRadio.setVolume(settings.volume);
  }, [settings.volume]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let game: NexusArena | null = null;
    (async () => {
      try {
        const { NexusArena } = await import("@/game/engine");
        if (disposed || !canvasRef.current) return;
        const store = useArena.getState();
        game = new NexusArena(canvasRef.current, store.settings, {
          onHud: (h) => useArena.getState().setHud(h),
          onScreen: (s) => useArena.getState().setScreen(s),
          onLock: () => {},
        });
        gameRef.current = game;
        (window as unknown as { __nexus?: NexusArena }).__nexus = game;
        game.start();
        debugSpool.info("app", "motor iniciado");
        if (autoStart) window.setTimeout(() => game?.beginMatch(), 180);
      } catch (err) {
        debugSpool.error("app.engine", err);
      }
    })();
    return () => {
      disposed = true;
      game?.dispose();
      gameRef.current = null;
      delete (window as unknown as { __nexus?: NexusArena }).__nexus;
    };
  }, [worldRev, autoStart]);

  useEffect(() => {
    const selfId = globalThis.crypto?.randomUUID?.() ?? `peer-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const room = new P2PRoom({
      room: "nexus-arena-public-v1",
      selfId,
      name: settings.name || "Raven",
      onConnected: () => setNetworkState("ONLINE"),
      onPeersChanged: (peers) => {
        setNetworkPlayers(peers.length + 1);
        if (!peers.length) setNetworkState("ONLINE");
        for (const peer of peers) gameRef.current?.addRemotePlayer(peer.id, peer.name);
        const active = new Set(peers.map((peer) => peer.id));
        for (const peerId of knownPeersRef.current) if (!active.has(peerId)) gameRef.current?.removeRemotePlayer(peerId);
        knownPeersRef.current = active;
        if (peers.some((peer) => peer.connectionState === "connected")) setNetworkState("MULTIPLAYER");
        else if (peers.length) setNetworkState("NEGOCIANDO");
      },
      onMessage: (from, data) => {
        if (!data || typeof data !== "object" || (data as { type?: string }).type !== "snapshot") return;
        const snapshot = (data as { snapshot?: RemoteSnapshot }).snapshot;
        if (snapshot) gameRef.current?.applyRemoteSnapshot(from, snapshot);
      },
    });
    roomRef.current = room;
    void room.join();
    const snapshotTimer = window.setInterval(() => {
      const snapshot = gameRef.current?.localNetworkSnapshot();
      if (snapshot) room.send({ type: "snapshot", snapshot });
    }, 100);
    return () => {
      window.clearInterval(snapshotTimer);
      room.close();
      roomRef.current = null;
      knownPeersRef.current.clear();
      setNetworkPlayers(1);
      setNetworkState("DESCONECTADO");
    };
  }, [settings.name]);

  useEffect(() => {
    if (demoRemaining === null) return;
    const timer = window.setInterval(() => {
      setDemoRemaining((remaining) => {
        if (remaining === null || remaining <= 1) {
          window.clearInterval(timer);
          onDemoEnd?.();
          return 0;
        }
        return remaining - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [demoRemaining, onDemoEnd]);

  useEffect(() => {
    const g = gameRef.current;
    if (g) g.setSettings(settings);
  }, [settings]);

  useEffect(() => {
    const resume = () => gameRef.current?.resume();
    const menu = () => gameRef.current?.toMenu();
    const onKey = (e: KeyboardEvent) => {
      const g = gameRef.current;
      if (!g) return;
      const s = useArena.getState().screen;
      if (e.code === "Escape") {
        if (s === "playing") g.pause();
        else if (s === "paused") g.resume();
        else if (s === "settings" || s === "help") useArena.getState().setScreen("menu");
      }
      if (e.code === "Tab") {
        e.preventDefault();
        useArena.getState().setShowBoard(true);
      }
      if (e.code === "KeyB" && s === "playing") setShopOpen((open) => !open);
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (!typing && (e.code === "KeyN" || e.code === "Period")) {
        e.preventDefault();
        arenaRadio.next();
      }
      if (!typing && (e.code === "KeyM" || e.code === "Comma")) {
        if (e.code === "KeyM" && e.shiftKey) return;
        e.preventDefault();
        arenaRadio.prev();
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === "Tab") useArena.getState().setShowBoard(false);
    };
    window.addEventListener("nexus-resume", resume);
    window.addEventListener("nexus-menu", menu);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("nexus-resume", resume);
      window.removeEventListener("nexus-menu", menu);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  const play = useCallback(() => {
    let tries = 0;
    const run = () => {
      const g = gameRef.current;
      if (!g) {
        if (tries++ < 40) window.setTimeout(run, 50);
        else debugSpool.error("app.play", "el motor no arrancó");
        return;
      }
      debugSpool.info("app.play", "iniciar ronda");
      g.beginMatch();
    };
    run();
  }, []);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-bg text-fg">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />
      {(screen === "playing" || screen === "paused" || screen === "ended") && (
        <div className="pointer-events-none absolute right-3 top-3 z-20 rounded-sm border border-health/60 bg-bg/80 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-health shadow-[0_0_18px_rgba(126,220,106,0.18)] sm:right-5 sm:top-5">
          <span className="mr-2 inline-block size-2 rounded-full bg-health shadow-[0_0_8px_#7edc6a]" />
          {networkState} · {networkPlayers} {networkPlayers === 1 ? "JUGADOR" : "JUGADORES"}
        </div>
      )}
      {demoRemaining !== null && <div className="pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-sm border border-ion/70 bg-bg/85 px-4 py-2 text-center"><p className="nx-kicker text-ion">DEMO DE NEXUS ARENA</p><p className="nx-num text-3xl text-fg">00:{String(Math.max(0, demoRemaining)).padStart(2, "0")}</p></div>}

      {(screen === "menu" || screen === "settings" || screen === "help") && (
        <MenuLayer onPlay={play} networkState={networkState} networkPlayers={networkPlayers} radioTick={radioTick} />
      )}

      {screen === "playing" && <HudLayer onShop={() => setShopOpen((open) => !open)} />}
      {screen === "playing" && shopOpen && <ShopLayer gameRef={gameRef} onClose={() => setShopOpen(false)} />}
      {screen === "paused" && <PauseLayer />}
      {screen === "ended" && <EndLayer onPlay={play} />}

      {screen === "playing" && !hud.locked && !isTouch && (
        <button
          type="button"
          className="nx-plate nx-ink nx-kicker absolute inset-x-0 bottom-8 z-20 mx-auto w-max px-6 py-3"
          onClick={() => gameRef.current?.requestLock()}
        >
          Click para apuntar
        </button>
      )}

      {isTouch && screen === "playing" && <TouchLayer />}
      {(showBoard || screen === "ended") && screen !== "menu" && <Scoreboard />}
      {screen !== "menu" && screen !== "settings" && screen !== "help" && <RadioDock tick={radioTick} />}
    </main>
  );
}

function MenuLayer({
  onPlay,
  networkState,
  networkPlayers,
  radioTick,
}: {
  onPlay: () => void;
  networkState: string;
  networkPlayers: number;
  radioTick: number;
}) {
  void radioTick;
  const screen = useArena((s) => s.screen);
  const setScreen = useArena((s) => s.setScreen);
  const best = useArena((s) => s.best);
  const settings = useArena((s) => s.settings);
  const radio = arenaRadio.snapshot();

  return (
    <div className="pointer-events-none absolute inset-0 z-10 p-2 sm:p-3">
      <div className="nx-steel nx-bezel nx-hull pointer-events-auto relative flex h-full flex-col overflow-hidden">
        <div className="nx-rivets absolute inset-x-0 top-0 z-20 h-3" />
        <div className="nx-rivets absolute inset-x-0 bottom-0 z-20 h-3" />
        <span className="nx-rail absolute left-1 top-1/2 z-20 hidden -translate-y-1/2 sm:block">Core</span>
        <span className="nx-rail absolute right-1 top-1/2 z-20 hidden -translate-y-1/2 sm:block">Core</span>

        <header className="relative z-10 grid gap-3 px-3 pb-1 pt-3 sm:grid-cols-[1fr_auto] sm:items-start sm:px-8 sm:pb-2 sm:pt-6">
          <div>
            <p className="nx-ink nx-kicker text-ion">ARENA DEATHMATCH</p>
            <div className="mt-1 flex items-center gap-3">
              <Crest />
              <h1 className="nx-ink nx-title">NEXUS ARENA</h1>
            </div>
            <p className="nx-copy nx-body mt-2 max-w-xl sm:mt-3">
              Combate de arena a 360. Saltos, pads, cinco armas y bots que no perdonan.{" "}
              <span className="nx-ink font-medium">El primero</span> en el límite de frags se queda el pozo.
            </p>
          </div>
          <aside className="nx-statcard w-full sm:w-72">
            <p className="nx-statcard-live">
              <i />
              {networkState} · {networkPlayers} {networkPlayers === 1 ? "jugador" : "jugadores"} en el pozo
            </p>
            <p className="nx-statcard-kicker">Núcleo de la arena</p>
            <p className="nx-statcard-lead">Lo que vas a encontrar al entrar. El límite de frags se cambia en Ajustes.</p>
            <ul className="nx-statcard-list">
              <li>
                <span>Arsenal</span>
                <b>5 armas</b>
              </li>
              <li>
                <span>Impulso</span>
                <b>10 jump pads</b>
              </li>
              <li>
                <span>Pozo</span>
                <b>88 m de arena</b>
              </li>
              <li>
                <span>Frag límite</span>
                <b>{settings.fragLimit} bajas</b>
              </li>
              <li>
                <span>Tu récord</span>
                <b>{best > 0 ? `${best} frags` : "sin marca"}</b>
              </li>
            </ul>
            <div className="nx-statcard-plan">
              <Schematic className="h-12 w-full" />
              <span>Plano del pozo</span>
            </div>
          </aside>
        </header>

        <div className="nx-hull-art relative mx-3 min-h-36 flex-1 sm:mx-10">
          <div className="nx-hull-bars nx-hull-bars-top" />
          <HullMark className="nx-hull-mark nx-hull-mark-a" />
          <HullMark className="nx-hull-mark nx-hull-mark-b" />
          <div className="nx-hull-bars nx-hull-bars-bot" />
        </div>

        <footer className="relative z-10 grid gap-2 px-3 py-2 sm:grid-cols-[minmax(0,20rem)_1fr_auto] sm:items-end sm:gap-3 sm:px-8 sm:py-4 sm:pb-6">
          <nav className="nx-menu-nav" aria-label="Comandos de la arena">
            <SteelBtn primary hint="Entra al pozo · ronda ahora" onClick={onPlay} icon={<Play className="size-4" />}>
              Jugar
            </SteelBtn>
            <SteelBtn tone="guide" hint="Controles, armas y pads" onClick={() => setScreen("help")} icon={<BookOpen className="size-4" />}>
              Cómo jugar
            </SteelBtn>
            <SteelBtn tone="gear" hint="Nombre, bots y sensibilidad" onClick={() => setScreen("settings")} icon={<SettingsIcon className="size-4" />}>
              Ajustes
            </SteelBtn>
          </nav>

          {screen === "menu" && (
            <div className="flex flex-col items-center justify-end gap-2">
              <Schematic className="h-16 w-36 text-faint" />
              <div className="flex items-center gap-1">
                <button type="button" className="nx-kicker min-h-11 min-w-11 text-ion" onClick={() => arenaRadio.prev()} aria-label="Tema anterior">
                  <SkipBack className="mx-auto size-4" />
                </button>
                <button type="button" className="nx-kicker min-h-11 min-w-11 text-ion" onClick={() => arenaRadio.toggle()} aria-label={radio.playing ? "Pausar música" : "Reproducir música"}>
                  {radio.playing ? <Volume2 className="mx-auto size-4" /> : <VolumeX className="mx-auto size-4" />}
                </button>
                <button type="button" className="nx-kicker min-h-11 min-w-11 text-ion" onClick={() => arenaRadio.next()} aria-label="Tema siguiente">
                  <SkipForward className="mx-auto size-4" />
                </button>
                <p className="max-w-32 truncate nx-stat text-copy">{radio.title}</p>
              </div>
            </div>
          )}

          {screen === "menu" && (
            <div className="nx-plate flex items-center gap-4 px-4 py-3">
              <div>
                <p className="nx-copy nx-kicker">Dotación</p>
                <p className="nx-ink nx-num text-4xl">{1 + settings.bots}</p>
                <p className="nx-copy nx-stat mt-1">1 piloto · {settings.bots} bots</p>
              </div>
              <Skull className="size-10 text-muted" strokeWidth={1.25} />
            </div>
          )}
        </footer>

        {(screen === "settings" || screen === "help") && (
          <div
            className="nx-modal-scrim"
            role="presentation"
            onClick={() => setScreen("menu")}
          >
            <div
              className="nx-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby={screen === "help" ? "nx-help-title" : "nx-settings-title"}
              onClick={(e) => e.stopPropagation()}
            >
              {screen === "settings" ? (
                <SettingsPanel onBack={() => setScreen("menu")} />
              ) : (
                <HelpPanel onBack={() => setScreen("menu")} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RadioDock({ tick }: { tick: number }) {
  void tick;
  const snap = arenaRadio.snapshot();
  return (
    <div className="pointer-events-auto absolute bottom-36 left-3 z-30 flex max-w-[min(92vw,22rem)] items-center gap-1 rounded-sm border border-ion/40 bg-bg/85 px-2 py-1.5 sm:bottom-32 sm:left-auto sm:right-4 sm:top-auto">
      <button type="button" className="nx-kicker min-h-11 min-w-11 text-ion" onClick={() => arenaRadio.prev()} aria-label="Tema anterior">
        <SkipBack className="mx-auto size-4" />
      </button>
      <button type="button" className="nx-kicker min-h-11 min-w-11 text-ion" onClick={() => arenaRadio.toggle()} aria-label={snap.playing ? "Pausar música" : "Reproducir música"}>
        {snap.playing ? <Volume2 className="mx-auto size-4" /> : <VolumeX className="mx-auto size-4" />}
      </button>
      <button type="button" className="nx-kicker min-h-11 min-w-11 text-ion" onClick={() => arenaRadio.next()} aria-label="Tema siguiente">
        <SkipForward className="mx-auto size-4" />
      </button>
      <div className="min-w-0 max-w-[42vw] pr-2 sm:max-w-xs">
        <p className="nx-kicker text-ion">RADIO {snap.index + 1}/{Math.max(1, snap.total)}</p>
        <p className="truncate text-xs text-fg">{snap.title}</p>
      </div>
    </div>
  );
}

function Crest() {
  return (
    <svg viewBox="0 0 64 28" className="hidden h-7 w-16 text-copy sm:block" aria-hidden>
      <path
        d="M4 14 C16 4 22 6 32 14 C42 6 48 4 60 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path d="M32 6 l3 6 h-6 z" fill="currentColor" />
      <circle cx="32" cy="16" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M29 16 h6 M32 13 v6" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}

function HullMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden>
      <path d="M18 58h22M80 58h22M28 40h12M80 40h12M28 76h12M80 76h12" stroke="currentColor" strokeWidth="1.2" opacity="0.35" />
      <circle cx="36" cy="40" r="2" fill="currentColor" opacity="0.4" />
      <circle cx="84" cy="76" r="2" fill="currentColor" opacity="0.4" />
      <path d="M60 18 C48 38 46 48 46 62 L36 92 h16 l8-18 8 18 h16 L74 62 C74 48 72 38 60 18z" fill="currentColor" />
      <path d="M60 44 l6 12 h-12z" fill="#1a120c" />
      <path d="M52 70 h16 v8 h-16z" fill="#1a120c" />
    </svg>
  );
}

function Schematic({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 80" className={className} fill="none" stroke="currentColor" aria-hidden>
      <rect x="8" y="8" width="104" height="64" strokeWidth="1.2" />
      <rect x="44" y="28" width="32" height="24" strokeWidth="1.2" />
      <rect x="22" y="18" width="10" height="10" strokeWidth="1" />
      <rect x="88" y="18" width="10" height="10" strokeWidth="1" />
      <rect x="22" y="52" width="10" height="10" strokeWidth="1" />
      <rect x="88" y="52" width="10" height="10" strokeWidth="1" />
      <path d="M44 72 v-8 h32 v8" strokeWidth="1" />
    </svg>
  );
}

function SteelBtn({
  children,
  onClick,
  icon,
  primary,
  hint,
  tone,
}: {
  children: ReactNode;
  onClick: () => void;
  icon?: ReactNode;
  primary?: boolean;
  hint?: string;
  tone?: "guide" | "gear";
}) {
  const kind = primary ? "play" : tone === "guide" ? "guide" : tone === "gear" ? "gear" : "idle";
  return (
    <button type="button" onClick={onClick} className={`nx-cmd nx-cmd-${kind}`}>
      {icon ? (
        <span className="nx-cmd-glyph" aria-hidden>
          {icon}
        </span>
      ) : null}
      <span className="nx-cmd-copy">
        <span className="nx-cmd-title">{children}</span>
        {hint ? <span className="nx-cmd-hint">{hint}</span> : null}
      </span>
    </button>
  );
}

function SettingsPanel({ onBack }: { onBack: () => void }) {
  const settings = useArena((s) => s.settings);
  const patch = useArena((s) => s.patchSettings);
  return (
    <>
      <header className="nx-modal-head">
        <div>
          <p className="nx-kicker text-ion">Panel de piloto</p>
          <h2 id="nx-settings-title" className="nx-ink nx-heading">
            Ajustes
          </h2>
          <p className="nx-copy nx-body mt-1">Cambia el nombre, el mouse y cuántos bots entran a la ronda.</p>
        </div>
        <button type="button" className="nx-modal-x" onClick={onBack} aria-label="Cerrar ajustes">
          ×
        </button>
      </header>
      <label className="nx-copy nx-body mt-4 block text-sm">
        Tu nombre en el marcador
        <input
          className="mt-1 h-11 w-full border border-border bg-bg px-3 font-sans text-base text-fg outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ion"
          value={settings.name}
          maxLength={14}
          onChange={(e) => patch({ name: e.target.value })}
        />
      </label>
      <div className="nx-modal-grid">
        <Slider label="Sensibilidad del mouse" value={settings.sens} min={0.3} max={2.4} step={0.05} onChange={(v) => patch({ sens: v })} />
        <Slider label="Campo de visión (FOV)" value={settings.fov} min={70} max={100} step={1} suffix="°" onChange={(v) => patch({ fov: v })} />
        <Slider label="Volumen de radio y disparos" value={settings.volume} min={0} max={1} step={0.02} pct onChange={(v) => patch({ volume: v })} />
        <Slider label="Temblor de cámara" value={settings.shake} min={0} max={1} step={0.05} pct onChange={(v) => patch({ shake: v })} />
        <Slider label="Bots rivales" value={settings.bots} min={1} max={4} step={1} onChange={(v) => patch({ bots: v })} />
        <Slider label="Frags para ganar la ronda" value={settings.fragLimit} min={5} max={30} step={1} onChange={(v) => patch({ fragLimit: v })} />
      </div>
      <div className="nx-modal-actions">
        <SteelBtn onClick={onBack}>Listo</SteelBtn>
        <SteelBtn onClick={() => debugSpool.download()}>Descargar spool</SteelBtn>
      </div>
    </>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  suffix = "",
  pct = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  suffix?: string;
  pct?: boolean;
}) {
  const shown = pct ? `${Math.round(value * 100)}%` : Number.isInteger(step) && step >= 1 ? `${value}${suffix}` : `${value.toFixed(2)}${suffix}`;
  return (
    <label className="nx-copy nx-body mt-0 block text-sm">
      <span className="flex justify-between gap-3">
        {label}
        <span className="nx-stat text-fg">{shown}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-ion"
      />
    </label>
  );
}

function KeyRow({ keys, action }: { keys: string[]; action: string }) {
  return (
    <li className="nx-keyrow">
      <span className="nx-keyrow-keys">
        {keys.map((k) => (
          <kbd key={k} className="nx-key">
            {k}
          </kbd>
        ))}
      </span>
      <span className="nx-keyrow-action">{action}</span>
    </li>
  );
}

function HelpPanel({ onBack }: { onBack: () => void }) {
  return (
    <>
      <header className="nx-modal-head">
        <div>
          <p className="nx-kicker text-ion">Manual de arena</p>
          <h2 id="nx-help-title" className="nx-ink nx-heading">
            Cómo jugar
          </h2>
          <p className="nx-copy nx-body mt-1">Deathmatch. El primero en el límite de frags se queda el pozo.</p>
        </div>
        <button type="button" className="nx-modal-x" onClick={onBack} aria-label="Cerrar cómo jugar">
          ×
        </button>
      </header>
      <div className="nx-help-cols">
        <section>
          <h3 className="nx-modal-h">Controles</h3>
          <ul className="nx-keylist">
            <KeyRow keys={["W", "A", "S", "D"]} action="Moverte" />
            <KeyRow keys={["Mouse"]} action="Apuntar" />
            <KeyRow keys={["Click izq."]} action="Disparar" />
            <KeyRow keys={["Click der."]} action="Mira / zoom" />
            <KeyRow keys={["Espacio"]} action="Saltar" />
            <KeyRow keys={["Shift"]} action="Sprint" />
            <KeyRow keys={["C"]} action="Agacharte" />
            <KeyRow keys={["1", "2", "3", "4", "5"]} action="Cambiar arma" />
            <KeyRow keys={["R"]} action="Recargar" />
            <KeyRow keys={["G"]} action="Granada de píxeles" />
            <KeyRow keys={["B"]} action="Tienda" />
            <KeyRow keys={["Tab"]} action="Marcador" />
            <KeyRow keys={["Esc"]} action="Pausa" />
            <KeyRow keys={["N", "M"]} action="Radio: siguiente / anterior" />
          </ul>
        </section>
        <section>
          <h3 className="nx-modal-h">Armas</h3>
          <ul className="nx-helplist">
            {WEAPON_ORDER.map((id) => (
              <li key={id}>
                <b>{WEAPON_META[id].slot}</b> {WEAPON_META[id].label}
              </li>
            ))}
          </ul>
          <h3 className="nx-modal-h">En el pozo</h3>
          <ul className="nx-helplist nx-helplist-copy">
            <li>Headshot hace daño crítico. Recoge salud y armadura.</li>
            <li>Los pads cian te lanzan. Torpedo a los pies = rocket jump.</li>
            <li>
              <b>VELOCIDAD</b> sprint y doble salto. <b>FASE</b> blink en el aire. <b>MEGAVATIO</b> más daño.
            </li>
            <li>Megahealth se drena. Gana quien llega primero al límite de frags.</li>
          </ul>
        </section>
      </div>
      <div className="nx-modal-actions nx-modal-actions-solo">
        <SteelBtn onClick={onBack}>Entendido</SteelBtn>
      </div>
    </>
  );
}

function HudLayer({ onShop }: { onShop: () => void }) {
  const hud = useArena((s) => s.hud);
  const healthTone = hud.health > 100 ? "text-ion" : hud.health <= 30 ? "text-hot" : "text-health";
  return (
    <div className="pointer-events-none absolute inset-0 z-10 nx-hud">
      {hud.hurt > 0 && (
        <div className="absolute inset-0 bg-accent/25" style={{ opacity: Math.min(0.55, hud.hurt * 1.4) }} />
      )}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <Crosshair
          className={`size-5 ${hud.hitmarker > 0 ? "text-health" : "text-fg"}`}
          strokeWidth={1.75}
        />
      </div>
      {hud.aiming && (
        <div className="nx-ads" aria-hidden>
          <span className="nx-ads-ring" />
        </div>
      )}

      <div className="absolute left-1/2 top-5 -translate-x-1/2 text-center sm:top-8">
        <p className="nx-kicker text-ion">RONDA {formatRoundTime(hud.roundSeconds)}</p>
        <p className="nx-stat mt-1 text-copy">{hud.score} PTS · {hud.credits} CR{hud.streak > 1 ? ` · RACHA x${hud.streak}` : ""}</p>
        <button type="button" className="pointer-events-auto mt-2 rounded-sm border border-ion/50 bg-bg/70 px-2 py-1 nx-kicker text-ion" onClick={onShop}>
          [B] TIENDA
        </button>
      </div>

      <div className="absolute left-5 top-5 sm:left-8 sm:top-8">
        <p className="nx-kicker text-copy">FRAGS</p>
        <p className="nx-num text-4xl">
          {hud.frags}
          <span className="ml-0.5 text-xl font-semibold tracking-normal text-copy">/{hud.fragLimit}</span>
        </p>
      </div>

      <div className="absolute right-5 top-5 max-w-xs space-y-1 text-right sm:right-8 sm:top-8">
        {hud.killFeed.map((k) => (
          <p key={k.id} className="nx-stat text-copy">
            <span className="font-semibold text-fg">{k.attacker}</span>
            <span className="text-muted"> {k.weapon === "world" ? "caída" : k.headshot ? "lance" : k.weapon} </span>
            <span className="font-semibold text-hot">{k.victim}</span>
          </p>
        ))}
      </div>

      <div className="absolute bottom-6 left-5 sm:bottom-10 sm:left-10">
        <p className={`nx-num text-6xl ${healthTone}`}>{hud.health}</p>
        <p className="nx-num text-2xl text-armor">{hud.armor}</p>
      </div>

      <div className="absolute bottom-6 right-5 text-right sm:bottom-10 sm:right-10">
        <p className="nx-kicker text-copy">{WEAPON_META[hud.weapon].label}</p>
        <p className="nx-num text-5xl">
          {hud.ammo}
          <span className="ml-0.5 text-xl font-semibold tracking-normal text-copy">/{hud.reserve}</span>
        </p>
        <div className="mt-2 flex justify-end gap-1">
          {WEAPON_ORDER.map((id, i) => (
            <span
              key={id}
              className={`grid size-7 place-items-center rounded-sm border font-mono text-xs ${
                hud.weapon === id
                  ? "border-fg bg-fg text-bg"
                  : hud.weapons.includes(id)
                    ? "border-border text-muted"
                    : "border-border/40 text-faint"
              }`}
            >
              {i + 1}
            </span>
          ))}
        </div>
        <p className="nx-stat mt-2 text-ion">G GRANADAS PIXEL: {hud.grenades}</p>
      </div>

      {hud.powers.length > 0 && (
        <div className="absolute bottom-24 left-1/2 flex -translate-x-1/2 gap-2 sm:bottom-28">
          {hud.powers.map((p) => (
            <div
              key={p.id}
              className="min-w-20 rounded-sm border px-2 py-1 text-center"
              style={{ borderColor: p.color, color: p.color }}
            >
              <p className="nx-kicker">{p.label}</p>
              <div className="mt-0.5 h-0.5 w-full bg-border">
                <div className="h-full" style={{ width: `${Math.round(p.t * 100)}%`, background: p.color }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {hud.pickup && (
        <p className="nx-kicker absolute left-1/2 top-1/4 -translate-x-1/2 text-2xl text-ion">
          {hud.pickup}
        </p>
      )}
      {hud.countdown !== null && (
        <p className="nx-num absolute left-1/2 top-[42%] -translate-x-1/2 text-8xl text-fg">
          {hud.countdown === 0 ? "YA" : hud.countdown}
        </p>
      )}
      {!hud.alive && (
        <p className="nx-kicker absolute left-1/2 top-[40%] -translate-x-1/2 text-4xl text-hot">
          ELIMINADO
        </p>
      )}
    </div>
  );
}

function formatRoundTime(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = Math.max(0, seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function ShopLayer({ gameRef, onClose }: { gameRef: { current: NexusArena | null }; onClose: () => void }) {
  const hud = useArena((s) => s.hud);
  const items = [...WEAPON_ORDER, ...POWER_ORDER] as ShopItemId[];
  return (
    <div className="pointer-events-auto absolute inset-0 z-30 grid place-items-center bg-bg/75 p-4">
      <div className="nx-plate w-[min(94vw,38rem)] p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="nx-ink nx-kicker text-ion">NEXUS ARMORY</p>
            <h2 className="nx-ink nx-heading mt-1 text-3xl">Compra con créditos</h2>
            <p className="nx-copy nx-stat mt-2">Saldo: <span className="text-ion">{hud.credits} CR</span> · cada ronda dura 10:00</p>
          </div>
          <button type="button" className="nx-kicker min-h-11 shrink-0 border border-ion/40 px-3 text-ion" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {items.map((id) => {
            const item = SHOP_META[id];
            const owned = item.kind === "weapon" && hud.weapons.includes(id as (typeof WEAPON_ORDER)[number]);
            const canBuy = !owned && hud.credits >= item.cost;
            return (
              <button key={id} type="button" disabled={!canBuy} onClick={() => gameRef.current?.buyShopItem(id)} className="rounded-sm border border-border bg-bg/70 p-3 text-left disabled:opacity-45">
                <span className="nx-kicker block" style={{ color: item.color }}>{item.label}</span>
                <span className="nx-stat mt-2 block text-copy">{owned ? "ADQUIRIDA" : `${item.cost} CR`}</span>
              </button>
            );
          })}
        </div>
        <p className="nx-stat mt-4 text-copy">Los créditos se guardan entre rondas. +14 CR por baja, +22 headshot, primera sangre, dobles/triples y bono de campeón. Recoger objetos da +6 CR.</p>
      </div>
    </div>
  );
}

function PauseLayer() {
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-bg/70 p-4">
      <div className="nx-plate w-[min(92vw,22rem)] p-6">
        <h2 className="nx-ink nx-heading">Pausa</h2>
        <div className="mt-5 flex flex-col gap-3">
          <SteelBtn primary onClick={() => window.dispatchEvent(new CustomEvent("nexus-resume"))}>
            Reanudar
          </SteelBtn>
          <SteelBtn onClick={() => window.dispatchEvent(new CustomEvent("nexus-menu"))}>Menú</SteelBtn>
        </div>
        <p className="nx-stat mt-4 text-copy">Esc para reanudar</p>
      </div>
    </div>
  );
}

function EndLayer({ onPlay }: { onPlay: () => void }) {
  const winner = useArena((s) => s.hud.winner);
  return (
    <div className="absolute inset-0 z-20 flex items-end justify-center bg-bg/55 p-6 sm:items-center">
      <div className="nx-plate w-[min(92vw,28rem)] p-6">
        <p className="nx-ink nx-kicker text-ion">MATCH</p>
        <h2 className="nx-ink nx-heading text-4xl">{winner}</h2>
        <p className="nx-copy nx-body mt-1">se queda The Crucible.</p>
        <div className="mt-5 flex flex-col gap-3">
          <SteelBtn primary onClick={onPlay}>
            Otra ronda
          </SteelBtn>
          <SteelBtn onClick={() => window.dispatchEvent(new CustomEvent("nexus-menu"))}>Menú</SteelBtn>
        </div>
      </div>
    </div>
  );
}

function Scoreboard() {
  const rows = useArena((s) => s.hud.scoreboard);
  return (
    <div className="pointer-events-none absolute left-1/2 top-24 z-20 w-[min(92vw,28rem)] -translate-x-1/2 rounded-lg border border-border bg-surface/90 p-4">
      <p className="nx-ink nx-kicker">MARCADOR</p>
      <ul className="mt-2 space-y-1">
        {rows.map((r) => (
          <li key={r.name} className="nx-stat flex items-baseline justify-between text-base">
            <span className={r.isPlayer ? "nx-ink font-semibold" : "nx-copy"} style={{ color: r.isPlayer ? undefined : r.color }}>
              {r.name}
            </span>
            <span className="nx-ink">
              {r.frags}
              <span className="text-copy"> / {r.deaths}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TouchLayer() {
  const moveOrigin = useRef<{ x: number; y: number; id: number } | null>(null);
  const lookOrigin = useRef<{ x: number; y: number; id: number } | null>(null);

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      <div
        className="pointer-events-auto absolute bottom-0 left-0 h-[55%] w-[48%]"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          moveOrigin.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
        }}
        onPointerMove={(e) => {
          if (!moveOrigin.current || moveOrigin.current.id !== e.pointerId) return;
          const dx = (e.clientX - moveOrigin.current.x) / 56;
          const dy = (moveOrigin.current.y - e.clientY) / 56;
          getGame()?.setTouchMove(dx, dy);
        }}
        onPointerUp={() => {
          moveOrigin.current = null;
          getGame()?.setTouchMove(0, 0);
        }}
        onPointerCancel={() => {
          moveOrigin.current = null;
          getGame()?.setTouchMove(0, 0);
        }}
      />
      <div
        className="pointer-events-auto absolute bottom-0 right-0 h-[70%] w-[52%]"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          lookOrigin.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
        }}
        onPointerMove={(e) => {
          const last = lookOrigin.current;
          if (!last || last.id !== e.pointerId) return;
          getGame()?.addTouchLook(e.clientX - last.x, e.clientY - last.y);
          lookOrigin.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
        }}
        onPointerUp={() => {
          lookOrigin.current = null;
        }}
      />
      <div className="touch-pad touch-pad-move" aria-hidden="true"><span>MOVER</span></div>
      <div className="touch-pad touch-pad-look" aria-hidden="true"><span>MIRAR</span></div>
      <div className="pointer-events-auto absolute bottom-4 right-3 grid grid-cols-3 gap-2 sm:bottom-6 sm:right-4">
        <RoundBtn label="Arma" onClick={() => getGame()?.cycleWeapon(1)} />
        <RoundBtn label="Salto" onPointerDown={() => getGame()?.setTouchJump()} />
        <RoundBtn label="Recarga" onPointerDown={() => getGame()?.setTouchReload()} />
        <RoundBtn label="Granada" onPointerDown={() => getGame()?.setTouchGrenade()} />
        <RoundBtn
          label="Zoom"
          onPointerDown={() => getGame()?.setTouchAim(true)}
          onPointerUp={() => getGame()?.setTouchAim(false)}
        />
        <RoundBtn
          label="Fuego"
          accent
          onPointerDown={() => getGame()?.setTouchFire(true)}
          onPointerUp={() => getGame()?.setTouchFire(false)}
        />
      </div>
      <button
        type="button"
        className="pointer-events-auto absolute right-4 top-4 grid size-11 place-items-center rounded-md border border-border bg-surface text-fg"
        onClick={() => getGame()?.pause()}
        aria-label="Pausa"
      >
        <Pause className="size-4" />
      </button>
    </div>
  );
}

function RoundBtn({
  label,
  accent,
  onClick,
  onPointerDown,
  onPointerUp,
}: {
  label: string;
  accent?: boolean;
  onClick?: () => void;
  onPointerDown?: () => void;
  onPointerUp?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={`nx-kicker touch-action-btn h-14 min-w-14 rounded-full border px-2 ${
        accent ? "border-accent bg-accent text-accent-fg" : "border-border bg-surface/80 text-fg"
      }`}
    >
      {label}
    </button>
  );
}

function getGame(): NexusArena | null {
  return (window as unknown as { __nexus?: NexusArena }).__nexus ?? null;
}

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { BookOpen, Crosshair, Pause, Play, Settings as SettingsIcon, Skull } from "lucide-react";
import type { NexusArena } from "@/game/engine";
import { WEAPON_META, WEAPON_ORDER } from "@/game/constants";
import { useArena } from "@/game/store";

export function NexusApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<NexusArena | null>(null);
  const screen = useArena((s) => s.screen);
  const settings = useArena((s) => s.settings);
  const hud = useArena((s) => s.hud);
  const isTouch = useArena((s) => s.isTouch);
  const showBoard = useArena((s) => s.showBoard);
  const worldRev = 23;

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
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let game: NexusArena | null = null;
    (async () => {
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
    })();
    return () => {
      disposed = true;
      game?.dispose();
      gameRef.current = null;
      delete (window as unknown as { __nexus?: NexusArena }).__nexus;
    };
  }, [worldRev]);

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
      if (e.code === "Escape") {
        const s = useArena.getState().screen;
        if (s === "playing") g.pause();
        else if (s === "paused") g.resume();
        else if (s === "settings" || s === "help") useArena.getState().setScreen("menu");
      }
      if (e.code === "Tab") {
        e.preventDefault();
        useArena.getState().setShowBoard(true);
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
    gameRef.current?.beginMatch();
  }, []);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-bg text-fg">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {(screen === "menu" || screen === "settings" || screen === "help") && (
        <MenuLayer onPlay={play} />
      )}

      {screen === "playing" && <HudLayer />}
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
    </main>
  );
}

function MenuLayer({ onPlay }: { onPlay: () => void }) {
  const screen = useArena((s) => s.screen);
  const setScreen = useArena((s) => s.setScreen);
  const best = useArena((s) => s.best);
  const settings = useArena((s) => s.settings);

  return (
    <div className="pointer-events-none absolute inset-0 z-10 p-2 sm:p-3">
      <div className="nx-steel nx-bezel pointer-events-auto relative flex h-full flex-col overflow-hidden">
        <div className="nx-rivets absolute inset-x-0 top-0 h-3" />
        <div className="nx-rivets absolute inset-x-0 bottom-0 h-3" />
        <span className="nx-rail absolute right-1 top-1/2 hidden -translate-y-1/2 sm:block">Core</span>
        <span className="nx-rail absolute left-1 top-1/2 hidden -translate-y-1/2 sm:block">Core</span>

        <header className="relative z-10 grid gap-3 px-3 pb-1 pt-3 sm:grid-cols-[1fr_auto] sm:px-8 sm:pt-6 sm:pb-2">
          <div>
            <p className="nx-ink nx-kicker text-ion">ARENA DEATHMATCH</p>
            <div className="mt-1 flex items-center gap-3">
              <Crest />
              <h1 className="nx-ink nx-title">NEXUS ARENA</h1>
            </div>
            <p className="nx-copy nx-body mt-2 hidden max-w-xl sm:mt-3 sm:block">
              Combate de arena a 360. Saltos, pads, cinco armas y bots que no perdonan.{" "}
              <span className="nx-ink font-medium">El primero</span> en el límite de frags se queda el pozo.
            </p>
          </div>
          <aside className="nx-plate hidden w-56 p-4 sm:block">
            <p className="nx-ink nx-kicker text-ion">Stats · Core Power</p>
            <ul className="nx-copy nx-stat mt-3 space-y-1.5">
              <li className="flex justify-between">
                Armas <span className="nx-ink font-semibold">5</span>
              </li>
              <li className="flex justify-between">
                Jump pads <span className="nx-ink font-semibold">10</span>
              </li>
              <li className="flex justify-between">
                Mapa <span className="nx-ink font-semibold">88 m</span>
              </li>
              <li className="flex justify-between">
                Límite <span className="nx-ink font-semibold">{settings.fragLimit}</span>
              </li>
              <li className="flex justify-between">
                Mejor <span className="nx-ink font-semibold">{best}</span>
              </li>
            </ul>
            <Schematic className="mt-3 h-16 w-full text-faint" />
          </aside>
        </header>

        <div className="nx-viewport pointer-events-none relative mx-3 min-h-40 flex-1 sm:mx-10 sm:min-h-0" />

        <footer className="relative z-10 grid gap-2 px-3 py-2 sm:grid-cols-[minmax(0,18rem)_1fr_auto] sm:items-end sm:gap-3 sm:px-8 sm:py-4 sm:pb-6">
          {screen === "menu" && (
            <nav className="grid grid-cols-3 gap-2 sm:flex sm:flex-col">
              <SteelBtn primary onClick={onPlay} icon={<Play className="size-4" />}>
                Jugar
              </SteelBtn>
              <SteelBtn onClick={() => setScreen("help")} icon={<BookOpen className="size-4" />}>
                <span className="sm:hidden">Guía</span>
                <span className="hidden sm:inline">Cómo jugar</span>
              </SteelBtn>
              <SteelBtn onClick={() => setScreen("settings")} icon={<SettingsIcon className="size-4" />}>
                Ajustes
              </SteelBtn>
            </nav>
          )}
          {screen === "settings" && <SettingsPanel onBack={() => setScreen("menu")} />}
          {screen === "help" && <HelpPanel onBack={() => setScreen("menu")} />}

          <div className="hidden justify-center sm:flex">
            <Schematic className="h-24 w-40 text-faint" />
          </div>

          <div className="nx-plate hidden items-center gap-4 px-4 py-3 sm:flex">
            <div>
              <p className="nx-copy nx-kicker">Dotación</p>
              <p className="nx-ink nx-num text-4xl">{1 + settings.bots}</p>
              <p className="nx-copy nx-stat mt-1">1 piloto · {settings.bots} bots</p>
            </div>
            <Skull className="size-10 text-muted" strokeWidth={1.25} />
          </div>
        </footer>
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
}: {
  children: ReactNode;
  onClick: () => void;
  icon?: ReactNode;
  primary?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} className={`nx-plate nx-btn ${primary ? "nx-btn-primary" : ""}`}>
      {icon}
      {children}
    </button>
  );
}

function SettingsPanel({ onBack }: { onBack: () => void }) {
  const settings = useArena((s) => s.settings);
  const patch = useArena((s) => s.patchSettings);
  return (
    <div className="nx-plate max-h-[42vh] w-full max-w-md overflow-y-auto p-4">
      <h2 className="nx-ink nx-heading">Ajustes</h2>
      <label className="nx-copy nx-body mt-3 block text-sm">
        Nombre
        <input
          className="mt-1 h-11 w-full border border-border bg-bg px-3 font-sans text-base text-fg outline-none focus:border-ion"
          value={settings.name}
          maxLength={14}
          onChange={(e) => patch({ name: e.target.value })}
        />
      </label>
      <Slider label="Sensibilidad" value={settings.sens} min={0.3} max={2.4} step={0.05} onChange={(v) => patch({ sens: v })} />
      <Slider label="FOV" value={settings.fov} min={70} max={100} step={1} onChange={(v) => patch({ fov: v })} />
      <Slider label="Volumen" value={settings.volume} min={0} max={1} step={0.02} onChange={(v) => patch({ volume: v })} />
      <Slider label="Cámara" value={settings.shake} min={0} max={1} step={0.05} onChange={(v) => patch({ shake: v })} />
      <Slider label="Bots" value={settings.bots} min={1} max={4} step={1} onChange={(v) => patch({ bots: v })} />
      <Slider label="Límite de frags" value={settings.fragLimit} min={5} max={30} step={1} onChange={(v) => patch({ fragLimit: v })} />
      <div className="mt-4">
        <SteelBtn onClick={onBack}>Volver</SteelBtn>
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="nx-copy nx-body mt-3 block text-sm">
      <span className="flex justify-between">
        {label}
        <span className="nx-stat text-fg">
          {Number.isInteger(step) && step >= 1 ? value : value.toFixed(2)}
        </span>
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

function HelpPanel({ onBack }: { onBack: () => void }) {
  return (
    <div className="nx-plate max-h-[42vh] w-full max-w-md overflow-y-auto p-4">
      <h2 className="nx-ink nx-heading">Cómo jugar</h2>
      <ul className="nx-copy nx-body mt-4 space-y-2">
        <li>
          <span className="nx-stat text-fg">WASD</span> mover ·{" "}
          <span className="nx-stat text-fg">Mouse</span> apuntar
        </li>
        <li>
          <span className="nx-stat text-fg">Click</span> disparar ·{" "}
          <span className="nx-stat text-fg">Espacio</span> saltar
        </li>
        <li>
          <span className="nx-stat text-fg">Shift</span> sprint ·{" "}
          <span className="nx-stat text-fg">C</span> agachar
        </li>
        <li>
          <span className="nx-stat text-fg">1-5</span> armas ·{" "}
          <span className="nx-stat text-fg">R</span> recargar ·{" "}
          <span className="nx-stat text-fg">Tab</span> marcador
        </li>
        <li>Pads cian te lanzan. Torpedo a los pies = rocket jump.</li>
        <li>
          Iconos flotantes: <span className="text-fg">VELOCIDAD</span> sprint + doble salto,{" "}
          <span className="text-fg">FASE</span> salto en el aire = blink,{" "}
          <span className="text-fg">MEGAVATIO</span> daño y cadena.
        </li>
        <li>Recoge salud, armadura y armas. Megahealth se drena.</li>
      </ul>
      <div className="mt-4">
        <SteelBtn onClick={onBack}>Volver</SteelBtn>
      </div>
    </div>
  );
}

function HudLayer() {
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
      <div className="pointer-events-auto absolute bottom-6 right-4 flex flex-col gap-3">
        <RoundBtn label="Arma" onClick={() => getGame()?.cycleWeapon(1)} />
        <RoundBtn label="Salto" onPointerDown={() => getGame()?.setTouchJump()} />
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
      className={`nx-kicker h-14 min-w-14 rounded-full border px-4 ${
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

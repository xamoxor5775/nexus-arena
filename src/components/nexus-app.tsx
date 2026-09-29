import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Crosshair, Pause, Play, Settings as SettingsIcon, Skull, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import type { NexusArena, RemoteSnapshot } from "@/game/engine";
import { CAREER_KEY, MELEE_ORDER, PRIZE_LABEL, SKINS, TEAM_META, TOUCH_ACTIONS, WEAPON_META, WEAPON_ORDER, XP_PER_LEVEL, levelFromXp, publicRoomId, roomOverflowIndex } from "@/game/constants";
import { PvpInbox, makeHitMessage, makeKillMessage } from "@/game/pvp";
import type { ArenaId, RoundPrize, SkinId, TouchActionId } from "@/game/types";
import { P2PRoom } from "@/lib/multiplayer";
import { useArena } from "@/game/store";
import { arenaRadio } from "@/game/radio";
import { debugSpool } from "@/lib/debug-spool";

export function NexusApp({ demoSeconds, autoStart = false, onDemoEnd }: { demoSeconds?: number; autoStart?: boolean; onDemoEnd?: () => void } = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<NexusArena | null>(null);
  const roomRef = useRef<P2PRoom | null>(null);
  const knownPeersRef = useRef(new Set<string>());
  const roomHostRef = useRef<string | null>(null);
  const arenaCycleEpochRef = useRef<number | null>(null);
  const pvpSeqRef = useRef(0);
  const playArmed = useRef(false);
  const selfIdRef = useRef("");
  if (!selfIdRef.current) {
    selfIdRef.current = globalThis.crypto?.randomUUID?.() ?? `peer-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
  const screen = useArena((s) => s.screen);
  const settings = useArena((s) => s.settings);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const hud = useArena((s) => s.hud);
  const isTouch = useArena((s) => s.isTouch);
  const showBoard = useArena((s) => s.showBoard);
  const [demoRemaining, setDemoRemaining] = useState(demoSeconds ?? null);
  const [networkState, setNetworkState] = useState("CONECTANDO");
  const [networkPlayers, setNetworkPlayers] = useState(1);
  const [roomNumber, setRoomNumber] = useState(1);
  const [radioTick, setRadioTick] = useState(0);
  const worldRev = 84;

  useEffect(() => {
    const touch = () =>
      window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
    const syncTouch = () => useArena.getState().setTouch(touch());
    syncTouch();
    window.addEventListener("resize", syncTouch);
    try {
      const best = Number(localStorage.getItem("nexus-arena-best-v1") || "0");
      useArena.getState().setBest(best);
    } catch {
      /* ignore */
    }
    return () => window.removeEventListener("resize", syncTouch);
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
          onArenaCycleStart: (epochMs) => {
            arenaCycleEpochRef.current = epochMs;
            if (roomHostRef.current === selfIdRef.current) {
              roomRef.current?.broadcast({ type: "arena-cycle", epochMs });
            }
          },
          onRemoteHit: (victimPeerId, hit) => {
            roomRef.current?.send(makeHitMessage(selfIdRef.current, victimPeerId, ++pvpSeqRef.current, hit), victimPeerId);
          },
          onLocalDeath: (death) => {
            roomRef.current?.send(makeKillMessage(selfIdRef.current, ++pvpSeqRef.current, death));
          },
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
    const selfId = selfIdRef.current;
    roomHostRef.current = null;
    arenaCycleEpochRef.current = null;
    const inbox = new PvpInbox(selfId, WEAPON_META);
    const baseRoom = publicRoomId(settings.arena, settings.mode);
    setRoomNumber(1);
    const room = new P2PRoom({
      room: baseRoom,
      selfId,
      name: settingsRef.current.name || "Piloto",
      onConnected: () => setNetworkState("ONLINE"),
      onRoomChanged: (next) => {
        // Base room full: we were moved to an overflow room (<room>-2, -3, …).
        for (const peerId of knownPeersRef.current) gameRef.current?.removeRemotePlayer(peerId);
        knownPeersRef.current = new Set();
        roomHostRef.current = null;
        setRoomNumber(roomOverflowIndex(next) || 1);
      },
      onPeersChanged: (peers) => {
        setNetworkPlayers(peers.length + 1);
        if (!peers.length) setNetworkState("ONLINE");
        for (const peer of peers) gameRef.current?.addRemotePlayer(peer.id, peer.name);
        const active = new Set(peers.map((peer) => peer.id));
        for (const peerId of knownPeersRef.current) if (!active.has(peerId)) gameRef.current?.removeRemotePlayer(peerId);
        knownPeersRef.current = active;
        const linked = peers.filter((peer) => peer.connectionState === "connected").length;
        gameRef.current?.setRemoteHumans(linked);
        if (roomHostRef.current === selfId && arenaCycleEpochRef.current !== null) {
          room.broadcast({ type: "arena-cycle", epochMs: arenaCycleEpochRef.current });
        }
        if (linked) setNetworkState("MULTIPLAYER");
        else if (peers.length) setNetworkState("NEGOCIANDO");
      },
      onRoom: (info) => {
        roomHostRef.current = info.hostId;
      },
      onMessage: (from, data, channel) => {
        if (!data || typeof data !== "object") return;
        const packet = data as { type?: string; snapshot?: RemoteSnapshot; epochMs?: number };
        if (packet.type === "hit" || packet.type === "kill") {
          if (channel !== "reliable") return;
          if (packet.type === "hit") {
            const hit = inbox.acceptHit(from, data);
            if (hit) gameRef.current?.applyNetworkHit(from, hit);
          } else {
            const kill = inbox.acceptKill(from, data);
            if (kill) gameRef.current?.applyNetworkKill(kill);
          }
          return;
        }
        if (packet.type === "arena-cycle") {
          if (from !== roomHostRef.current || !Number.isFinite(packet.epochMs)) return;
          arenaCycleEpochRef.current = packet.epochMs!;
          gameRef.current?.syncArenaCycleStart(packet.epochMs!);
          return;
        }
        if (packet.type !== "snapshot") return;
        const snapshot = packet.snapshot;
        if (snapshot) gameRef.current?.applyRemoteSnapshot(from, snapshot);
      },
    });
    roomRef.current = room;
    void room.join();
    let lastCycleSync = 0;
    const snapshotTimer = window.setInterval(() => {
      const s = useArena.getState().screen;
      if (s !== "playing" && s !== "paused") return;
      const snapshot = gameRef.current?.localNetworkSnapshot();
      if (snapshot) room.broadcast({ type: "snapshot", snapshot });
      if (
        (settings.arena === "mar" || settings.arena === "pozo" || settings.arena === "cumbre") &&
        roomHostRef.current === selfId &&
        arenaCycleEpochRef.current !== null &&
        Date.now() - lastCycleSync >= 2500
      ) {
        room.broadcast({ type: "arena-cycle", epochMs: arenaCycleEpochRef.current });
        lastCycleSync = Date.now();
      }
    }, 160);
    return () => {
      window.clearInterval(snapshotTimer);
      room.close();
      roomRef.current = null;
      knownPeersRef.current.clear();
      gameRef.current?.setRemoteHumans(0);
      setNetworkPlayers(1);
      setNetworkState("DESCONECTADO");
    };
  }, [settings.arena, settings.mode]);

  useEffect(() => {
    roomRef.current?.setDisplayName(settings.name);
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
        else if (s === "settings" || s === "help" || s === "skin") useArena.getState().setScreen("menu");
      }
      if (e.code === "Tab") {
        e.preventDefault();
        useArena.getState().setShowBoard(true);
      }
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
    if (playArmed.current) return;
    playArmed.current = true;
    window.setTimeout(() => {
      playArmed.current = false;
    }, 700);
    let tries = 0;
    const run = () => {
      const g = gameRef.current;
      if (!g) {
        if (tries++ < 40) window.setTimeout(run, 50);
        else {
          playArmed.current = false;
          debugSpool.error("app.play", "el motor no arrancó");
        }
        return;
      }
      debugSpool.info("app.play", "iniciar ronda");
      try {
        g.beginMatch();
      } catch (err) {
        playArmed.current = false;
        debugSpool.error("app.play", err);
      }
    };
    run();
  }, []);

  return (
    <main
      className={`nx-game-shell relative w-full overflow-hidden bg-bg text-fg ${isTouch ? "nx-touch-device" : ""}`}
      data-hand={settings.touchHand}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />
      {(screen === "playing" || screen === "paused" || screen === "ended") && (
        <div className="nx-net-badge pointer-events-none absolute right-3 top-3 z-20 rounded-sm border border-health/60 bg-bg/80 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-health shadow-[0_0_18px_rgba(126,220,106,0.18)] sm:right-5 sm:top-5">
          <span className="mr-2 inline-block size-2 rounded-full bg-health shadow-[0_0_8px_#7edc6a]" />
          {networkState} · {networkPlayers} {networkPlayers === 1 ? "JUGADOR" : "JUGADORES"}
          {roomNumber > 1 && <span className="opacity-60"> · SALA {roomNumber}</span>}
        </div>
      )}
      {demoRemaining !== null && <div className="pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-sm border border-ion/70 bg-bg/85 px-4 py-2 text-center"><p className="nx-kicker text-ion">DEMO DE NEXUS ARENA</p><p className="nx-num text-3xl text-fg">00:{String(Math.max(0, demoRemaining)).padStart(2, "0")}</p></div>}

      {(screen === "menu" || screen === "settings" || screen === "help" || screen === "skin") && (
        <MenuLayer onPlay={play} networkState={networkState} networkPlayers={networkPlayers} roomNumber={roomNumber} radioTick={radioTick} />
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
          Clic para apuntar
        </button>
      )}

      {isTouch && screen === "playing" && <TouchLayer />}
      {(screen === "playing" || screen === "paused" || screen === "ended") && (
        <Scoreboard emphasized={showBoard || screen === "ended"} />
      )}
      {screen !== "menu" && screen !== "settings" && screen !== "help" && screen !== "skin" && !(isTouch && screen === "playing") && (
        <RadioDock tick={radioTick} />
      )}
    </main>
  );
}

function MenuLayer({
  onPlay,
  networkState,
  networkPlayers,
  roomNumber = 1,
  radioTick,
}: {
  onPlay: () => void;
  networkState: string;
  networkPlayers: number;
  roomNumber?: number;
  radioTick: number;
}) {
  void radioTick;
  const screen = useArena((s) => s.screen);
  const setScreen = useArena((s) => s.setScreen);
  const best = useArena((s) => s.best);
  const settings = useArena((s) => s.settings);
  const patch = useArena((s) => s.patchSettings);
  const radio = arenaRadio.snapshot();
  const cumbre = settings.arena === "cumbre";
  const lave = settings.arena === "lave";
  const luna = settings.arena === "luna";
  const maze = settings.arena === "laberinto";
  const mar = settings.arena === "mar";
  const ctf = settings.mode === "ctf";
  const dm = settings.mode !== "ctf";
  const arenaName = mar ? "Mar y cielo" : maze ? "Laberinto" : luna ? "Luna" : cumbre ? "Cumbre" : lave ? "LAVE" : "Pozo";
  const pickArena = (arena: ArenaId) => {
    patch(settings.mode === "ctf" && arena !== "luna" ? { arena, mode: "dm" } : { arena });
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-10 p-2 sm:p-3">
      <div className="nx-steel nx-bezel nx-hull pointer-events-auto relative flex h-full min-h-0 flex-col overflow-hidden">
        <div className="nx-rivets absolute inset-x-0 top-0 z-20 h-3" />
        <div className="nx-rivets absolute inset-x-0 bottom-0 z-20 h-3" />
        <span className="nx-rail absolute left-1 top-1/2 z-20 hidden -translate-y-1/2 sm:block">Core</span>
        <span className="nx-rail absolute right-1 top-1/2 z-20 hidden -translate-y-1/2 sm:block">Core</span>

        <header className="nx-hull-head relative z-10 grid gap-3 px-3 pb-1 pt-3 sm:grid-cols-[1fr_auto] sm:items-start sm:px-8 sm:pb-2 sm:pt-6">
          <div>
            <p className="nx-ink nx-kicker text-ion">{ctf ? "CAPTURA LA BANDERA" : "DEATHMATCH"}</p>
            <div className="mt-1 flex items-center gap-3">
              <Crest />
              <h1 className="nx-ink nx-title">NEXUS ARENA</h1>
            </div>
            <p className="nx-copy nx-body mt-2 max-w-xl sm:mt-3">
              {ctf
                ? "Maqueta Luna. Ion en la superficie, Ascua en el núcleo. Roba la bandera enemiga y vuelve a la tuya."
                : settings.mode === "duel"
                  ? `Duelo en ${arenaName}. Un rival, ocho frags.`
                    : mar
                      ? "Plataforma abierta sobre el océano. Salta entre las islas y usa los impulsores para cruzar el mar."
                    : maze
                    ? "Luna hueca de cuatro pisos y una cisterna. Gravedad baja: un salto te sube unos 7 metros. El agua brilla y te frena."
                    : luna
                    ? "Luna completa. Portales a la superficie y al núcleo interior. Maqueta local."
                    : cumbre
                      ? "Islas lobuladas. Los botones verdes saltan más fuerte y abren el paracaídas. Las puertas siguen siendo el atajo."
                      : lave
                        ? "Pendiente de tres carriles. La mega está arriba, la armadura abajo, el lance en el nido."
                        : "El anillo ve a todos. La mega está en el pozo. Al sur el tubo es una trituradora: si caes al fondo te muele y te lanza al espacio."}{" "}
              Todos los que eligen {arenaName} juegan juntos aquí.
            </p>
          </div>
          <aside className="nx-statcard w-full sm:w-72">
            <p className="nx-statcard-live">
              <i />
              {networkState} · {networkPlayers} {networkPlayers === 1 ? "jugador" : "jugadores"} en {mar ? "Mar y cielo" : maze ? "el laberinto" : luna ? "la luna" : lave ? "LAVE" : cumbre ? "la cumbre" : "el pozo"}
              {roomNumber > 1 && <span className="opacity-60"> · sala {roomNumber}</span>}
            </p>
            <p className="nx-statcard-kicker">Núcleo de la arena</p>
            <p className="nx-statcard-lead">{ctf ? "El límite de capturas se cambia en Ajustes." : "El límite de frags se cambia en Ajustes."}</p>
            <ul className="nx-statcard-list">
              <li>
                <span>Modo</span>
                <b>{ctf ? "CTF" : settings.mode === "duel" ? "Duelo" : "Deathmatch"}</b>
              </li>
              <li>
                <span>Mapa</span>
                <b>{mar ? "Mar y cielo · archipiélago" : maze ? "Laberinto · 4 pisos" : luna ? "Luna · maqueta" : lave ? "LAVE · 96 m" : cumbre ? "Cumbre" : "Pozo · 88 m"}</b>
              </li>
              <li>
                <span>{ctf ? "Capturas" : "Frag límite"}</span>
                <b>{ctf ? `${settings.capLimit} banderas` : `${settings.fragLimit} bajas`}</b>
              </li>
              <li>
                <span>Tu récord</span>
                <b>{best > 0 ? `${best} frags` : "sin marca"}</b>
              </li>
            </ul>
            <div className="nx-statcard-plan">
              <Schematic className="h-12 w-full" />
              <span>{mar ? "Plano de las plataformas marinas" : maze ? "Plano de la luna hueca" : luna ? "Plano de la luna" : lave ? "Plano inclinado de LAVE" : cumbre ? "Plano de la cumbre" : "Plano del pozo"}</span>
            </div>
          </aside>
        </header>

        <div className="nx-hull-art relative mx-3 min-h-0 flex-1 sm:mx-8">
          <div className="nx-arena-grid" role="group" aria-label="Elegir arena e ingresar">
            {ARENA_CARDS.map((card) => {
              const on = settings.arena === card.id && (card.id === "luna" || !ctf);
              return (
                <ArenaCard
                  key={card.id}
                  card={card}
                  on={on}
                  onClick={() => (on ? onPlay() : pickArena(card.id))}
                />
              );
            })}
          </div>
        </div>

        <footer className="nx-hull-foot relative z-10 grid shrink-0 gap-2 px-3 py-2 sm:grid-cols-[minmax(0,20rem)_1fr_auto] sm:items-end sm:gap-3 sm:px-8 sm:py-4">
          <nav className="nx-menu-nav" aria-label="Comandos de la arena">
            <div className="nx-pick-row nx-pick-modes" role="group" aria-label="Modo de partida">
              <PickBtn
                on={dm}
                title="Deathmatch"
                hint="Todos contra todos"
                onClick={() => patch({ mode: "dm", bots: 4, fragLimit: 15 })}
              />
              <PickBtn
                on={ctf}
                title="Captura"
                hint="Banderas en Luna"
                onClick={() => patch({ mode: "ctf", arena: "luna", bots: 3, capLimit: 3 })}
              />
            </div>
            <SteelBtn primary hint={`Entra a ${arenaName} · ronda ahora`} onClick={onPlay} icon={<Play className="size-4" />}>
              Jugar
            </SteelBtn>
            <SteelBtn tone="guide" hint="Controles, armas y pads" onClick={() => setScreen("help")} icon={<BookOpen className="size-4" />}>
              Cómo jugar
            </SteelBtn>
            <SteelBtn tone="gear" hint="Color del arma y del marcador" onClick={() => setScreen("skin")} icon={<Crosshair className="size-4" />}>
              Skin
            </SteelBtn>
            <SteelBtn tone="gear" hint="Nombre, bots y sensibilidad" onClick={() => setScreen("settings")} icon={<SettingsIcon className="size-4" />}>
              Ajustes
            </SteelBtn>
          </nav>

          {screen === "menu" && (
            <div className="nx-menu-extras flex flex-col items-center justify-end gap-2">
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

          {screen === "menu" && <MenuCareer bots={settings.bots} />}
        </footer>

        {(screen === "settings" || screen === "help" || screen === "skin") && (
          <div
            className="nx-modal-scrim"
            role="presentation"
            onClick={() => setScreen("menu")}
          >
            <div
              className="nx-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby={screen === "help" ? "nx-help-title" : screen === "skin" ? "nx-skin-title" : "nx-settings-title"}
              onClick={(e) => e.stopPropagation()}
            >
              {screen === "settings" ? (
                <SettingsPanel onBack={() => setScreen("menu")} />
              ) : screen === "skin" ? (
                <SkinPanel onBack={() => setScreen("menu")} />
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

const ARENA_CARDS: Array<{ id: ArenaId; title: string; line: string; art: string; rail: string }> = [
  { id: "pozo", title: "Pozo", line: "Anillo, tubo y núcleo", art: "/textures/previews/arena-pozo-preview-v1.webp", rail: "#3ae8d2" },
  { id: "cumbre", title: "Cumbre", line: "Islas y paracaídas", art: "/textures/previews/arena-cumbre-preview-v1.webp", rail: "#ff4d6a" },
  { id: "lave", title: "Lave", line: "Pendiente de lava", art: "/textures/previews/arena-lave-preview-v1.webp", rail: "#ff6a28" },
  { id: "luna", title: "Luna", line: "Superficie y núcleo", art: "/textures/previews/arena-luna-preview-v1.webp", rail: "#d7ecff" },
  { id: "laberinto", title: "Laberinto", line: "Cuatro pisos, gravedad baja", art: "/textures/previews/arena-laberinto-preview-v1.webp", rail: "#7af0ff" },
  { id: "mar", title: "Mar y cielo", line: "Plataforma sobre el océano", art: "/textures/previews/arena-mar-preview-v1.webp", rail: "#9fd4ff" },
];

function ArenaCard({
  card,
  on,
  onClick,
}: {
  card: (typeof ARENA_CARDS)[number];
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? `Entrar a ${card.title}` : `Elegir ${card.title}`}
      style={{ ["--arena-rail" as string]: card.rail, backgroundImage: `url(${card.art})` }}
      onPointerUp={(e) => {
        if (e.pointerType === "touch") {
          e.preventDefault();
          onClick();
        }
      }}
      onClick={(e) => {
        if (e.nativeEvent instanceof PointerEvent && e.nativeEvent.pointerType === "touch") return;
        onClick();
      }}
      className={`nx-arena-card ${on ? "is-on" : ""}`}
    >
      <span className="nx-arena-card-kicker">{on ? "Lista" : "Arena"}</span>
      <span className="nx-arena-card-title">{card.title}</span>
      <span className="nx-arena-card-line">{card.line}</span>
      <span className="nx-arena-card-go">{on ? "Entrar" : "Elegir"}</span>
    </button>
  );
}

function PickBtn({
  title,
  hint,
  on,
  onClick,
}: {
  title: string;
  hint?: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onPointerUp={(e) => {
        if (e.pointerType === "touch") {
          e.preventDefault();
          onClick();
        }
      }}
      onClick={(e) => {
        if (e.nativeEvent instanceof PointerEvent && e.nativeEvent.pointerType === "touch") return;
        onClick();
      }}
      className={`nx-pick ${hint ? "nx-pick-mode" : ""} ${on ? "is-on" : ""}`}
    >
      <span className="nx-pick-title">{title}</span>
      {hint ? <span className="nx-pick-hint">{hint}</span> : null}
    </button>
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
    <button
      type="button"
      onPointerUp={(e) => {
        if (e.pointerType === "touch") {
          e.preventDefault();
          onClick();
        }
      }}
      onClick={(e) => {
        if (e.nativeEvent instanceof PointerEvent && e.nativeEvent.pointerType === "touch") return;
        onClick();
      }}
      className={`nx-cmd nx-cmd-${kind}`}
    >
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
  const isTouch = useArena((s) => s.isTouch);
  const patch = useArena((s) => s.patchSettings);
  const moveTouch = (from: number, dir: -1 | 1) => {
    const to = from + dir;
    const order = settings.touchOrder.slice();
    if (to < 0 || to >= order.length) return;
    const swap = order[from]!;
    order[from] = order[to]!;
    order[to] = swap;
    patch({ touchOrder: order });
  };
  return (
    <>
      <header className="nx-modal-head">
        <div>
          <p className="nx-kicker text-ion">Panel de piloto</p>
          <h2 id="nx-settings-title" className="nx-ink nx-heading">
            Ajustes
          </h2>
          <p className="nx-copy nx-body mt-1">Cambia el nombre, la mira y el modo. En el teléfono puedes invertir las manos y el orden de los botones. Cada mapa es una sala: ahí se encuentran todos.</p>
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
      <div className="nx-pick-row nx-pick-modes mt-4" role="group" aria-label="Modo de partida">
        <PickBtn on={settings.mode === "dm"} title="Deathmatch" hint="Todos vs todos" onClick={() => patch({ mode: "dm", bots: 4, fragLimit: 15 })} />
        <PickBtn on={settings.mode === "ctf"} title="Captura" hint="Banderas en Luna" onClick={() => patch({ mode: "ctf", arena: "luna", bots: 3, capLimit: 3 })} />
      </div>
      <div className="mt-2">
        <PickBtn on={settings.mode === "duel"} title="Duelo" hint="Un rival, ocho frags" onClick={() => patch({ mode: "duel", bots: 1, fragLimit: 8 })} />
      </div>
      <div className="nx-modal-grid">
        <Slider label={isTouch ? "Sensibilidad de la mira" : "Sensibilidad del mouse"} value={settings.sens} min={0.3} max={2.4} step={0.05} onChange={(v) => patch({ sens: v })} />
        <Slider label="Campo de visión (FOV)" value={settings.fov} min={70} max={100} step={1} suffix="°" onChange={(v) => patch({ fov: v })} />
        <Slider label="Volumen de radio y disparos" value={settings.volume} min={0} max={1} step={0.02} pct onChange={(v) => patch({ volume: v })} />
        <Slider label="Temblor de cámara" value={settings.shake} min={0} max={1} step={0.05} pct onChange={(v) => patch({ shake: v })} />
        <Slider label="Bots rivales" value={settings.bots} min={1} max={4} step={1} disabled={settings.mode === "duel"} onChange={(v) => patch({ bots: v })} />
        <Slider label="Velocidad de los bots" value={settings.botSpeed} min={0.35} max={1} step={0.05} pct onChange={(v) => patch({ botSpeed: v })} />
        {settings.mode === "ctf" ? (
          <Slider label="Capturas para ganar" value={settings.capLimit} min={1} max={8} step={1} onChange={(v) => patch({ capLimit: v })} />
        ) : (
          <Slider label="Frags para ganar la ronda" value={settings.fragLimit} min={5} max={30} step={1} disabled={settings.mode === "duel"} onChange={(v) => patch({ fragLimit: v })} />
        )}
      </div>
      <section className="nx-touch-settings mt-4">
        <p className="nx-kicker text-ion">Controles táctiles</p>
        <p className="nx-copy nx-body mt-1 text-sm">Mover y mirar cambian de lado. El último botón de la lista queda junto a Fuego. Tocá las flechas para reordenar.</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            className={`nx-plate nx-kicker min-h-11 px-2 py-2 ${settings.touchHand === "right" ? "nx-touch-hand-on text-ion" : "text-faint"}`}
            onClick={() => patch({ touchHand: "right" })}
          >
            Diestro
            <span className="mt-1 block text-[0.62rem] font-sans font-normal tracking-normal text-copy">Mover izq · Fuego der</span>
          </button>
          <button
            type="button"
            className={`nx-plate nx-kicker min-h-11 px-2 py-2 ${settings.touchHand === "left" ? "nx-touch-hand-on text-ion" : "text-faint"}`}
            onClick={() => patch({ touchHand: "left" })}
          >
            Zurdo
            <span className="mt-1 block text-[0.62rem] font-sans font-normal tracking-normal text-copy">Fuego izq · Mover der</span>
          </button>
        </div>
        <div className="nx-touch-preview mt-3" data-hand={settings.touchHand} aria-hidden="true">
          <span className="nx-touch-preview-move">MOVER</span>
          <ol>
            {settings.touchOrder.map((id) => (
              <li key={id} data-action={id}>{TOUCH_ACTIONS.find((action) => action.id === id)?.short ?? id}</li>
            ))}
          </ol>
          <span className="nx-touch-preview-fire">FUEGO</span>
          <span className="nx-touch-preview-look">MIRAR</span>
        </div>
        <ul className="mt-3 grid gap-1.5">
          {settings.touchOrder.map((id, index) => {
            const action = TOUCH_ACTIONS.find((item) => item.id === id);
            const label = action?.label ?? id;
            return (
              <li key={id} className="flex min-h-12 items-center gap-2 border border-border bg-bg/70 px-2">
                <span className="nx-stat w-5 text-copy">{index + 1}</span>
                <span className="nx-copy flex-1 text-sm text-fg">{label}</span>
                <span className="nx-kicker text-[0.58rem] text-faint">{action?.short}</span>
                <button type="button" className="nx-kicker min-h-11 min-w-11 text-ion disabled:opacity-30" disabled={index === 0} onClick={() => moveTouch(index, -1)} aria-label={`Mover ${label} a la izquierda`}>
                  <ArrowLeft className="mx-auto size-4" />
                </button>
                <button type="button" className="nx-kicker min-h-11 min-w-11 text-ion disabled:opacity-30" disabled={index === settings.touchOrder.length - 1} onClick={() => moveTouch(index, 1)} aria-label={`Mover ${label} a la derecha`}>
                  <ArrowRight className="mx-auto size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      <div className="nx-modal-actions">
        <SteelBtn onClick={onBack}>Listo</SteelBtn>
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
  disabled = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  suffix?: string;
  pct?: boolean;
  disabled?: boolean;
}) {
  const shown = pct ? `${Math.round(value * 100)}%` : Number.isInteger(step) && step >= 1 ? `${value}${suffix}` : `${value.toFixed(2)}${suffix}`;
  return (
    <label className={`nx-copy nx-body mt-0 block text-sm ${disabled ? "opacity-45" : ""}`}>
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
        disabled={disabled}
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
          <p className="nx-copy nx-body mt-1">Deathmatch es el primero al límite de frags. Captura la bandera se juega en Luna: superficie y núcleo unidos por portales.</p>
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
            <KeyRow keys={["Clic izq."]} action="Disparar" />
            <KeyRow keys={["Clic der."]} action="Mira. Lance, Torpedo e Ion abren telescopio" />
            <KeyRow keys={["Rueda"]} action="Zoom del telescopio, o cambiar arma si no apuntas" />
            <KeyRow keys={["Espacio"]} action="Saltar" />
            <KeyRow keys={["Shift"]} action="Sprint" />
            <KeyRow keys={["C"]} action="Agacharte" />
            <KeyRow keys={["V"]} action="Sacar o guardar el arma cuerpo a cuerpo" />
            <KeyRow keys={["1", "2", "3", "4", "5", "6"]} action="Cambiar arma" />
            <KeyRow keys={["R"]} action="Recargar" />
            <KeyRow keys={["G"]} action="Granada de píxeles" />
            <KeyRow keys={["A", "D"]} action="Strafe en el aire: ganas velocidad" />
            <KeyRow keys={["Tab"]} action="Marcador" />
            <KeyRow keys={["Esc"]} action="Pausa" />
            <KeyRow keys={["N", "M"]} action="Radio: siguiente / anterior" />
            <KeyRow keys={["Teléfono"]} action="Palanca izquierda mueve, derecha mira, Fuego dispara. Orden de Salto/Arma/Recarga/Granada/Mira se cambia en Ajustes (Diestro/Zurdo y flechas)." />
          </ul>
        </section>
        <section>
          <h3 className="nx-modal-h">Armas</h3>
          <ul className="nx-helplist">
            {[...WEAPON_ORDER, ...MELEE_ORDER].map((id) => (
              <li key={id} className="nx-help-gun">
                <img src={`/textures/pickups/${id}-icon.jpg`} alt="" />
                <span><b>{WEAPON_META[id].kind === "melee" ? "V" : WEAPON_META[id].slot}</b> {WEAPON_META[id].label}</span>
              </li>
            ))}
          </ul>
          <h3 className="nx-modal-h">En el pozo</h3>
          <ul className="nx-helplist nx-helplist-copy">
            <li>Al empezar sales con Pulse, Scatter y la espada. Torpedo, Lance, Ion, Fauces, el bate y el martillo están en el mapa. Solo llevas un arma cuerpo a cuerpo: la nueva reemplaza la anterior. Si caes, conservas lo que llevabas.</li>
            <li>Al fondo sur, el tubo es una trituradora. Si caes entre los rotores te muele y te dispara al espacio.</li>
            <li>Los pads cian te lanzan. Los anillos cian te suben al cielo: bajas en paracaídas y puedes repetirlo.</li>
            <li>En LAVE las grietas naranjas son fisuras térmicas: pisarlas te quema. Cruza o salta, no te quedes.</li>
            <li>En Luna los anillos violetas te mandan de la superficie al núcleo y de vuelta. En CTF, Ion nace arriba y Ascua adentro.</li>
            <li>En Laberinto estás dentro de una luna redonda de cuatro pisos. La gravedad baja: un salto te sube unos 7 metros por los huecos. El agua brilla y te frena, no te quema.</li>
            <li>Captura: toma la bandera enemiga y llévala a la tuya mientras la tuya esté en base. Si mueres, se suelta.</li>
            <li>Todos entran a la misma arena. El anfitrión de la sala elige el mapa y el modo.</li>
            <li>Torpedo a los pies = rocket jump. Strafea en el aire. Las escaleras del anillo se suben caminando.</li>
            <li>
              <b>VELOCIDAD</b> sprint y doble salto. <b>FASE</b> blink en el aire. <b>MEGAVATIO</b> más daño. <b>SUPERSALTO</b> te sube al anillo de un salto.
            </li>
            <li>La mega se drena. En deathmatch gana quien llega primero al límite de frags. En captura, el equipo que llega al límite de banderas.</li>
          </ul>
        </section>
      </div>
      <div className="nx-modal-actions nx-modal-actions-solo">
        <SteelBtn onClick={onBack}>Entendido</SteelBtn>
      </div>
    </>
  );
}

function HudLayer() {
  const hud = useArena((s) => s.hud);
  const healthTone = hud.health > 100 ? "text-ion" : hud.health <= 30 ? "text-hot" : "text-health";
  return (
    <div className="pointer-events-none absolute inset-0 z-10 nx-hud">
      {hud.hurt > 0 && hud.alive && (
        <div className="absolute inset-0 bg-[#c41812]" style={{ opacity: Math.min(0.5, hud.hurt * 1.35) }} />
      )}
      {!hud.alive && (
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(255,36,18,0.28) 0%, rgba(140,0,0,0.62) 55%, rgba(48,0,0,0.9) 100%)",
          }}
        />
      )}
      {hud.scope ? (
        <div className="nx-scope" aria-hidden>
          <div className="nx-scope-glass" />
          <span className="nx-scope-h" />
          <span className="nx-scope-v" />
          <span className="nx-scope-dot" />
          <p className="nx-scope-zoom">{hud.scope.toFixed(1)}×</p>
        </div>
      ) : (
        <>
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
        </>
      )}

      <div className="nx-hud-round absolute left-1/2 top-5 -translate-x-1/2 text-center sm:top-8">
        <p className="nx-kicker text-ion">RONDA {formatRoundTime(hud.roundSeconds)}</p>
        <p className="nx-stat mt-1 text-copy">NV {hud.level} · {hud.score} PTS{hud.streak > 1 ? ` · RACHA x${hud.streak}` : ""}</p>
      </div>

      <div className="nx-hud-frags absolute left-5 top-5 sm:left-8 sm:top-8">
        {hud.mode === "ctf" ? (
          <>
            <p className="nx-kicker text-copy">CAPTURA · {hud.playerTeam === "ember" ? "ASCUA" : "ION"}</p>
            <p className="nx-num text-3xl">
              <span style={{ color: TEAM_META.ion.css }}>{hud.teamScore.ion}</span>
              <span className="mx-1 text-xl text-copy">–</span>
              <span style={{ color: TEAM_META.ember.css }}>{hud.teamScore.ember}</span>
              <span className="ml-1 text-xl font-semibold tracking-normal text-copy">/{hud.capLimit}</span>
            </p>
            <ul className="mt-1 space-y-0.5">
              {hud.flags.map((fl) => (
                <li key={fl.team} className="nx-stat text-copy">
                  {TEAM_META[fl.team].label}: {fl.state === "home" ? "en base" : fl.state === "carried" ? `con ${fl.carrier}` : "suelta"}
                </li>
              ))}
            </ul>
            {hud.carrying && <p className="nx-stat mt-1 text-ion">Llevas la bandera {TEAM_META[hud.carrying].label}</p>}
          </>
        ) : (
          <>
            <p className="nx-kicker text-copy">FRAGS</p>
            <p className="nx-num text-4xl">
              {hud.frags}
              <span className="ml-0.5 text-xl font-semibold tracking-normal text-copy">/{hud.fragLimit}</span>
            </p>
          </>
        )}
      </div>

      <div className="nx-hud-feed absolute right-5 top-5 max-w-xs space-y-1 text-right sm:right-8 sm:top-8">
        {hud.killFeed.map((k) => (
          <p key={k.id} className="nx-stat text-copy">
            <span className="font-semibold text-fg">{k.attacker}</span>
            <span className="text-muted"> {k.weapon === "world" ? "caída" : k.headshot ? "lance" : k.weapon} </span>
            <span className="font-semibold text-hot">{k.victim}</span>
          </p>
        ))}
      </div>

      <div className="nx-hud-health absolute bottom-6 left-5 sm:bottom-10 sm:left-10">
        <p className="nx-kicker text-copy">VITALES</p>
        <p className={`nx-num text-5xl ${healthTone}`}>{hud.health}</p>
        <div className="nx-vita" aria-hidden>
          <div className="nx-vita-track">
            <span className={`nx-vita-fill ${hud.health <= 30 ? "is-hot" : hud.health > 100 ? "is-ion" : ""}`} style={{ width: `${Math.min(100, hud.health)}%` }} />
            {hud.health > 100 && <span className="nx-vita-over" style={{ width: `${Math.min(100, hud.health - 100)}%` }} />}
          </div>
          <div className="nx-vita-track nx-vita-track-armor">
            <span className="nx-vita-armor" style={{ width: `${Math.min(100, hud.armor)}%` }} />
          </div>
          <span className="nx-vita-ticks" />
        </div>
        <p className="nx-stat mt-1 text-armor">ARM {hud.armor}</p>
      </div>

      <div className="nx-hud-ammo absolute bottom-6 right-5 text-right sm:bottom-10 sm:right-10">
        <p className="nx-kicker text-copy">{WEAPON_META[hud.weapon].label}</p>
        {WEAPON_META[hud.weapon].kind === "melee" ? (
          <p className="nx-num text-3xl">MELÉ</p>
        ) : (
          <p className="nx-num text-5xl">
            {hud.ammo}
            <span className="ml-0.5 text-xl font-semibold tracking-normal text-copy">/{hud.reserve}</span>
          </p>
        )}
        <div className="mt-2 flex justify-end gap-1.5">
          {WEAPON_ORDER.map((id, i) => (
            <span
              key={id}
              className={`nx-wep-slot ${
                hud.weapon === id
                  ? "is-hot"
                  : hud.weapons.includes(id)
                    ? "is-owned"
                    : "is-empty"
              }`}
              title={WEAPON_META[id].label}
            >
              <img src={`/textures/pickups/${id}-icon.jpg`} alt={WEAPON_META[id].label} />
              <b>{i + 1}</b>
            </span>
          ))}
          {MELEE_ORDER.filter((id) => hud.weapons.includes(id)).map((id) => (
            <span
              key={id}
              className={`nx-wep-slot ${hud.weapon === id ? "is-hot" : "is-owned"}`}
              title={WEAPON_META[id].label}
            >
              <img src={`/textures/pickups/${id}-icon.jpg`} alt={WEAPON_META[id].label} />
              <b>V</b>
            </span>
          ))}
        </div>
        <p className="nx-stat mt-2 text-ion">G GRANADAS PÍXEL: {hud.grenades}</p>
      </div>

      {hud.powers.length > 0 && (
        <div className="nx-hud-powers absolute bottom-24 left-1/2 flex -translate-x-1/2 gap-2 sm:bottom-28">
          {hud.powers.map((p) => (
            <div
              key={p.id}
              className="nx-pow-chip min-w-20 rounded-sm border px-2 py-1 text-center"
              style={{ borderColor: p.color, color: p.color }}
            >
              <img className="nx-pow-icon" src={`/textures/pickups/${p.id}-icon.jpg`} alt="" />
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
        <p className="nx-kicker absolute left-1/2 top-[40%] -translate-x-1/2 text-4xl text-hot drop-shadow-[0_0_18px_rgba(255,30,20,0.85)]">
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

function MenuCareer({ bots }: { bots: number }) {
  const career = readCareer();
  return (
    <div className="nx-menu-extras nx-plate flex items-center gap-4 px-4 py-3">
      <div>
        <p className="nx-copy nx-kicker">Nivel {career.level}</p>
        <p className="nx-ink nx-num text-4xl">{career.xp}<span className="text-xl text-copy">/{XP_PER_LEVEL}</span></p>
        <p className="nx-copy nx-stat mt-1">{career.prize ? PRIZE_LABEL[career.prize] : `${1 + bots} en pista`}</p>
      </div>
      <Skull className="size-10 text-muted" strokeWidth={1.25} />
    </div>
  );
}

function readCareer() {
  try {
    const raw = localStorage.getItem(CAREER_KEY);
    const data = raw ? (JSON.parse(raw) as { xp?: number; prize?: RoundPrize | null }) : {};
    const xp = Math.max(0, data.xp ?? 0);
    return { level: levelFromXp(xp), xp: xp % XP_PER_LEVEL, prize: data.prize ?? null };
  } catch {
    return { level: 1, xp: 0, prize: null as RoundPrize | null };
  }
}

function SkinPanel({ onBack }: { onBack: () => void }) {
  const skin = useArena((s) => s.settings.skin);
  const patch = useArena((s) => s.patchSettings);
  return (
    <>
      <header className="nx-modal-head">
        <p className="nx-kicker text-ion">PILOTO</p>
        <h2 id="nx-skin-title" className="nx-heading text-3xl">Skin</h2>
        <p className="nx-body mt-1 text-copy">El brillo del arma y tu color en el marcador.</p>
      </header>
      <div className="grid grid-cols-1 gap-2">
        {(Object.keys(SKINS) as SkinId[]).map((id) => {
          const tone = SKINS[id];
          const on = skin === id;
          return (
            <button
              key={id}
              type="button"
              className={`nx-plate flex min-h-11 items-center gap-3 px-3 py-2 text-left ${on ? "text-fg" : "text-copy"}`}
              onClick={() => patch({ skin: id })}
            >
              <span className="inline-block size-4" style={{ background: tone.css }} />
              <span className="nx-kicker">{tone.label}</span>
            </button>
          );
        })}
      </div>
      <div className="nx-modal-actions nx-modal-actions-solo">
        <SteelBtn onClick={onBack}>Listo</SteelBtn>
      </div>
    </>
  );
}

function EndLayer({ onPlay }: { onPlay: () => void }) {
  const hud = useArena((s) => s.hud);
  const winner = hud.winner;
  return (
    <div className="absolute inset-0 z-20 flex items-end justify-center bg-bg/55 p-6 sm:items-center">
      <div className="nx-plate w-[min(92vw,28rem)] p-6">
        <p className="nx-ink nx-kicker text-ion">MATCH</p>
        <h2 className="nx-ink nx-heading text-4xl">{winner}</h2>
        <p className="nx-copy nx-body mt-1">{hud.leveled ? `Subiste a nivel ${hud.level}.` : `Nivel ${hud.level} · ${hud.xp}/${hud.xpNeed} pts`}</p>
        {hud.prize && <p className="nx-stat mt-2 text-ion">{hud.prize}</p>}
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

function Scoreboard({ emphasized }: { emphasized: boolean }) {
  const rows = useArena((s) => s.hud.scoreboard);
  return (
    <div
      className={`nx-scoreboard ${emphasized ? "nx-scoreboard-open" : ""} ${
        emphasized
          ? "pointer-events-none absolute left-1/2 top-24 z-20 w-[min(92vw,22rem)] -translate-x-1/2 rounded-sm border border-border/70 bg-bg/80 px-4 py-3"
          : "pointer-events-none absolute left-5 top-28 z-20 w-40 opacity-60 sm:left-8"
      }`}
    >
      <p className="nx-kicker text-copy">MARCADOR</p>
      <ul className="mt-1 space-y-0.5">
        {rows.map((r) => (
          <li key={r.name} className="nx-stat flex items-baseline justify-between text-xs">
            <span className={r.isPlayer ? "font-semibold text-fg" : "text-copy"} style={{ color: r.isPlayer ? undefined : r.color }}>
              {r.name}
            </span>
            <span className="text-fg">
              {r.frags}
              {emphasized && <span className="text-copy"> / {r.deaths}</span>}
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
  const hand = useArena((s) => s.settings.touchHand);
  const order = useArena((s) => s.settings.touchOrder);
  useEffect(
    () => () => {
      getGame()?.setTouchMove(0, 0);
      getGame()?.setTouchFire(false);
      getGame()?.setTouchAim(false);
    },
    [],
  );
  const stopMove = () => {
    moveOrigin.current = null;
    getGame()?.setTouchMove(0, 0);
  };
  const stopLook = () => {
    lookOrigin.current = null;
  };
  const stopFire = () => getGame()?.setTouchFire(false);
  const stopAim = () => getGame()?.setTouchAim(false);

  return (
    <div className="touch-controls pointer-events-none absolute inset-0 z-30 touch-none" data-hand={hand} onContextMenu={(e) => e.preventDefault()}>
      <div
        className="touch-zone touch-zone-move pointer-events-auto"
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          moveOrigin.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
        }}
        onPointerMove={(e) => {
          if (!moveOrigin.current || moveOrigin.current.id !== e.pointerId) return;
          const dx = (e.clientX - moveOrigin.current.x) / 56;
          const dy = (moveOrigin.current.y - e.clientY) / 56;
          getGame()?.setTouchMove(dx, dy);
        }}
        onPointerUp={stopMove}
        onPointerCancel={stopMove}
        onLostPointerCapture={stopMove}
      />
      <div
        className="touch-zone touch-zone-look pointer-events-auto"
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          lookOrigin.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
        }}
        onPointerMove={(e) => {
          const last = lookOrigin.current;
          if (!last || last.id !== e.pointerId) return;
          getGame()?.addTouchLook(e.clientX - last.x, e.clientY - last.y);
          lookOrigin.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
        }}
        onPointerUp={stopLook}
        onPointerCancel={stopLook}
        onLostPointerCapture={stopLook}
      />
      <div className="touch-pad touch-pad-move" aria-hidden="true"><span>MOVER</span></div>
      <div className="touch-pad touch-pad-look" aria-hidden="true"><span>MIRAR</span></div>
      <button
        type="button"
        className="touch-fire pointer-events-auto"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          getGame()?.setTouchFire(true);
        }}
        onPointerUp={stopFire}
        onPointerCancel={stopFire}
        onLostPointerCapture={stopFire}
      >
        FUEGO
      </button>
      <div className="touch-actions pointer-events-auto">
        {order.map((id) => (
          <TouchActionChip key={id} id={id} onAimUp={stopAim} />
        ))}
      </div>
      <div className="touch-top-actions pointer-events-auto">
        <button type="button" className="touch-top-btn touch-pause" onClick={() => getGame()?.pause()} aria-label="Pausa">
          <Pause className="size-4" />
        </button>
      </div>
    </div>
  );
}

function TouchActionChip({ id, onAimUp }: { id: TouchActionId; onAimUp: () => void }) {
  const action = TOUCH_ACTIONS.find((item) => item.id === id);
  const label = action?.short ?? action?.label ?? id;
  if (id === "aim") {
    return (
      <RoundBtn
        id={id}
        label={label}
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          getGame()?.setTouchAim(true);
        }}
        onPointerUp={onAimUp}
      />
    );
  }
  if (id === "jump") {
    return (
      <RoundBtn
        id={id}
        label={label}
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          getGame()?.setTouchJump();
        }}
      />
    );
  }
  if (id === "weapon") return <RoundBtn id={id} label={label} onClick={() => getGame()?.cycleWeapon(1)} />;
  if (id === "reload") return <RoundBtn id={id} label={label} onClick={() => getGame()?.setTouchReload()} />;
  return <RoundBtn id={id} label={label} accent onClick={() => getGame()?.setTouchGrenade()} />;
}

function RoundBtn({
  id,
  label,
  accent,
  onClick,
  onPointerDown,
  onPointerUp,
}: {
  id: TouchActionId;
  label: string;
  accent?: boolean;
  onClick?: () => void;
  onPointerDown?: (e: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp?: () => void;
}) {
  return (
    <button
      type="button"
      data-action={id}
      aria-label={TOUCH_ACTIONS.find((action) => action.id === id)?.label ?? label}
      onClick={onClick}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onPointerDown?.(e);
      }}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onLostPointerCapture={onPointerUp}
      className={`nx-kicker touch-action-btn rounded-full border px-2 ${
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

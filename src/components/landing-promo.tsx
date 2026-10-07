import { useEffect, useRef, useState } from "react";
import { ArrowRight, Gamepad2, Pause, Play } from "lucide-react";
import { WEAPON_META, WEAPON_ORDER, MELEE_ORDER } from "@/game/constants";
import type { WeaponId } from "@/game/types";
import "../landing-promo.css";

/** Event the landing's hero audio button fires so a running preview stops. */
export const PROMO_STOP_EVENT = "nexus-promo-stop";

// Real tracks (src/game/radio.ts / public/media/playlist.json). Previews are 30 s clips.
const TRACKS = [
  { title: "Acceso al Crucible", length: "2:56", preview: "/media/promo/acceso-al-crucible-preview.mp3" },
  { title: "Puro Headshot", length: "2:58", preview: "/media/promo/puro-headshot-preview.mp3" },
  { title: "Pulso Letal", length: "2:56", preview: "/media/promo/pulso-letal-preview.mp3" },
];

// Same names/lines as the in-game arena picker (src/components/nexus-app.tsx ARENA_CARDS).
const ARENAS = [
  { id: "pozo", title: "Pozo", line: "Anillo, tubo y núcleo", rail: "#3ae8d2" },
  { id: "cumbre", title: "Cumbre", line: "Islas y paracaídas", rail: "#ff4d6a" },
  { id: "lave", title: "Lave", line: "Pendiente de lava", rail: "#ff6a28" },
  { id: "luna", title: "Luna", line: "Superficie y núcleo", rail: "#d7ecff" },
  { id: "laberinto", title: "Laberinto", line: "Cuatro pisos, gravedad baja", rail: "#7af0ff" },
  { id: "mar", title: "Mar y cielo", line: "Plataforma sobre el océano", rail: "#9fd4ff" },
];

// Short taglines derived from each weapon's real stats in WEAPON_META.
const WEAPON_LINE: Partial<Record<WeaponId, string>> = {
  pulse: "Automática de impacto instantáneo",
  scatter: "8 perdigones por disparo",
  torpedo: "Proyectil explosivo · daño en área",
  lance: "Precisión total a larga distancia",
  ion: "Ráfaga de proyectiles rápidos",
  fauces: "Mordida brutal a corta distancia",
  knife: "Filo rápido cuerpo a cuerpo",
  bate: "Golpe que te manda a volar",
  martillo: "100 de daño de un solo golpe",
};

function hex(color: number) {
  return `#${color.toString(16).padStart(6, "0")}`;
}

function SectionHead({ kicker, title, children }: { kicker: string; title: string; children?: React.ReactNode }) {
  return (
    <header className="promo-head">
      <p className="landing-kicker">{kicker}</p>
      <h2>{title}</h2>
      {children && <p className="promo-lede">{children}</p>}
    </header>
  );
}

function Soundtrack({ onPreviewPlay }: { onPreviewPlay: () => void }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<number | null>(null);

  useEffect(() => {
    const stop = () => {
      audio.current?.pause();
      setPlaying(null);
    };
    window.addEventListener(PROMO_STOP_EVENT, stop);
    return () => {
      window.removeEventListener(PROMO_STOP_EVENT, stop);
      audio.current?.pause();
    };
  }, []);

  function toggle(index: number) {
    if (playing === index) {
      audio.current?.pause();
      setPlaying(null);
      return;
    }
    // Created on first click only: nothing is downloaded until the user asks for it.
    if (!audio.current) {
      const el = new Audio();
      el.preload = "none";
      el.volume = 0.4;
      el.addEventListener("ended", () => setPlaying(null));
      audio.current = el;
    }
    const el = audio.current;
    el.pause();
    el.src = TRACKS[index]!.preview;
    onPreviewPlay();
    el.play().then(() => setPlaying(index)).catch(() => setPlaying(null));
  }

  return (
    <section className="promo-section promo-sound" aria-labelledby="promo-sound-title">
      <SectionHead kicker="SOLO SUENA AQUÍ" title="Banda sonora original">
        Tres temas propios que suenan dentro de la arena mientras peleas. Dale play y escucha un adelanto.
      </SectionHead>
      <ol className="promo-tracks" id="promo-sound-title">
        {TRACKS.map((track, i) => (
          <li key={track.title} className={playing === i ? "is-playing" : ""}>
            <button type="button" onClick={() => toggle(i)} aria-pressed={playing === i} aria-label={`${playing === i ? "Pausar" : "Escuchar"} ${track.title}`}>
              {playing === i ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
            </button>
            <span className="promo-track-num">{String(i + 1).padStart(2, "0")}</span>
            <span className="promo-track-title">{track.title}</span>
            <span className="promo-track-eq" aria-hidden="true"><i /><i /><i /><i /></span>
            <span className="promo-track-len">{track.length}</span>
          </li>
        ))}
      </ol>
      <p className="promo-note">Adelantos de 30 s · temas completos dentro del juego</p>
    </section>
  );
}

function Arenas() {
  return (
    <section className="promo-section" aria-labelledby="promo-arenas-title">
      <SectionHead kicker={`${ARENAS.length} MAPAS INCLUIDOS`} title="Todas las arenas">
        Todos los mapas abiertos y gratis desde el primer minuto. Deathmatch contra bots o duelo, tú eliges dónde pelear.
      </SectionHead>
      <div className="promo-arenas" id="promo-arenas-title">
        {ARENAS.map((arena) => (
          <article key={arena.id} className="promo-arena" style={{ ["--rail" as string]: arena.rail }}>
            <img src={`/media/promo/arena-${arena.id}.webp`} alt={`Arena ${arena.title}`} width={640} height={427} loading="lazy" decoding="async" />
            <div>
              <h3>{arena.title}</h3>
              <p>{arena.line}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function WeaponCard({ id }: { id: WeaponId }) {
  const meta = WEAPON_META[id];
  const melee = meta.kind === "melee";
  const damage = meta.pellets > 1 ? `${meta.pellets}×${meta.damage}` : String(meta.damage);
  const kind = melee ? "CUERPO A CUERPO" : meta.kind === "projectile" ? "PROYECTIL" : "IMPACTO DIRECTO";
  return (
    <article className="promo-weapon" style={{ ["--weapon" as string]: hex(meta.color) }}>
      <img src={`/media/promo/arma-${id}.webp?v=2`} alt="" width={64} height={64} loading="lazy" decoding="async" />
      <div className="promo-weapon-body">
        <span className="promo-weapon-kind">{kind}</span>
        <h3>{meta.label}</h3>
        <p>{WEAPON_LINE[id]}</p>
        <dl>
          <div><dt>DAÑO</dt><dd>{damage}</dd></div>
          <div><dt>CADENCIA</dt><dd>{meta.rpm}<small>/min</small></dd></div>
          {!melee && <div><dt>CARGADOR</dt><dd>{meta.mag}</dd></div>}
        </dl>
      </div>
    </article>
  );
}

function Arsenal() {
  return (
    <section className="promo-section" aria-labelledby="promo-arsenal-title">
      <SectionHead kicker={`${WEAPON_ORDER.length} ARMAS DE FUEGO · ${MELEE_ORDER.length} CUERPO A CUERPO`} title="Arsenal">
        Del Pulse automático al Torpedo explosivo. Recoge armas en la arena, cambia en un toque y remata con el Martillo.
      </SectionHead>
      <div className="promo-weapons" id="promo-arsenal-title">
        {[...WEAPON_ORDER, ...MELEE_ORDER].map((id) => <WeaponCard key={id} id={id} />)}
      </div>
    </section>
  );
}

export default function LandingPromo({ onBuy, onStartDemo, onPreviewPlay }: { onBuy: () => void; onStartDemo?: () => void; onPreviewPlay: () => void }) {
  return (
    <div className="promo">
      <Soundtrack onPreviewPlay={onPreviewPlay} />
      <Arenas />
      <Arsenal />
      <section className="promo-section promo-cta" aria-label="Jugar gratis">
        <p className="landing-kicker">GRATIS · ONLINE Y OFFLINE</p>
        <h2>Entra al <em>crucible</em></h2>
        <p className="promo-lede">Todas las arenas, todas las armas y la banda sonora completa, gratis. Los diseños de armas del Arsenal son opcionales.</p>
        <div className="promo-cta-actions">
          <button type="button" className="landing-buy" onClick={onBuy}>
            <span><strong>JUGAR GRATIS</strong><small>ONLINE · TODAS LAS ARENAS · SIN REGISTRO</small></span>
            <ArrowRight />
          </button>
          {onStartDemo && (
            <button type="button" className="landing-demo" onClick={onStartDemo}>
              <Gamepad2 aria-hidden="true" /> JUGAR OFFLINE CONTRA BOTS
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

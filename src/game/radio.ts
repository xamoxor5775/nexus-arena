import { debugSpool } from "@/lib/debug-spool";

export type RadioTrack = { title: string; src: string };

const STORAGE_KEY = "nexus-arena-radio-v1";

const FALLBACK: RadioTrack[] = [
  { title: "Acceso al Crucible", src: "/media/acceso-al-crucible.mp3" },
  { title: "Puro Headshot", src: "/media/puro-headshot.mp3" },
  { title: "Pulso Letal", src: "/media/pulso-letal.mp3" },
];

function titleFromSrc(src: string) {
  const file = src.split("/").pop()?.replace(/\.mp3$/i, "") ?? "Tema";
  return file.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function uniqueTracks(list: RadioTrack[]) {
  const seen = new Set<string>();
  const out: RadioTrack[] = [];
  for (const track of list) {
    const src = String(track.src || "").trim();
    if (!src || seen.has(src)) continue;
    seen.add(src);
    out.push({ title: String(track.title || titleFromSrc(src)), src });
  }
  return out;
}

async function loadTracks(): Promise<RadioTrack[]> {
  const found: RadioTrack[] = [...FALLBACK];
  try {
    const res = await fetch("/media/playlist.json", { cache: "no-store" });
    if (res.ok) {
      const body = (await res.json()) as RadioTrack[];
      if (Array.isArray(body)) found.push(...body);
    }
  } catch {
    /* use fallback */
  }
  const list = uniqueTracks(found);
  return list.length ? list : FALLBACK;
}

type Listener = () => void;

class ArenaRadio {
  tracks: RadioTrack[] = FALLBACK;
  index = 0;
  playing = false;
  volume = 0.28;
  private el: HTMLAudioElement | null = null;
  private listeners = new Set<Listener>();
  private loaded = false;
  private fails = 0;

  snapshot() {
    const track = this.tracks[this.index] ?? this.tracks[0]!;
    return {
      title: track?.title ?? "Sin tema",
      index: this.index,
      total: this.tracks.length,
      playing: this.playing,
    };
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }

  private persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ index: this.index, playing: this.playing }));
    } catch {
      /* ignore */
    }
  }

  private attach() {
    if (this.el) return this.el;
    const el = new Audio();
    el.preload = "auto";
    el.volume = this.volume;
    el.addEventListener("ended", () => this.next());
    el.addEventListener("playing", () => {
      this.fails = 0;
      this.playing = true;
      this.emit();
    });
    el.addEventListener("error", () => {
      this.fails += 1;
      debugSpool.warn("radio", "no se pudo cargar el tema", { src: this.tracks[this.index]?.src, fails: this.fails });
      if (this.fails >= this.tracks.length) {
        this.playing = false;
        this.emit();
        return;
      }
      this.next();
    });
    this.el = el;
    return el;
  }

  async boot() {
    if (this.loaded) return;
    this.loaded = true;
    this.tracks = await loadTracks();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { index?: number; playing?: boolean };
        if (typeof saved.index === "number") this.index = Math.max(0, saved.index % this.tracks.length);
      }
    } catch {
      /* ignore */
    }
    this.apply();
    this.emit();
  }

  setVolume(master: number) {
    this.volume = Math.max(0, Math.min(0.55, master * 0.38));
    if (this.el) this.el.volume = this.volume;
  }

  private apply() {
    const el = this.attach();
    const track = this.tracks[this.index] ?? this.tracks[0];
    if (!track) return;
    const abs = new URL(track.src, window.location.origin).href;
    if (el.src !== abs) el.src = track.src;
  }

  async play() {
    await this.boot();
    const el = this.attach();
    this.apply();
    try {
      await el.play();
      this.playing = true;
    } catch {
      this.playing = false;
    }
    this.persist();
    this.emit();
  }

  pause() {
    this.el?.pause();
    this.playing = false;
    this.persist();
    this.emit();
  }

  toggle() {
    if (this.playing) this.pause();
    else void this.play();
  }

  next() {
    if (!this.tracks.length) return;
    this.index = (this.index + 1) % this.tracks.length;
    this.persist();
    if (this.playing) void this.play();
    else {
      this.apply();
      this.emit();
    }
  }

  prev() {
    if (!this.tracks.length) return;
    this.index = (this.index - 1 + this.tracks.length) % this.tracks.length;
    this.persist();
    if (this.playing) void this.play();
    else {
      this.apply();
      this.emit();
    }
  }
}

export const arenaRadio = new ArenaRadio();

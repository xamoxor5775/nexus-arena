import * as THREE from "three";
import type { ArenaId, ItemKind, WeaponId } from "./types";

THREE.Cache.enabled = true;
const loader = new THREE.TextureLoader();
const texCache = new Map<string, THREE.Texture>();

export function isLoDevice() {
  return typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches || window.innerWidth < 720 || (navigator.hardwareConcurrency || 8) <= 4);
}

/** Anisotropic filtering for mipmapped surfaces. The quality preset updates this. */
let anisoLevel = 4;
if (typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches || window.innerWidth < 720 || (navigator.hardwareConcurrency || 8) <= 4)) {
  anisoLevel = 1;
}
export function setTextureAnisotropy(level: number) {
  const next = Math.max(1, Math.round(level));
  if (next === anisoLevel) return;
  anisoLevel = next;
  for (const tex of texCache.values()) {
    if (tex.generateMipmaps && tex.minFilter !== THREE.NearestFilter && tex.anisotropy !== next) tex.anisotropy = next;
  }
}

let hitchEma = 16.6;
export function noteGpuFrame(dt: number) {
  hitchEma = hitchEma * 0.88 + Math.min(50, dt * 1000) * 0.12;
}
export function hitchMs() {
  return hitchEma;
}
export function isStruggling() {
  return hitchEma > 18.5;
}

export function skySphereGeo() {
  const lo = isLoDevice();
  return new THREE.SphereGeometry(240, lo ? 24 : 32, lo ? 16 : 20);
}

/**
 * Swap a texture's image for one of a different size. three.js keys GPU storage
 * by `texture.source`; with WebGL2 that storage is immutable (texStorage2D), so
 * assigning a bigger image to an already-uploaded source makes three call
 * texSubImage2D past the old bounds (GL_INVALID_VALUE "Offset overflows texture
 * dimensions") and the GPU keeps the old pixels. Dropping the GL texture and
 * giving the texture a fresh Source forces a correctly sized allocation.
 */
function replaceTexImage(tex: THREE.Texture, image: unknown) {
  tex.dispose();
  tex.source = new THREE.TextureSource(image);
  tex.needsUpdate = true;
}

function downscaleTex(tex: THREE.Texture, maxEdge: number) {
  const img = tex.image as { width?: number; height?: number } | undefined;
  if (!img?.width || !img.height || typeof document === "undefined") return;
  const edge = Math.max(img.width, img.height);
  if (edge <= maxEdge) return;
  const scale = maxEdge / edge;
  const w = Math.max(64, Math.round(img.width * scale));
  const h = Math.max(64, Math.round(img.height * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img as CanvasImageSource, 0, 0, w, h);
  replaceTexImage(tex, c);
}

function configure(tex: THREE.Texture, wrap: THREE.Wrapping, repeatX: number, repeatY: number, aniso: number) {
  tex.wrapS = tex.wrapT = wrap;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = aniso;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  return tex;
}

function makeCanvas(size: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return c;
}

function fromCanvas(c: HTMLCanvasElement, repeatX: number, repeatY: number): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  configure(tex, THREE.RepeatWrapping, repeatX, repeatY, anisoLevel);
  tex.needsUpdate = true;
  return tex;
}

/** Agua cian con ondas: se desplaza en el Laberinto. */
export function mazeWaterTex(repeatX = 3.2, repeatY = 3.2): THREE.Texture {
  const key = `proc:maze-water:${repeatX}:${repeatY}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const size = isLoDevice() ? 128 : 256;
  const c = makeCanvas(size);
  if (!c) {
    const tex = new THREE.Texture();
    texCache.set(key, tex);
    return tex;
  }
  const ctx = c.getContext("2d")!;
  const base = ctx.createLinearGradient(0, 0, size, size);
  base.addColorStop(0, "#063a48");
  base.addColorStop(0.45, "#0a6a7a");
  base.addColorStop(1, "#042830");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 9; i++) {
    const cx = (i * 73 + 28) % size;
    const cy = (i * 51 + 40) % size;
    const rad = 18 + (i % 4) * 10;
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, rad);
    g.addColorStop(0, "rgba(180, 255, 255, 0.55)");
    g.addColorStop(0.35, "rgba(40, 210, 230, 0.22)");
    g.addColorStop(1, "rgba(10, 80, 90, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let r = 0; r < 7; r++) {
    ctx.beginPath();
    ctx.strokeStyle = `rgba(170, 255, 255, ${0.18 + (r % 3) * 0.06})`;
    ctx.lineWidth = 2;
    const rad = 16 + r * 16;
    ctx.arc(size * 0.5, size * 0.5, rad, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc((r * 37 + 20) % size, (r * 53 + 48) % size, 10 + r * 3, 0, Math.PI * 2);
    ctx.stroke();
  }
  const tex = fromCanvas(c, repeatX, repeatY);
  texCache.set(key, tex);
  return tex;
}

/** Lava en fisuras: una textura RGBA pequeña que se desplaza sobre el suelo, sin shader ni geometría extra. */
export function laveCrackTex(repeatX = 12, repeatY = 9): THREE.Texture {
  const key = `proc:lave-cracks:${repeatX}:${repeatY}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const size = isLoDevice() ? 128 : 256;
  const c = makeCanvas(size);
  if (!c) {
    const tex = new THREE.Texture();
    texCache.set(key, tex);
    return tex;
  }
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);

  const crack = (seed: number, y: number, span: number) => {
    ctx.save();
    ctx.beginPath();
    for (let x = -12; x <= size + 12; x += 18) {
      const wave = Math.sin((x + seed * 31) * 0.085) * 8 + Math.sin((x + seed * 9) * 0.19) * 3;
      const py = y + wave + Math.sin((x + seed * 17) * 0.035) * span;
      if (x === -12) ctx.moveTo(x, py);
      else ctx.lineTo(x, py);
    }
    ctx.strokeStyle = "rgba(255, 46, 8, 0.76)";
    ctx.shadowColor = "rgba(255, 78, 12, 0.95)";
    ctx.shadowBlur = 10;
    ctx.lineWidth = 3.5;
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 206, 84, 0.92)";
    ctx.shadowBlur = 3;
    ctx.lineWidth = 0.82;
    ctx.stroke();
    ctx.restore();
  };

  for (let row = -1; row < 10; row++) crack(row, row * 30 + 9, (row % 3) * 1.8);
  for (let col = 0; col < 7; col++) {
    ctx.save();
    ctx.translate(col * 43 + 8, 0);
    ctx.rotate((col % 2 ? -1 : 1) * 0.22);
    crack(col + 13, 110 + (col % 3) * 21, 4);
    ctx.restore();
  }

  for (let i = 0; i < 10; i++) {
    const x = (i * 71 + 29) % size;
    const y = (i * 47 + 71) % size;
    const glow = ctx.createRadialGradient(x, y, 1, x, y, 18 + (i % 3) * 3);
    glow.addColorStop(0, "rgba(255, 226, 110, 0.72)");
    glow.addColorStop(0.26, "rgba(255, 80, 18, 0.38)");
    glow.addColorStop(1, "rgba(255, 34, 8, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, 19 + (i % 3) * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = fromCanvas(c, repeatX, repeatY);
  texCache.set(key, tex);
  return tex;
}

function fillNoise(ctx: CanvasRenderingContext2D, size: number, amp: number) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amp;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
}

/** Acero cepillado procedural: no depende de JPG en el servidor. */
export function gunMetalTex(repeatX = 2.4, repeatY = 1.6): THREE.Texture {
  const key = `proc:gunmetal:${repeatX}:${repeatY}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const size = isLoDevice() ? 128 : 256;
  const c = makeCanvas(size);
  if (!c) {
    const tex = new THREE.Texture();
    texCache.set(key, tex);
    return tex;
  }
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#9aa4b0";
  ctx.fillRect(0, 0, size, size);
  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, "#c5ccd4");
  g.addColorStop(0.35, "#8d97a3");
  g.addColorStop(0.7, "#b7c0c9");
  g.addColorStop(1, "#7a8490");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  ctx.globalAlpha = 0.28;
  for (let y = 0; y < size; y += 2) {
    ctx.strokeStyle = y % 6 === 0 ? "#5c6570" : "#d7dee6";
    ctx.lineWidth = y % 8 === 0 ? 1.4 : 0.6;
    ctx.beginPath();
    ctx.moveTo(0, y + Math.sin(y * 0.2) * 0.6);
    ctx.lineTo(size, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.18;
  for (let i = 0; i < 18; i++) {
    ctx.fillStyle = i % 2 ? "#eef3f8" : "#4a515a";
    ctx.fillRect(Math.random() * size, Math.random() * size, 8 + Math.random() * 40, 1 + Math.random() * 2);
  }
  ctx.globalAlpha = 1;
  fillNoise(ctx, size, 22);
  const tex = fromCanvas(c, repeatX, repeatY);
  texCache.set(key, tex);
  return tex;
}

/** Goma / polímero de grip: rombos y grano. */
export function polymerTex(repeatX = 1.8, repeatY = 1.8): THREE.Texture {
  const key = `proc:polymer:${repeatX}:${repeatY}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const size = isLoDevice() ? 128 : 256;
  const c = makeCanvas(size);
  if (!c) {
    const tex = new THREE.Texture();
    texCache.set(key, tex);
    return tex;
  }
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#3c4148";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#2a2e34";
  const step = 16;
  for (let y = 0; y < size; y += step) {
    for (let x = 0; x < size; x += step) {
      const ox = (y / step) % 2 === 0 ? 0 : step / 2;
      ctx.beginPath();
      ctx.moveTo(x + ox + step / 2, y + 2);
      ctx.lineTo(x + ox + step - 2, y + step / 2);
      ctx.lineTo(x + ox + step / 2, y + step - 2);
      ctx.lineTo(x + ox + 2, y + step / 2);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.strokeStyle = "#5a616a";
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.35;
  for (let y = 0; y < size; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  fillNoise(ctx, size, 16);
  const tex = fromCanvas(c, repeatX, repeatY);
  texCache.set(key, tex);
  return tex;
}

/** Paneles de arma pixelados: detalle nítido de baja resolución para primera persona. */
export function pixelWeaponTex(kind: "steel" | "grip" | "heat", repeatX = 2, repeatY = 2): THREE.Texture {
  const key = `proc:pixel-weapon:${kind}:${repeatX}:${repeatY}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const size = 128;
  const c = makeCanvas(size);
  if (!c) {
    const tex = new THREE.Texture();
    texCache.set(key, tex);
    return tex;
  }
  const ctx = c.getContext("2d")!;
  const colors = kind === "steel"
    ? { base: "#6e7884", panel: "#aeb9c4", dark: "#313a45", hot: "#dbeaff" }
    : kind === "grip"
      ? { base: "#27313a", panel: "#45525c", dark: "#111820", hot: "#8296a3" }
      : { base: "#4a1517", panel: "#c3402c", dark: "#210b11", hot: "#ffe88c" };
  ctx.fillStyle = colors.base;
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 16) {
    for (let x = 0; x < size; x += 16) {
      const alt = (x / 16 + y / 16) % 2 === 0;
      ctx.fillStyle = alt ? colors.panel : colors.dark;
      ctx.fillRect(x + 2, y + 2, 12, 12);
      ctx.fillStyle = alt ? colors.dark : colors.panel;
      ctx.fillRect(x + 4, y + 4, 8, 2);
    }
  }
  ctx.fillStyle = colors.dark;
  for (let y = 0; y < size; y += 32) ctx.fillRect(0, y, size, 4);
  ctx.fillStyle = colors.hot;
  for (let x = 8; x < size; x += 32) {
    ctx.fillRect(x, 0, 4, size);
    ctx.fillRect(x - 4, 16, 12, 4);
  }
  if (kind === "heat") {
    ctx.fillStyle = "#fff6be";
    for (let y = 10; y < size; y += 24) ctx.fillRect(0, y, size, 3);
  }
  const tex = fromCanvas(c, repeatX, repeatY);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  texCache.set(key, tex);
  return tex;
}

let fallbackSurface: HTMLCanvasElement | null = null;
function neutralSurface(): HTMLCanvasElement | null {
  if (fallbackSurface) return fallbackSurface;
  const canvas = makeCanvas(32);
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return null;
  ctx.fillStyle = "#929ca5";
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillStyle = "#86919a";
  ctx.fillRect(0, 0, 32, 1);
  ctx.fillRect(0, 0, 1, 32);
  fallbackSurface = canvas;
  return canvas;
}

export function loadTex(url: string, repeatX: number, repeatY = repeatX): THREE.Texture {
  const key = `${url}:${repeatX}:${repeatY}`;
  const hit = texCache.get(key);
  if (hit) {
    if (hit.userData.loadState !== "error" || Date.now() - hit.userData.failedAt < 10000) return hit;
    // Retry after a failed request when a later arena requests the surface again.
    texCache.delete(key);
  }
  const tex: THREE.Texture = loader.load(url, (ready) => {
    ready.userData.loadState = "ready";
    // The 32px neutral placeholder may already be on the GPU: re-allocate for the real image.
    if (ready.userData.placeholder) {
      ready.userData.placeholder = false;
      replaceTexImage(ready, ready.image);
    }
    if (isLoDevice()) {
      downscaleTex(ready, 1024);
      ready.anisotropy = 1;
    }
  }, undefined, () => {
    tex.userData.loadState = "error";
    tex.userData.failedAt = Date.now();
    console.warn(`[arena-texture] ${url}: neutral fallback active`);
  });
  tex.userData.url = url;
  tex.userData.loadState = "loading";
  const fallback = neutralSurface();
  if (fallback && tex.userData.loadState === "loading") {
    tex.image = fallback;
    tex.needsUpdate = true;
    tex.userData.placeholder = true;
  }
  configure(tex, THREE.RepeatWrapping, repeatX, repeatY, anisoLevel);
  texCache.set(key, tex);
  return tex;
}

/** Wait for textures already requested by the active arena without blocking forever. */
export async function waitForTextureLoads(
  timeoutMs = 6500,
  onProgress?: (value: number) => void,
): Promise<void> {
  const startedAt = performance.now();
  while (true) {
    const requested = [...texCache.values()].filter((tex) => Boolean(tex.userData.url));
    const pending = requested.filter((tex) => tex.userData.loadState === "loading").length;
    onProgress?.(requested.length ? (requested.length - pending) / requested.length : 1);
    if (pending === 0 || performance.now() - startedAt >= timeoutMs) return;
    await new Promise<void>((resolve) => window.setTimeout(resolve, 60));
  }
}

/** Same UV density on desktop and mobile; only image resolution changes. */
export function loadArenaSurface(arena: ArenaId, repeatX = 1, repeatY = repeatX): THREE.Texture {
  return loadTex(`/textures/arenas/${arena}-surface-v3${isLoDevice() ? "-mobile" : ""}.webp`, repeatX, repeatY);
}

/** Paneles PBR por arma: body = skin propia, el resto son placas de acento del mismo set. */
export type WeaponSlot = "body" | "dark" | "chrome" | "grip";
const WEAPON_PLATE: Record<WeaponId, Record<WeaponSlot, string>> = {
  pulse: {
    body: "pulse-surface-v2.webp",
    dark: "panel-octagon.jpg",
    chrome: "circuit-cyan.jpg",
    grip: "ammo-gold.jpg",
  },
  scatter: {
    body: "scatter-surface-v2.webp",
    dark: "hazard-red.jpg",
    chrome: "missiles.jpg",
    grip: "hazard-red.jpg",
  },
  torpedo: {
    body: "torpedo-surface-v2.webp",
    dark: "ember-core.jpg",
    chrome: "missiles.jpg",
    grip: "ammo-gold.jpg",
  },
  lance: {
    body: "lance-surface-v2.webp",
    dark: "neon-violet.jpg",
    chrome: "bars-teal.jpg",
    grip: "pixel-ion.jpg",
  },
  ion: {
    body: "ion-surface-v2.webp",
    dark: "pixel-ion.jpg",
    chrome: "bars-teal.jpg",
    grip: "panel-cyan.jpg",
  },
  fauces: {
    body: "fauces-surface-v1.webp",
    dark: "fauces-dark-v1.webp",
    chrome: "fauces-chrome-v1.webp",
    grip: "fauces-grip-v1.webp",
  },
  knife: {
    body: "knife-surface-v1.webp",
    dark: "fauces-dark-v1.webp",
    chrome: "knife-surface-v1.webp",
    grip: "fauces-grip-v1.webp",
  },
  bate: {
    body: "bat-surface-v1.webp",
    dark: "fauces-dark-v1.webp",
    chrome: "bat-surface-v1.webp",
    grip: "fauces-grip-v1.webp",
  },
  martillo: {
    body: "hammer-surface-v1.webp",
    dark: "fauces-dark-v1.webp",
    chrome: "hammer-surface-v1.webp",
    grip: "fauces-grip-v1.webp",
  },
};

export function weaponPlateFile(id: WeaponId, slot: WeaponSlot = "body") {
  return WEAPON_PLATE[id][slot];
}

export function loadWeaponTex(id: WeaponId, repeatX = 2.2, repeatY = 2.2): THREE.Texture {
  return loadTex(`/textures/weapons/${weaponPlateFile(id, "body")}`, repeatX, repeatY);
}

const BOT_FACE_COUNT = 4;
let botFaceBag: number[] = [];

export function takeBotFace(): number {
  if (!botFaceBag.length) {
    botFaceBag = [0, 1, 2, 3];
    for (let i = botFaceBag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const a = botFaceBag[i]!;
      botFaceBag[i] = botFaceBag[j]!;
      botFaceBag[j] = a;
    }
  }
  return botFaceBag.pop()!;
}

export function botFaceTex(faceId: number): THREE.Texture {
  const n = ((faceId % BOT_FACE_COUNT) + BOT_FACE_COUNT) % BOT_FACE_COUNT;
  return loadIconTex(`/textures/bots/cara-${n + 1}.jpg`);
}

export function loadSummitTex(
  kind: "grass" | "red-bark" | "red-canopy",
  repeatX = 1,
  repeatY = repeatX,
): THREE.Texture {
  if (isLoDevice()) return loadTex(`/textures/summit/${kind}-mobile.webp`, repeatX, repeatY);
  if (kind === "grass") return loadTex(`/textures/summit/${kind}-2k.webp`, repeatX, repeatY);
  return loadTex(`/textures/summit/${kind}.jpg`, repeatX, repeatY);
}

export function smokePuffTex(): THREE.Texture {
  const key = "proc:smoke-puff";
  const hit = texCache.get(key);
  if (hit) return hit;
  const size = 64;
  const c = makeCanvas(size);
  if (!c) {
    const tex = new THREE.Texture();
    texCache.set(key, tex);
    return tex;
  }
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, "rgba(255, 210, 160, 0.55)");
  g.addColorStop(0.28, "rgba(90, 70, 60, 0.42)");
  g.addColorStop(0.62, "rgba(28, 22, 20, 0.22)");
  g.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = fromCanvas(c, 1, 1);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  texCache.set(key, tex);
  return tex;
}

export type PozoSurfaceKind = "industrial-teal" | "volcanic-lava" | "alien-forest";

export function loadPozoSurface(kind: PozoSurfaceKind, repeatX = 3, repeatY = repeatX): THREE.Texture {
  const file = isLoDevice()
    ? `/textures/surfaces/floor-${kind}-mobile.webp`
    : `/textures/surfaces/floor-${kind}-v1.webp`;
  return loadTex(file, repeatX, repeatY);
}

export function loadArenaMaps() {
  const mobile = isLoDevice() ? "-mobile" : "";
  return {
    floor: loadTex(`/textures/pozo/floor-v4${mobile}.webp`, 12, 12),
    wall: loadTex(`/textures/pozo/wall-v4${mobile}.webp`, 12, 3),
    plate: loadTex(`/textures/pozo/tower-armor-v1${mobile}.webp`, 3, 3),
    beam: loadTex(`/textures/pozo/tower-armor-v1${mobile}.webp`, 1, 3),
    tower: loadTex(`/textures/pozo/tower-armor-v1${mobile}.webp`, 2, 5),
    towerTip: loadTex(`/textures/pozo/tower-tip-v1${mobile}.webp`, 1.5, 2.5),
    parachute: loadTex(`/textures/pozo/parachute-v1${mobile}.webp`, 1, 1),
    pipes: loadTex("/textures/pipes.jpg", 1.6, 1.4),
    hazard: loadTex("/textures/hazard.jpg", 6, 1.2),
    console: loadTex("/textures/console.jpg", 2.8, 1.2),
    rune: loadTex("/textures/rune.jpg", 1, 1),
    ruin: loadTex("/textures/ruin.jpg", 6, 2.2),
    armor: loadTex("/textures/armor.jpg", 2.6, 2.6),
    skull: loadTex("/textures/skull.jpg", 1, 1),
  };
}

export function pozoParachuteTexture() {
  const mobile = isLoDevice() ? "-mobile" : "";
  return loadTex(`/textures/pozo/parachute-v1${mobile}.webp`, 1, 1);
}

export function loadSkyTex(url: string, cache = true): THREE.Texture {
  const hit = cache ? texCache.get(url) : undefined;
  if (hit) return hit;
  const tex = loader.load(url, (ready) => {
    if (isLoDevice()) {
      downscaleTex(ready, 1024);
      ready.anisotropy = 1;
    }
  });
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisoLevel;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  if (cache) texCache.set(url, tex);
  return tex;
}

/** Un solo panorama residente: 4K en escritorio (60 fps) y 2K en móviles. */
const SPACE_SKY_FILE: Record<"pozo" | "cumbre" | "lave" | "luna", string> = {
  pozo: "sapphire",
  cumbre: "ocean-cumbre",
  lave: "ruby",
  luna: "sapphire",
};
let activeSpaceSky: { url: string; texture: THREE.Texture } | null = null;

export function loadSpaceSky(kind: "pozo" | "cumbre" | "lave" | "luna"): THREE.Texture {
  const size = isLoDevice() ? "mobile" : "4k";
  const url = `/textures/space/space-${SPACE_SKY_FILE[kind]}-${size}.webp`;
  if (activeSpaceSky?.url === url) return activeSpaceSky.texture;
  if (activeSpaceSky) {
    activeSpaceSky.texture.dispose();
    texCache.delete(activeSpaceSky.url);
    THREE.Cache.remove(activeSpaceSky.url);
  }
  const texture = loadSkyTex(url);
  activeSpaceSky = { url, texture };
  return texture;
}

export function padTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  const s = 128;
  ctx.fillStyle = "#14322e";
  ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = "#7ff5e4";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s * 0.4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s * 0.24, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#b8fff4";
  ctx.beginPath();
  ctx.moveTo(s / 2, s * 0.26);
  ctx.lineTo(s * 0.64, s * 0.7);
  ctx.lineTo(s * 0.36, s * 0.7);
  ctx.closePath();
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Icono de pickup o HUD: clamp para que el arte no se tilee en la placa. */
export function loadIconTex(url: string): THREE.Texture {
  const hit = texCache.get(url);
  if (hit) return hit;
  const tex = loader.load(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisoLevel;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  texCache.set(url, tex);
  return tex;
}

/** Mapas compactos para diferenciar cada pickup flotante sin compartir un icono genérico. */
export function pickupTexture(kind: Exclude<ItemKind, "armor" | "ammo">): THREE.Texture {
  return loadIconTex(`/textures/pickups/${kind}-icon.jpg`);
}

export function jumpPadTex(): THREE.Texture {
  return loadIconTex("/textures/pads/super-salto.jpg");
}

export function portalTex(): THREE.Texture {
  return loadIconTex("/textures/portal-flotante.jpg");
}

/** Etiqueta pixelada para cajas de suministros: reutilizada entre pickups sin nuevos archivos descargables. */
export function supplyCrateTexture(kind: "armor" | "ammo" | "weapon"): THREE.Texture {
  const key = `proc:supply-crate:${kind}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const size = 128;
  const c = makeCanvas(size);
  if (!c) {
    const tex = new THREE.Texture();
    texCache.set(key, tex);
    return tex;
  }
  const ctx = c.getContext("2d")!;
  const colors = kind === "armor"
    ? { base: "#174d82", panel: "#2d8fda", edge: "#b5ecff", mark: "#e4f8ff" }
    : kind === "ammo"
      ? { base: "#654519", panel: "#bd8133", edge: "#ffe09a", mark: "#fff3c9" }
      : { base: "#57212b", panel: "#b8455c", edge: "#ffc2cd", mark: "#fff0f2" };
  ctx.fillStyle = colors.base;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = colors.panel;
  ctx.fillRect(8, 8, size - 16, size - 16);
  ctx.fillStyle = colors.base;
  for (let y = 17; y < size - 10; y += 22) {
    for (let x = 14; x < size - 10; x += 26) ctx.fillRect(x, y, 16, 7);
  }
  ctx.strokeStyle = colors.edge;
  ctx.lineWidth = 7;
  ctx.strokeRect(7, 7, size - 14, size - 14);
  ctx.lineWidth = 3;
  ctx.strokeRect(20, 20, size - 40, size - 40);
  ctx.fillStyle = colors.mark;
  if (kind === "armor") {
    ctx.fillRect(52, 28, 24, 72);
    ctx.fillRect(35, 48, 58, 24);
  } else if (kind === "ammo") {
    for (let i = 0; i < 3; i++) ctx.fillRect(31 + i * 23, 38, 12, 52);
  } else {
    ctx.beginPath();
    ctx.moveTo(40, 35);
    ctx.lineTo(89, 64);
    ctx.lineTo(40, 93);
    ctx.closePath();
    ctx.fill();
  }
  fillNoise(ctx, size, 10);
  const tex = fromCanvas(c, 1, 1);
  tex.anisotropy = anisoLevel;
  texCache.set(key, tex);
  return tex;
}

/** Banda técnica de baja resolución para munición visible en vuelo. */
export function projectileTexture(kind: "rocket" | "ion"): THREE.Texture {
  const key = `proc:projectile:${kind}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const size = 64;
  const c = makeCanvas(size);
  if (!c) {
    const tex = new THREE.Texture();
    texCache.set(key, tex);
    return tex;
  }
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = kind === "rocket" ? "#562515" : "#12546a";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = kind === "rocket" ? "#d7592f" : "#55dce8";
  for (let x = 2; x < size; x += 14) ctx.fillRect(x, 0, 7, size);
  ctx.fillStyle = "#f5edd2";
  ctx.globalAlpha = 0.85;
  for (let y = 4; y < size; y += 16) ctx.fillRect(0, y, size, 3);
  ctx.globalAlpha = 1;
  fillNoise(ctx, size, 10);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  texCache.set(key, tex);
  return tex;
}

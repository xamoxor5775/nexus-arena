import * as THREE from "three";

THREE.Cache.enabled = true;
const loader = new THREE.TextureLoader();
const texCache = new Map<string, THREE.Texture>();

function loDevice() {
  return typeof window !== "undefined" && (window.innerWidth < 720 || (navigator.hardwareConcurrency || 8) <= 4);
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

const TINTS: Record<string, [string, string]> = {
  floor: ["#14181c", "#2ee0c8"],
  plate: ["#1a1e24", "#8a9098"],
  beam: ["#2a1810", "#c45a28"],
  pipes: ["#161a1c", "#3ae8d2"],
  hazard: ["#0c1012", "#2ee0c8"],
  console: ["#101418", "#7af0e0"],
  rune: ["#0c1416", "#7af0ff"],
  ruin: ["#1c100c", "#ff6a45"],
  armor: ["#1a1e22", "#9aa2aa"],
  skull: ["#1a100c", "#ff5a28"],
  gunmetal: ["#2a3036", "#c8d0d6"],
  polymer: ["#3a3c34", "#8a8c80"],
  visor: ["#043038", "#7af0ff"],
};

function hash32(n: number) {
  n |= 0;
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  return (n ^ (n >>> 16)) >>> 0;
}

/** Tileable metal so a missing JPEG never leaves a black MeshStandardMaterial. */
function proceduralMap(url: string, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const key = (url.split("/").pop() ?? "").replace(/\.[^.]+$/, "");
  const [base, accent] = TINTS[key] ?? ["#16181c", "#8a9098"];
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  const seed = hash32(key.split("").reduce((a, ch) => a + ch.charCodeAt(0), 0) || 1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = hash32(seed + x * 374761 + y * 668265) / 4294967295;
      const i = (y * w + x) * 4;
      const k = 0.72 + n * 0.28;
      d[i] = Math.round(d[i] * k);
      d[i + 1] = Math.round(d[i + 1] * k);
      d[i + 2] = Math.round(d[i + 2] * k);
    }
  }
  ctx.putImageData(id, 0, 0);
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 2;
  const cell = Math.max(16, Math.floor(w / 4));
  for (let x = 0; x <= w; x += cell) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, h);
    ctx.stroke();
  }
  for (let y = 0; y <= h; y += cell) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(w, y + 0.5);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return c;
}

function skyFallback(url: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  const sky = url.includes("horizon");
  c.width = sky ? 1024 : 512;
  c.height = sky ? 256 : 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, c.height);
  g.addColorStop(0, "#8a2208");
  g.addColorStop(0.45, "#c44a18");
  g.addColorStop(1, "#1a0806");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);
  if (sky) {
    ctx.fillStyle = "#120806";
    for (let i = 0; i < 18; i++) {
      const x = (i / 18) * c.width;
      const bw = c.width / 28;
      const bh = 40 + ((hash32(i * 97) % 80) as number);
      ctx.fillRect(x, c.height - bh, bw, bh);
    }
  }
  return c;
}

function applyImage(tex: THREE.Texture, img: HTMLImageElement) {
  const src = tex.image as HTMLCanvasElement;
  src.width = img.naturalWidth || img.width || src.width;
  src.height = img.naturalHeight || img.height || src.height;
  const ctx = src.getContext("2d");
  if (!ctx) return;
  ctx.drawImage(img, 0, 0, src.width, src.height);
  tex.needsUpdate = true;
}

function hydrate(tex: THREE.Texture, url: string) {
  loader.load(
    url,
    (loaded) => applyImage(tex, loaded.image as HTMLImageElement),
    undefined,
    () => {
      console.warn(`[nexus] missing ${url}; using procedural fallback`);
    },
  );
}

export function loadTex(url: string, repeatX: number, repeatY = repeatX): THREE.Texture {
  const hit = texCache.get(url);
  if (hit) return hit;
  const tex = new THREE.Texture(proceduralMap(url, 256, 256));
  tex.needsUpdate = true;
  configure(tex, THREE.RepeatWrapping, repeatX, repeatY, loDevice() ? 2 : 4);
  hydrate(tex, url);
  texCache.set(url, tex);
  return tex;
}

export function loadArenaMaps() {
  return {
    floor: loadTex("/textures/floor.jpg", 18, 18),
    plate: loadTex("/textures/plate.jpg", 5, 5),
    beam: loadTex("/textures/beam.jpg", 1.1, 2.4),
    pipes: loadTex("/textures/pipes.jpg", 1.6, 1.4),
    hazard: loadTex("/textures/hazard.jpg", 6, 1.2),
    console: loadTex("/textures/console.jpg", 2.8, 1.2),
    rune: loadTex("/textures/rune.jpg", 1, 1),
    ruin: loadTex("/textures/ruin.jpg", 6, 2.2),
    armor: loadTex("/textures/armor.jpg", 2.6, 2.6),
    skull: loadTex("/textures/skull.jpg", 1, 1),
  };
}

export function loadSkyTex(url: string): THREE.Texture {
  const hit = texCache.get(url);
  if (hit) return hit;
  const tex = new THREE.Texture(skyFallback(url));
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 1;
  tex.wrapS = url.includes("horizon") ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  hydrate(tex, url);
  texCache.set(url, tex);
  return tex;
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

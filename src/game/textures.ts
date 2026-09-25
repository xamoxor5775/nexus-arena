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

function makeCanvas(size: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return c;
}

function fromCanvas(c: HTMLCanvasElement, repeatX: number, repeatY: number): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  configure(tex, THREE.RepeatWrapping, repeatX, repeatY, loDevice() ? 2 : 4);
  tex.needsUpdate = true;
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
  const size = 256;
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
  const size = 256;
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

export function loadTex(url: string, repeatX: number, repeatY = repeatX): THREE.Texture {
  const hit = texCache.get(url);
  if (hit) return hit;
  const tex = loader.load(url);
  configure(tex, THREE.RepeatWrapping, repeatX, repeatY, loDevice() ? 2 : 4);
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
  const tex = loader.load(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 1;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
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

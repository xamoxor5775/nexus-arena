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

/** Lava en fisuras: una textura RGBA pequeña que se desplaza sobre el suelo, sin shader ni geometría extra. */
export function laveCrackTex(repeatX = 12, repeatY = 9): THREE.Texture {
  const key = `proc:lave-cracks:${repeatX}:${repeatY}`;
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

export function loadTex(url: string, repeatX: number, repeatY = repeatX): THREE.Texture {
  const key = `${url}:${repeatX}:${repeatY}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const tex = loader.load(url);
  configure(tex, THREE.RepeatWrapping, repeatX, repeatY, loDevice() ? 2 : 4);
  texCache.set(key, tex);
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

/** Texturas pequeñas, reutilizadas por pickup: detalle visible sin descargar assets ni usar shaders extra. */
export function pickupTexture(kind: "health" | "rush"): THREE.Texture {
  const key = `proc:pickup:${kind}`;
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
  ctx.fillStyle = kind === "health" ? "#8bbfa4" : "#63d6dc";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = kind === "health" ? "#315746" : "#155d68";
  for (let y = 0; y < size; y += 18) {
    for (let x = 0; x < size; x += 18) {
      ctx.fillRect(x + 2, y + 2, 14, 14);
      ctx.fillStyle = kind === "health" ? "#6f9c84" : "#3299a5";
      ctx.fillRect(x + 4, y + 4, 10, 3);
      ctx.fillStyle = kind === "health" ? "#315746" : "#155d68";
    }
  }
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = "#f5fff6";
  if (kind === "health") {
    ctx.fillRect(53, 20, 22, 88);
    ctx.fillRect(20, 53, 88, 22);
  } else {
    for (let y = 13; y < 116; y += 28) {
      ctx.beginPath();
      ctx.moveTo(22, y);
      ctx.lineTo(89, y);
      ctx.lineTo(75, y + 12);
      ctx.lineTo(105, y + 12);
      ctx.lineTo(70, y + 28);
      ctx.lineTo(18, y + 28);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  fillNoise(ctx, size, 12);
  const tex = fromCanvas(c, 1, 1);
  tex.anisotropy = loDevice() ? 2 : 4;
  texCache.set(key, tex);
  return tex;
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
  tex.anisotropy = loDevice() ? 2 : 4;
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

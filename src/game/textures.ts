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

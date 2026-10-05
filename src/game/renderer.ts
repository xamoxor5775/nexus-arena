import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { MELEE_ORDER, WEAPON_ORDER } from "./constants";
import { DynamicResolution, qualityPreset, type QualityId, type QualityPreset } from "./graphics";
import { isLoDevice, noteGpuFrame, setTextureAnisotropy } from "./textures";
import type { WeaponId } from "./types";
import { buildViewmodel } from "./viewmodel";
import { cancelWeaponPack } from "./weaponPack";
import { SKINS_CHANGED } from "@/skins/skins";

export type ArenaRenderer = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  gunScene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  gunCam: THREE.PerspectiveCamera;
  gunRoot: THREE.Group;
  guns: Map<WeaponId, THREE.Group>;
  resize: () => void;
  render: (drawGun: boolean) => void;
  noteFrame: (dt: number) => void;
  setWorldFov: (fov: number) => void;
  rebuildGuns: (accent: number) => void;
  setQuality: (id: QualityId) => void;
  applyQuality: () => void;
  qualityState: () => { preset: QualityId; scale: number; shadows: boolean; fps: number; msaa: boolean };
  dispose: () => void;
};

function mountGuns(gunRoot: THREE.Group, guns: Map<WeaponId, THREE.Group>, accent: number) {
  for (const id of [...WEAPON_ORDER, ...MELEE_ORDER]) {
    const g = buildViewmodel(id, accent);
    g.visible = false;
    guns.set(id, g);
    gunRoot.add(g);
  }
}

function dropGuns(gunRoot: THREE.Group, guns: Map<WeaponId, THREE.Group>) {
  for (const g of guns.values()) {
    cancelWeaponPack(g);
    gunRoot.remove(g);
    g.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      mesh.geometry?.dispose();
      if (mesh.userData.packMaterial) (mesh.material as THREE.Material).dispose();
    });
  }
  guns.clear();
}

export function createArenaRenderer(canvas: HTMLCanvasElement, fov: number, accent = 0x7af0ff, quality: QualityId = "auto"): ArenaRenderer {
  const lowPower = isLoDevice();
  const dpr = () => window.devicePixelRatio || 1;
  let preset: QualityPreset = qualityPreset(quality, dpr(), lowPower);
  const msaa = preset.msaa && !lowPower;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: msaa,
    powerPreference: "high-performance",
    alpha: false,
  });
  let dyn = new DynamicResolution(preset);
  let pixelRatio = preset.adaptive ? dyn.scale : preset.maxScale;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(canvas.clientWidth || 1, canvas.clientHeight || 1, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.autoClear = false;
  renderer.shadowMap.enabled = !lowPower && preset.shadows;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const gunScene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.05, 420);
  const gunCam = new THREE.PerspectiveCamera(50, 1, 0.08, 8);
  gunCam.layers.set(1);

  const gunRoot = new THREE.Group();
  gunRoot.scale.setScalar(1.28);
  gunScene.add(gunRoot);
  let pmrem: THREE.PMREMGenerator | null = null;
  let studio: THREE.WebGLRenderTarget | null = null;
  if (!lowPower) {
    pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    studio = pmrem.fromScene(room, 0.04);
    room.dispose();
    gunScene.environment = studio.texture;
    gunScene.environmentIntensity = 0.85;
  }
  const hemi = new THREE.HemisphereLight(0xfff4ea, 0x3a2a22, 0.95);
  const key = new THREE.DirectionalLight(0xfff6ea, 2.2);
  key.position.set(0.55, 1.35, 0.95);
  const gunLights: THREE.Light[] = [hemi, key];
  if (!lowPower) {
    const grim = new THREE.DirectionalLight(0xc8fff4, 1.2);
    grim.position.set(-1.6, 0.45, 0.15);
    const fill = new THREE.DirectionalLight(0xffb07a, 0.6);
    fill.position.set(0.15, -0.55, 0.7);
    const top = new THREE.DirectionalLight(0xfff8ee, 0.6);
    top.position.set(0.1, 1.7, 0.35);
    const rim = new THREE.PointLight(0xffe4c4, 1.4, 4.5, 1.4);
    rim.position.set(1.35, 0.28, 0.2);
    gunLights.push(grim, fill, top, rim);
  }
  for (const light of gunLights) {
    light.layers.enableAll();
    gunScene.add(light);
  }

  const guns = new Map<WeaponId, THREE.Group>();
  mountGuns(gunRoot, guns, accent);
  let gunAccent = accent;
  const rebuildGuns = (next: number) => {
    gunAccent = next;
    dropGuns(gunRoot, guns);
    mountGuns(gunRoot, guns, next);
  };
  // Weapon skins (ARSENAL): swap first-person models when the selection changes.
  const onSkins = () => rebuildGuns(gunAccent);
  window.addEventListener(SKINS_CHANGED, onSkins);

  const resize = () => {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    gunCam.aspect = w / Math.max(1, h);
    gunCam.updateProjectionMatrix();
  };

  const render = (drawGun: boolean) => {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    const bufW = Math.floor(w * renderer.getPixelRatio());
    const bufH = Math.floor(h * renderer.getPixelRatio());
    if (renderer.domElement.width !== bufW || renderer.domElement.height !== bufH) resize();
    renderer.clear();
    renderer.render(scene, camera);
    if (drawGun) {
      renderer.clearDepth();
      renderer.render(gunScene, gunCam);
    }
  };

  const setWorldFov = (next: number) => {
    camera.fov = next;
    camera.updateProjectionMatrix();
  };

  let lastFrameAt = 0;
  const setScale = (next: number) => {
    if (Math.abs(next - pixelRatio) < 0.01) return;
    pixelRatio = next;
    renderer.setPixelRatio(pixelRatio);
  };
  const setShadows = (on: boolean) => {
    const want = on && !lowPower;
    if (renderer.shadowMap.enabled === want) return;
    renderer.shadowMap.enabled = want;
    renderer.shadowMap.needsUpdate = true;
    scene.traverse((o) => {
      const l = o as THREE.DirectionalLight;
      if (l.isLight && l.shadow) l.shadow.needsUpdate = true;
    });
  };
  const noteFrame = (dt: number) => {
    noteGpuFrame(dt);
    const t = performance.now();
    const ms = lastFrameAt ? t - lastFrameAt : 0;
    lastFrameAt = t;
    if (!preset.adaptive) return;
    const d = dyn.frame(ms, t);
    if (!d) return;
    if (d.changed) setScale(d.scale);
    if (d.shadowChanged) setShadows(d.shadows);
  };

  const applyQuality = () => {
    setTextureAnisotropy(preset.anisotropy);
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    scene.traverse((o) => {
      const l = o as THREE.DirectionalLight | THREE.SpotLight;
      if (l.isLight && l.castShadow && l.shadow) {
        const size = lowPower ? 512 : preset.shadowMap;
        if (l.shadow.mapSize.x !== size) {
          l.shadow.mapSize.set(size, size);
          l.shadow.map?.dispose();
          l.shadow.map = null;
        }
        l.shadow.radius = lowPower ? 1 : preset.shadowRadius;
        l.shadow.needsUpdate = true;
      }
      const mesh = o as THREE.Mesh;
      const mats = mesh.isMesh ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
      for (const m of mats) {
        const map = (m as THREE.MeshStandardMaterial).map;
        if (map && map.generateMipmaps && map.minFilter !== THREE.NearestFilter && map.anisotropy > 1) {
          const a = Math.min(maxAniso, Math.max(2, preset.anisotropy));
          if (map.anisotropy !== a) map.anisotropy = a;
        }
      }
    });
    renderer.shadowMap.needsUpdate = true;
  };

  const setQuality = (id: QualityId) => {
    if (id === preset.id) return;
    preset = qualityPreset(id, dpr(), lowPower);
    dyn = new DynamicResolution(preset, pixelRatio);
    setScale(preset.adaptive ? dyn.scale : preset.maxScale);
    setShadows(preset.shadows);
    applyQuality();
  };

  const qualityState = () => ({
    preset: preset.id,
    scale: pixelRatio,
    shadows: renderer.shadowMap.enabled,
    fps: Math.round(dyn.lastFps),
    msaa,
  });

  const dispose = () => {
    window.removeEventListener(SKINS_CHANGED, onSkins);
    dropGuns(gunRoot, guns);
    studio?.dispose();
    pmrem?.dispose();
    renderer.dispose();
  };

  resize();
  applyQuality();
  return { renderer, scene, gunScene, camera, gunCam, gunRoot, guns, resize, render, noteFrame, setWorldFov, rebuildGuns, setQuality, applyQuality, qualityState, dispose };
}

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { MELEE_ORDER, WEAPON_ORDER } from "./constants";
import { hitchMs, isLoDevice, noteGpuFrame } from "./textures";
import type { WeaponId } from "./types";
import { buildViewmodel } from "./viewmodel";
import { cancelWeaponPack } from "./weaponPack";

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

export function createArenaRenderer(canvas: HTMLCanvasElement, fov: number, accent = 0x7af0ff): ArenaRenderer {
  const lowPower = isLoDevice();
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: "high-performance",
    alpha: false,
  });
  let pixelRatio = Math.min(window.devicePixelRatio || 1, lowPower ? 0.85 : 1);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(canvas.clientWidth || 1, canvas.clientHeight || 1, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.autoClear = false;
  renderer.shadowMap.enabled = !lowPower;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const gunScene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.05, 420);
  const gunCam = new THREE.PerspectiveCamera(50, 1, 0.08, 8);
  gunCam.layers.set(1);

  const gunRoot = new THREE.Group();
  gunRoot.scale.setScalar(1.22);
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
  const rebuildGuns = (next: number) => {
    dropGuns(gunRoot, guns);
    mountGuns(gunRoot, guns, next);
  };

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

  let lastTune = 0;
  const noteFrame = (dt: number) => {
    noteGpuFrame(dt);
    const t = performance.now();
    if (t - lastTune < 400) return;
    lastTune = t;
    const ms = hitchMs();
    const floor = lowPower || ms > 22 ? 0.62 : 0.78;
    if (ms > 16.8 && pixelRatio > floor) {
      pixelRatio = Math.max(floor, Math.round((pixelRatio - 0.1) * 100) / 100);
      renderer.setPixelRatio(pixelRatio);
    }
    if (ms > 20 && renderer.shadowMap.enabled) renderer.shadowMap.enabled = false;
  };

  const dispose = () => {
    dropGuns(gunRoot, guns);
    studio?.dispose();
    pmrem?.dispose();
    renderer.dispose();
  };

  resize();
  return { renderer, scene, gunScene, camera, gunCam, gunRoot, guns, resize, render, noteFrame, setWorldFov, rebuildGuns, dispose };
}

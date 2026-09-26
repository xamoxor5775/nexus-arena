import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { WEAPON_ORDER } from "./constants";
import type { WeaponId } from "./types";
import { buildViewmodel } from "./viewmodel";

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
  setWorldFov: (fov: number) => void;
  dispose: () => void;
};

export function createArenaRenderer(canvas: HTMLCanvasElement, fov: number): ArenaRenderer {
  const lowPower = window.matchMedia?.("(pointer: coarse)").matches || window.innerWidth < 720;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !lowPower,
    powerPreference: "high-performance",
    alpha: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1 : 1.25));
  renderer.setSize(canvas.clientWidth || 1, canvas.clientHeight || 1, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.autoClear = false;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const gunScene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.05, 420);
  const gunCam = new THREE.PerspectiveCamera(42, 1, 0.08, 8);
  gunCam.layers.set(1);

  const gunRoot = new THREE.Group();
  gunRoot.scale.setScalar(1.68);
  gunScene.add(gunRoot);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const studio = pmrem.fromScene(room, 0.04);
  room.dispose();
  gunScene.environment = studio.texture;
  gunScene.environmentIntensity = 1.22;
  const hemi = new THREE.HemisphereLight(0xfff4ea, 0x3a2a22, 1.35);
  const key = new THREE.DirectionalLight(0xfff6ea, 4.7);
  key.position.set(0.55, 1.35, 0.95);
  const grim = new THREE.DirectionalLight(0xc8fff4, 2.7);
  grim.position.set(-1.6, 0.45, 0.15);
  const fill = new THREE.DirectionalLight(0xffb07a, 1.2);
  fill.position.set(0.15, -0.55, 0.7);
  const top = new THREE.DirectionalLight(0xfff8ee, 1.2);
  top.position.set(0.1, 1.7, 0.35);
  const rim = new THREE.PointLight(0xffe4c4, 4.8, 4.5, 1.4);
  rim.position.set(1.35, 0.28, 0.2);
  for (const light of [hemi, key, grim, fill, top, rim]) {
    light.layers.enableAll();
    gunScene.add(light);
  }

  const guns = new Map<WeaponId, THREE.Group>();
  for (const id of WEAPON_ORDER) {
    const g = buildViewmodel(id);
    g.visible = false;
    guns.set(id, g);
    gunRoot.add(g);
  }

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

  const dispose = () => {
    studio.dispose();
    pmrem.dispose();
    renderer.dispose();
  };

  resize();
  return { renderer, scene, gunScene, camera, gunCam, gunRoot, guns, resize, render, setWorldFov, dispose };
}

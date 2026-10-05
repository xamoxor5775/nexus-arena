/**
 * Rotating 3D preview of a weapon skin (ARSENAL screen). One small WebGL context, disposed on close.
 * Hard rules (it must never cost a frame or a pixel during gameplay):
 *  - the loop only draws while its canvas is in the document, visible and the game is on the menu;
 *  - it disposes itself if its canvas is removed without dispose() being called;
 *  - dispose() is idempotent: stops the loop, frees GPU memory, loses the context, shrinks the canvas.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { buildViewmodel } from "@/game/viewmodel";
import { cancelWeaponPack } from "@/game/weaponPack";
import { useArena } from "@/game/store";
import type { WeaponId } from "@/game/types";

export type SkinPreview = { show: (weapon: WeaponId, skinId: string) => void; dispose: () => void };

/** Live preview renderers (tests read `window.__nexusSkinPreviews`; must be 0 outside ARSENAL). */
let live = 0;
const publish = () => { (window as unknown as { __nexusSkinPreviews?: number }).__nexusSkinPreviews = live; };
export function livePreviews() { return live; }

function disposeModel(root: THREE.Object3D) {
  cancelWeaponPack(root);
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    if (mesh.userData.packMaterial) (mesh.material as THREE.Material).dispose();
  });
}

export function createSkinPreview(canvas: HTMLCanvasElement): SkinPreview {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  live++;
  publish();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const scene = new THREE.Scene();
  scene.environment = env;
  scene.environmentIntensity = 0.7;
  scene.add(new THREE.HemisphereLight(0xdde6ff, 0x1c1a18, 1.2));
  const key = new THREE.DirectionalLight(0xfff1dc, 2.4);
  key.position.set(-1.2, 2, 1.6);
  const rim = new THREE.DirectionalLight(0x3ae8d2, 1.6);
  rim.position.set(1.5, 0.6, -1.8);
  scene.add(key, rim);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 20);
  camera.layers.enableAll();
  const turntable = new THREE.Group();
  scene.add(turntable);
  let current: THREE.Object3D | null = null;
  let fitted = false;
  let raf = 0;
  let disposed = false;
  let angle = -0.6;
  let last = performance.now();

  const fit = () => {
    if (!current) return;
    const slot = current.getObjectByName("pack");
    if (slot && !slot.userData.ready) return; // wait for the imported model
    current.position.set(0, 0, 0);
    turntable.rotation.y = 0; // measure in turntable space
    turntable.updateMatrixWorld(true);
    const box = new THREE.Box3();
    const root = current;
    const shown = (o: THREE.Object3D | null): boolean => {
      for (let p = o; p && p !== root; p = p.parent) if (!p.visible) return false;
      return true;
    };
    // Only what is drawn: hidden procedural fallback and muzzle flash are ignored.
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && shown(m)) box.expandByObject(m);
    });
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    current.position.sub(c);
    const radius = Math.max(size.x, size.y, size.z) * 0.62;
    camera.position.set(0, radius * 0.35, radius / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.05);
    camera.lookAt(0, 0, 0);
    camera.near = radius * 0.05;
    camera.far = radius * 20;
    camera.updateProjectionMatrix();
    fitted = true;
  };

  const resize = () => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  let api: SkinPreview;
  const frame = (t: number) => {
    if (disposed) return;
    // Orphaned (panel unmounted without cleanup): free everything, never draw again.
    if (!canvas.isConnected) { api.dispose(); return; }
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    // Only on the menu and only when it can be seen; otherwise idle (no GPU work).
    if (document.hidden || useArena.getState().screen !== "menu" || canvas.clientWidth === 0) return;
    if (!fitted) fit();
    angle += dt * 0.55;
    turntable.rotation.y = angle;
    if (canvas.clientWidth !== renderer.domElement.width / renderer.getPixelRatio()) resize();
    renderer.render(scene, camera);
  };

  resize();
  raf = requestAnimationFrame(frame);

  api = {
    show(weapon, skinId) {
      if (disposed) return;
      if (current) {
        turntable.remove(current);
        disposeModel(current);
      }
      const g = buildViewmodel(weapon, undefined, skinId);
      g.rotation.set(0, 0, 0);
      g.position.set(0, 0, 0);
      g.scale.setScalar(1);
      const flash = g.getObjectByName("muzzle");
      if (flash) flash.visible = false;
      // Side-on presentation: barrel along X.
      const holder = new THREE.Group();
      holder.rotation.y = Math.PI / 2;
      holder.add(g);
      const pivot = new THREE.Group();
      pivot.add(holder);
      current = pivot;
      fitted = false;
      turntable.add(pivot);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      if (current) {
        turntable.remove(current);
        disposeModel(current);
        current = null;
      }
      env.dispose();
      pmrem.dispose();
      renderer.renderLists.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      // Drop the drawing buffer too (a lost context can keep its last frame around).
      canvas.width = 1;
      canvas.height = 1;
      live = Math.max(0, live - 1);
      publish();
    },
  };
  return api;
}

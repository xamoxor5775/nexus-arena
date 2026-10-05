import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { boxAt } from "./collision";
import type { AABB } from "./types";
import { isLoDevice, smokePuffTex } from "./textures";

/** Coche de exhibición sobre el estacionamiento central del Pozo. CC-BY-4.0, Sketchfab “Car.glb”. */
const CAR_URL = "/models/auto1k.glb";
/** Altura del piso superior del estacionamiento triangular. */
const DECK_Y = 3.05;
/** Miniatura: span ~2 m (antes 13 / 4.35). */
const FIT_SPAN = 2.05;

export function mountPozoCar(group: THREE.Group, solids: AABB[]) {
  const mount = new THREE.Group();
  mount.name = "pozo-auto";
  mount.position.set(0, DECK_Y, 0);
  group.add(mount);
  let disposed = false;
  let model: THREE.Object3D | null = null;
  let show: { update: (now: number, dt: number) => void; dispose: () => void } | null = null;
  const loader = new GLTFLoader();
  loader.load(CAR_URL, (gltf) => {
    if (disposed) {
      disposeObject(gltf.scene);
      return;
    }
    model = gltf.scene;
    const lo = isLoDevice();
    boostCarLook(model);
    model.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = !lo;
      mesh.receiveShadow = !lo;
    });
    mount.add(model);
    fitOnDeck(model, mount);
    if (disposed) return;
    const box = new THREE.Box3().setFromObject(model);
    mount.worldToLocal(box.min);
    mount.worldToLocal(box.max);
    const size = box.getSize(new THREE.Vector3());
    solids.push(boxAt(0, DECK_Y, 0, size.x * 0.92, Math.max(size.y, 0.4), size.z * 0.92));
    show = attachShow(mount, size, lo);
  });
  return {
    update(now: number, dt: number) {
      show?.update(now, dt);
    },
    dispose() {
      disposed = true;
      show?.dispose();
      group.remove(mount);
      if (model) disposeObject(model);
    },
  };
}

const NEON = 0xff3ec8;
const NEON_CYAN = 0x3afff0;
const NEON_MAGENTA = 0xff4ad4;

/** Empuja color/emissive del GLB para que se lea más vivo bajo las luces del show. */
function boostCarLook(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of list) {
      const std = mat as THREE.MeshStandardMaterial;
      if (!std || !("color" in std)) continue;
      // Saturar un poco el albedo y encender emissive para “glow” de showroom.
      const c = std.color;
      c.multiplyScalar(1.35);
      // Empuja canales fríos/cálidos hacia cian-magenta de arena.
      c.r = Math.min(1, c.r * 1.05 + 0.04);
      c.g = Math.min(1, c.g * 1.12 + 0.06);
      c.b = Math.min(1, c.b * 1.18 + 0.08);
      if (std.emissive) {
        std.emissive.setRGB(
          Math.min(1, c.r * 0.22 + 0.08),
          Math.min(1, c.g * 0.28 + 0.12),
          Math.min(1, c.b * 0.35 + 0.18),
        );
        std.emissiveIntensity = Math.max(std.emissiveIntensity ?? 0, 0.85);
      }
      if (typeof std.metalness === "number") std.metalness = Math.min(1, std.metalness * 0.7 + 0.35);
      if (typeof std.roughness === "number") std.roughness = Math.max(0.12, std.roughness * 0.65);
      std.needsUpdate = true;
    }
  });
}

/** El largo del modelo queda en +Z y el maletero es el extremo positivo. */
function attachShow(mount: THREE.Group, size: THREE.Vector3, lo: boolean) {
  const len = Math.max(Math.abs(size.z), 0.5);
  const wid = Math.max(Math.abs(size.x), 0.5);
  const rearZ = len * 0.46;
  const fx = new THREE.Group();
  mount.add(fx);

  const neonMat = new THREE.MeshBasicMaterial({
    color: NEON,
    transparent: true,
    opacity: 1,
    toneMapped: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const cyanMat = new THREE.MeshBasicMaterial({
    color: NEON_CYAN,
    transparent: true,
    opacity: 0.9,
    toneMapped: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const poolMat = new THREE.MeshBasicMaterial({
    color: NEON_MAGENTA,
    transparent: true,
    opacity: 0.62,
    toneMapped: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(wid * 1.85, len * 1.15), poolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.04;
  fx.add(pool);
  // Segundo pool cian debajo, un poco más ancho, para más color en el piso.
  const poolCyan = new THREE.Mesh(new THREE.PlaneGeometry(wid * 2.2, len * 1.35), cyanMat.clone());
  (poolCyan.material as THREE.MeshBasicMaterial).opacity = 0.28;
  poolCyan.rotation.x = -Math.PI / 2;
  poolCyan.position.y = 0.02;
  fx.add(poolCyan);

  const tubeGeo = new THREE.BoxGeometry(1, 1, 1);
  const side = (x: number, mat: THREE.MeshBasicMaterial) => {
    const tube = new THREE.Mesh(tubeGeo, mat);
    tube.scale.set(0.08, 0.07, len * 0.68);
    tube.position.set(x, 0.14, 0);
    fx.add(tube);
  };
  side(wid * 0.36, neonMat);
  side(-wid * 0.36, cyanMat);
  const nose = new THREE.Mesh(tubeGeo, neonMat);
  nose.scale.set(wid * 0.72, 0.07, 0.08);
  nose.position.set(0, 0.14, -len * 0.32);
  const tail = new THREE.Mesh(tubeGeo, cyanMat);
  tail.scale.set(wid * 0.58, 0.07, 0.08);
  tail.position.set(0, 0.14, rearZ * 0.72);
  fx.add(nose, tail);

  type Lamp = { light: THREE.PointLight; base: number };
  const lamps: Lamp[] = [];
  const addLamp = (x: number, y: number, z: number, color: number, intensity: number, dist: number) => {
    const lamp = new THREE.PointLight(color, intensity, dist, 1.6);
    lamp.position.set(x, y, z);
    lamp.castShadow = false;
    fx.add(lamp);
    lamps.push({ light: lamp, base: intensity });
  };
  // Luces de vitrina a escala miniatura (alcance corto).
  const coreI = lo ? 1.6 : 2.4;
  const coreD = lo ? 3.2 : 4.5;
  addLamp(0, 0.35, 0, NEON, coreI, coreD);
  addLamp(0, 0.22, -len * 0.28, NEON_CYAN, lo ? 1.2 : 1.8, lo ? 2.6 : 3.6);
  addLamp(0, 0.22, len * 0.22, NEON_MAGENTA, lo ? 1.2 : 1.8, lo ? 2.6 : 3.6);
  if (!lo) {
    addLamp(wid * 0.35, 0.4, 0, NEON_CYAN, 1.4, 3.2);
    addLamp(-wid * 0.35, 0.4, 0, NEON, 1.4, 3.2);
  }

  const pipeScale = Math.max(1, len / 4.5);
  const pipeMat = new THREE.MeshBasicMaterial({ color: 0x2a2428 });
  const pipeGeo = new THREE.CylinderGeometry(0.045 * pipeScale, 0.055 * pipeScale, 0.22 * pipeScale, 8);
  const mouths: THREE.Vector3[] = [];
  for (const x of [-0.16 * pipeScale, 0.16 * pipeScale]) {
    const pipe = new THREE.Mesh(pipeGeo, pipeMat);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(x, 0.28 * pipeScale, rearZ);
    fx.add(pipe);
    mouths.push(new THREE.Vector3(x, 0.28 * pipeScale, rearZ + 0.12 * pipeScale));
  }

  const n = lo ? 14 : 26;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  type Puff = { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number };
  const puffs: Puff[] = [];
  const seed = (p: Puff, scatter = false) => {
    const mouth = mouths[Math.floor(Math.random() * mouths.length)]!;
    p.x = mouth.x + (Math.random() - 0.5) * 0.08 * pipeScale;
    p.y = mouth.y + (Math.random() - 0.5) * 0.06 * pipeScale;
    p.z = mouth.z;
    p.vx = (Math.random() - 0.5) * 0.28 * pipeScale;
    p.vy = (0.7 + Math.random() * 0.9) * pipeScale;
    p.vz = (0.45 + Math.random() * 0.7) * pipeScale;
    p.max = 0.8 + Math.random() * 1.1;
    p.life = scatter ? Math.random() * p.max : 0;
  };
  for (let i = 0; i < n; i++) {
    const p: Puff = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1 };
    seed(p, true);
    puffs.push(p);
  }
  const smokeGeo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const colAttr = new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage);
  smokeGeo.setAttribute("position", posAttr);
  smokeGeo.setAttribute("color", colAttr);
  const smokeMat = new THREE.PointsMaterial({
    map: smokePuffTex(),
    color: 0xffffff,
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    size: (lo ? 0.55 : 0.85) * pipeScale,
    sizeAttenuation: true,
  });
  const smoke = new THREE.Points(smokeGeo, smokeMat);
  smoke.frustumCulled = false;
  smoke.renderOrder = 6;
  fx.add(smoke);

  return {
    update(now: number, dt: number) {
      const pulse = 0.7 + 0.3 * Math.sin(now * 2.8);
      const pulse2 = 0.65 + 0.35 * Math.sin(now * 3.4 + 1.1);
      neonMat.opacity = 0.7 + 0.3 * pulse;
      cyanMat.opacity = 0.65 + 0.3 * pulse2;
      poolMat.opacity = 0.38 + 0.28 * pulse;
      (poolCyan.material as THREE.MeshBasicMaterial).opacity = 0.18 + 0.16 * pulse2;
      for (const { light, base } of lamps) light.intensity = base * pulse;
      for (let i = 0; i < puffs.length; i++) {
        const p = puffs[i]!;
        p.life += dt;
        if (p.life >= p.max) seed(p);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vx += Math.sin(now * 1.7 + i) * 0.2 * dt;
        const t = p.life / p.max;
        const fade = t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88;
        const a = Math.max(0, fade);
        pos[i * 3] = p.x;
        pos[i * 3 + 1] = p.y;
        pos[i * 3 + 2] = p.z;
        // Humo teñido magenta/cian en vez de gris plano.
        col[i * 3] = (0.75 + 0.25 * t) * a;
        col[i * 3 + 1] = (0.35 + 0.2 * t) * a;
        col[i * 3 + 2] = (0.85 + 0.15 * (1 - t)) * a;
      }
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
    },
    dispose() {
      mount.remove(fx);
      tubeGeo.dispose();
      pipeGeo.dispose();
      pool.geometry.dispose();
      poolCyan.geometry.dispose();
      (poolCyan.material as THREE.Material).dispose();
      neonMat.dispose();
      cyanMat.dispose();
      poolMat.dispose();
      pipeMat.dispose();
      smokeGeo.dispose();
      smokeMat.dispose();
    },
  };
}

function fitOnDeck(model: THREE.Object3D, mount: THREE.Group) {
  model.position.set(0, 0, 0);
  model.rotation.set(0, 0, 0);
  model.scale.set(1, 1, 1);
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  // Centrar en origen del mount antes de escalar (evita drift con spans grandes).
  model.position.sub(mount.worldToLocal(center.clone()));
  model.updateMatrixWorld(true);
  box.setFromObject(model);
  box.getSize(size);
  const span = Math.max(size.x, size.z, 0.001);
  model.scale.setScalar(FIT_SPAN / span);
  model.updateMatrixWorld(true);
  box.setFromObject(model);
  box.getCenter(center);
  box.getSize(size);
  mount.worldToLocal(center);
  model.position.x -= center.x;
  model.position.z -= center.z;
  // Asentar sobre el deck (box.min.y en mundo → local).
  const minY = mount.worldToLocal(box.min.clone()).y;
  model.position.y -= minY;
}

function disposeObject(root: THREE.Object3D) {
  const geos = new Set<THREE.BufferGeometry>();
  const mats = new Set<THREE.Material>();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    geos.add(mesh.geometry);
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of list) mats.add(mat);
  });
  for (const geo of geos) geo.dispose();
  for (const mat of mats) {
    const std = mat as THREE.MeshStandardMaterial;
    std.map?.dispose();
    std.normalMap?.dispose();
    std.roughnessMap?.dispose();
    std.metalnessMap?.dispose();
    std.emissiveMap?.dispose();
    std.aoMap?.dispose();
    mat.dispose();
  }
}

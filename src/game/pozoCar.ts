import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { boxAt } from "./collision";
import type { AABB } from "./types";
import { isLoDevice, smokePuffTex } from "./textures";

/** Coche de exhibición sobre el altar central del Pozo. CC-BY-4.0, Sketchfab “Car.glb”. */
const CAR_URL = "/models/auto1k.glb";
const DECK_Y = 1.35;
const FIT_SPAN = 4.35;

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
    opacity: 0.95,
    toneMapped: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const poolMat = new THREE.MeshBasicMaterial({
    color: 0xff4ad4,
    transparent: true,
    opacity: 0.42,
    toneMapped: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(wid * 1.55, len * 0.9), poolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.04;
  fx.add(pool);
  const tubeGeo = new THREE.BoxGeometry(1, 1, 1);
  const side = (x: number) => {
    const tube = new THREE.Mesh(tubeGeo, neonMat);
    tube.scale.set(0.045, 0.04, len * 0.62);
    tube.position.set(x, 0.1, 0);
    fx.add(tube);
  };
  side(wid * 0.34);
  side(-wid * 0.34);
  const nose = new THREE.Mesh(tubeGeo, neonMat);
  nose.scale.set(wid * 0.62, 0.04, 0.045);
  nose.position.set(0, 0.1, -len * 0.3);
  const tail = new THREE.Mesh(tubeGeo, neonMat);
  tail.scale.set(wid * 0.5, 0.04, 0.045);
  tail.position.set(0, 0.1, rearZ * 0.72);
  fx.add(nose, tail);

  const lamps: THREE.PointLight[] = [];
  const addLamp = (z: number, intensity: number, dist: number) => {
    const lamp = new THREE.PointLight(NEON, intensity, dist, 2);
    lamp.position.set(0, 0.18, z);
    lamp.castShadow = false;
    fx.add(lamp);
    lamps.push(lamp);
  };
  addLamp(0, lo ? 2.4 : 3.4, lo ? 3.6 : 4.6);
  if (!lo) addLamp(len * 0.22, 2.2, 3.4);

  const pipeMat = new THREE.MeshBasicMaterial({ color: 0x2a2428 });
  const pipeGeo = new THREE.CylinderGeometry(0.045, 0.055, 0.22, 8);
  const mouths: THREE.Vector3[] = [];
  for (const x of [-0.16, 0.16]) {
    const pipe = new THREE.Mesh(pipeGeo, pipeMat);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(x, 0.28, rearZ);
    fx.add(pipe);
    mouths.push(new THREE.Vector3(x, 0.28, rearZ + 0.1));
  }

  const n = lo ? 10 : 18;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  type Puff = { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number };
  const puffs: Puff[] = [];
  const seed = (p: Puff, scatter = false) => {
    const mouth = mouths[Math.floor(Math.random() * mouths.length)]!;
    p.x = mouth.x + (Math.random() - 0.5) * 0.05;
    p.y = mouth.y + (Math.random() - 0.5) * 0.04;
    p.z = mouth.z;
    p.vx = (Math.random() - 0.5) * 0.18;
    p.vy = 0.55 + Math.random() * 0.7;
    p.vz = 0.35 + Math.random() * 0.55;
    p.max = 0.7 + Math.random() * 0.9;
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
    opacity: 0.72,
    depthWrite: false,
    size: lo ? 0.42 : 0.55,
    sizeAttenuation: true,
  });
  const smoke = new THREE.Points(smokeGeo, smokeMat);
  smoke.frustumCulled = false;
  smoke.renderOrder = 6;
  fx.add(smoke);

  return {
    update(now: number, dt: number) {
      const pulse = 0.62 + 0.38 * Math.sin(now * 2.6);
      neonMat.opacity = 0.55 + 0.45 * pulse;
      poolMat.opacity = 0.22 + 0.22 * pulse;
      for (const lamp of lamps) lamp.intensity = (lamp.position.z === 0 ? (lo ? 2.4 : 3.4) : 2.2) * pulse;
      for (let i = 0; i < puffs.length; i++) {
        const p = puffs[i]!;
        p.life += dt;
        if (p.life >= p.max) seed(p);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vx += Math.sin(now * 1.7 + i) * 0.15 * dt;
        const t = p.life / p.max;
        const fade = t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88;
        const a = Math.max(0, fade);
        pos[i * 3] = p.x;
        pos[i * 3 + 1] = p.y;
        pos[i * 3 + 2] = p.z;
        const gray = (0.55 + 0.4 * t) * a;
        col[i * 3] = gray * 0.92;
        col[i * 3 + 1] = gray * 0.9;
        col[i * 3 + 2] = gray * 0.95;
      }
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
    },
    dispose() {
      mount.remove(fx);
      tubeGeo.dispose();
      pipeGeo.dispose();
      pool.geometry.dispose();
      neonMat.dispose();
      poolMat.dispose();
      pipeMat.dispose();
      smokeGeo.dispose();
      smokeMat.dispose();
    },
  };
}

function fitOnDeck(model: THREE.Object3D, mount: THREE.Group) {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  mount.worldToLocal(box.min);
  mount.worldToLocal(box.max);
  const size = box.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.z, 0.001);
  model.scale.setScalar(FIT_SPAN / span);
  model.updateMatrixWorld(true);
  box.setFromObject(model);
  mount.worldToLocal(box.min);
  mount.worldToLocal(box.max);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;
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

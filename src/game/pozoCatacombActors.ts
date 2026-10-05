import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { HazardZone } from "./types";

const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Group>>();

function loadModel(url: string) {
  const hit = cache.get(url);
  if (hit) return hit;
  const request = loader.loadAsync(url).then((gltf) => {
    gltf.scene.userData.clips = gltf.animations;
    return gltf.scene;
  });
  cache.set(url, request);
  return request;
}

const MOAI_URL = "/models/environment/moai-head-lite-v1.glb";
const SKULL_URL = "/models/environment/baroque-skull-lite-v1.glb";
const SCP_URL = "/models/environment/scp096-catacomb-v1.glb";
const CATACOMB_FLOOR_Y = -4.55;
const SCP_MAX_HEIGHT = 2.05;

export function preloadPozoCatacombActors() {
  return Promise.allSettled([loadModel(MOAI_URL), loadModel(SKULL_URL), loadModel(SCP_URL)]).then(() => undefined);
}

function normalizeModel(source: THREE.Group, height: number, skinned = false) {
  const model = skinned ? cloneSkinned(source) : source.clone(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = height / Math.max(size.y, 0.001);
  model.scale.setScalar(scale);
  model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = false;
    object.receiveShadow = false;
    object.frustumCulled = true;
  });
  return model;
}

export function mountPozoCatacombActors(parent: THREE.Group, hazards: HazardZone[]) {
  let disposed = false;
  const roots: THREE.Object3D[] = [];
  const mixers: THREE.AnimationMixer[] = [];
  const contact: HazardZone = { x: 0, y: -999, z: 0, radius: 0.9, damage: 999, color: 0xd5e7d0, label: "SCP-096 · CONTACTO LETAL" };
  const vomit: HazardZone = { x: 0, y: -999, z: 0, radius: 1.85, damage: 22, color: 0x79ff5b, label: "VÓMITO CORROSIVO" };
  hazards.push(contact, vomit);

  const mountStatic = (url: string, height: number, x: number, z: number, ry: number) => {
    void loadModel(url).then((source) => {
      if (disposed) return;
      const root = new THREE.Group();
      root.name = url.includes("moai") ? "pozo-moai-decor" : "pozo-skull-decor";
      root.position.set(x, CATACOMB_FLOOR_Y, z);
      root.rotation.y = ry;
      root.add(normalizeModel(source, height));
      root.updateMatrixWorld(true);
      root.matrixAutoUpdate = false;
      parent.add(root);
      roots.push(root);
    }).catch((error: unknown) => console.warn("[pozo-decor] model unavailable", error));
  };

  mountStatic(MOAI_URL, 3.4, -37, 27, 0.7);
  mountStatic(MOAI_URL, 2.8, 36, -25, -2.3);
  mountStatic(SKULL_URL, 3.1, -34, -28, 0.8);
  mountStatic(SKULL_URL, 2.6, 35, 29, -2.2);

  let monster: THREE.Group | null = null;
  let mixer: THREE.AnimationMixer | null = null;
  let runAction: THREE.AnimationAction | null = null;
  let attackAction: THREE.AnimationAction | null = null;
  let segment = 0;
  let nextVomitAt = 5;
  let vomitUntil = 0;
  const path = [
    new THREE.Vector3(-27, CATACOMB_FLOOR_Y, -31),
    new THREE.Vector3(27, CATACOMB_FLOOR_Y, -31),
    new THREE.Vector3(27, CATACOMB_FLOOR_Y, 31),
    new THREE.Vector3(-27, CATACOMB_FLOOR_Y, 31),
  ];
  const glob = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.34, 1),
    new THREE.MeshBasicMaterial({ color: 0x79ff5b, transparent: true, opacity: 0.86, toneMapped: false }),
  );
  glob.visible = false;
  parent.add(glob);
  roots.push(glob);

  void loadModel(SCP_URL).then((source) => {
    if (disposed) return;
    monster = new THREE.Group();
    monster.name = "pozo-scp096";
    // Keep the creature below the catacomb ceiling even at the tallest point
    // of its animation. The previous 2.9 m scale could intersect Pozo above.
    monster.add(normalizeModel(source, SCP_MAX_HEIGHT, true));
    monster.position.copy(path[0]!);
    parent.add(monster);
    roots.push(monster);
    mixer = new THREE.AnimationMixer(monster);
    mixers.push(mixer);
    const clips = (source.userData.clips ?? []) as THREE.AnimationClip[];
    const running = clips.find((clip) => /running1/i.test(clip.name)) ?? clips.find((clip) => /walk/i.test(clip.name));
    const attacking = clips.find((clip) => /attack2/i.test(clip.name)) ?? clips.find((clip) => /attack/i.test(clip.name));
    if (running) runAction = mixer.clipAction(running).play();
    if (attacking) attackAction = mixer.clipAction(attacking);
  }).catch((error: unknown) => console.warn("[pozo-scp096] model unavailable", error));

  let elapsed = 0;
  const update = (dt: number) => {
    elapsed += dt;
    for (const activeMixer of mixers) activeMixer.update(dt);
    if (!monster) return;
    const target = path[(segment + 1) % path.length]!;
    const dx = target.x - monster.position.x;
    const dz = target.z - monster.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.7) segment = (segment + 1) % path.length;
    else {
      const speed = 5.2;
      monster.position.x += (dx / distance) * speed * dt;
      monster.position.z += (dz / distance) * speed * dt;
      monster.rotation.y = Math.atan2(dx, dz);
    }
    contact.x = monster.position.x;
    contact.y = monster.position.y;
    contact.z = monster.position.z;

    if (elapsed >= nextVomitAt) {
      nextVomitAt = elapsed + 6.5;
      vomitUntil = elapsed + 2.4;
      runAction?.fadeOut(0.12);
      attackAction?.reset().fadeIn(0.08).play();
    }
    if (elapsed < vomitUntil) {
      const phase = 1 - (vomitUntil - elapsed) / 2.4;
      const forwardX = Math.sin(monster.rotation.y);
      const forwardZ = Math.cos(monster.rotation.y);
      const travel = Math.min(7, phase * 10);
      glob.visible = true;
      glob.position.set(monster.position.x + forwardX * travel, monster.position.y + 1.3 - Math.max(0, phase - 0.55) * 2.2, monster.position.z + forwardZ * travel);
      glob.scale.setScalar(0.8 + Math.sin(elapsed * 16) * 0.16);
      vomit.x = glob.position.x;
      vomit.y = monster.position.y;
      vomit.z = glob.position.z;
    } else {
      glob.visible = false;
      vomit.y = -999;
      if (runAction && !runAction.isRunning()) runAction.reset().fadeIn(0.16).play();
    }
  };

  return {
    update,
    dispose() {
      disposed = true;
      contact.y = vomit.y = -999;
      for (const activeMixer of mixers) activeMixer.stopAllAction();
      for (const root of roots) parent.remove(root);
      glob.geometry.dispose();
      (glob.material as THREE.Material).dispose();
    },
  };
}

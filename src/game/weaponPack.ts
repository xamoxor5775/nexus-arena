import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { WeaponId } from "./types";

type V3 = [number, number, number];
type PackSpec = {
  file: string;
  length: number;
  forward: V3;
  up: V3;
  muzzle: V3;
  hip: V3;
  ads: V3;
  rotation?: V3;
  onlyMaterial?: string;
  localGeometry?: boolean;
  basisBone?: string;
};

// Measured in each ORIGINAL GLB's coordinates, not inferred from its bounding box.
// In particular the Odin end bone points sideways, and the knife demo includes arms.
const PACK: Partial<Record<WeaponId, PackSpec>> = {
  pulse: { file: "r99-v2.glb", length: 0.48, forward: [0, 0, 1], up: [0, 1, 0], basisBone: "weapon_bone_02", muzzle: [-2.446, 9.694, 12.24], hip: [0.19, -0.18, -0.28], ads: [0, -0.065, -0.3] },
  scatter: { file: "g4-dynamax-v2.glb", length: 0.52, forward: [-1, 0, 0], up: [0, 1, 0], muzzle: [-156.366, 0, 0], hip: [0.21, -0.18, -0.3], ads: [0, -0.09, -0.34] },
  lance: { file: "blaster-v2.glb", length: 0.48, forward: [0, 0, 1], up: [0, 1, 0], muzzle: [0, 0.015, 0.1225], hip: [0.19, -0.18, -0.28], ads: [0, -0.075, -0.32] },
  ion: { file: "odin-v2.glb", length: 0.6, forward: [-1, 0, 0], up: [0, 1, 0], muzzle: [-1.15582, 0.22964, 0.000014], hip: [0.22, -0.2, -0.32], ads: [0, -0.09, -0.38] },
  fauces: { file: "industrial-v2.glb", length: 0.34, forward: [1, 0, 0], up: [0, 1, 0], muzzle: [0.29194, 0.16, 0], hip: [0.18, -0.15, -0.32], ads: [0, -0.045, -0.36] },
  knife: { file: "knife-animated-v2.glb", length: 0.34, forward: [0, 1, 0], up: [0, 0, 1], muzzle: [0, 26.985, 0], hip: [0.21, -0.2, -0.4], ads: [0.16, -0.17, -0.42], rotation: [0.7, 0.1, -0.3], onlyMaterial: "knife", localGeometry: true },
};

type Prepared = { model: THREE.Group; muzzle: THREE.Vector3 };
const cache = new Map<WeaponId, Promise<Prepared | null>>();
const loader = new GLTFLoader();

export function hasWeaponPack(id: WeaponId): boolean { return PACK[id] != null; }
export function packPose(id: WeaponId, ads = false): THREE.Vector3 {
  const spec = PACK[id]!;
  return new THREE.Vector3(...(ads ? spec.ads : spec.hip));
}
export function packRotation(id: WeaponId): THREE.Euler {
  return new THREE.Euler(...(PACK[id]?.rotation ?? [0.02, 0.12, -0.02] as V3));
}
export function setPackAim(model: THREE.Object3D, id: WeaponId, aim: number) {
  if (!PACK[id]) return;
  const pose = PACK[id]!.rotation ?? [0.02, 0.12, -0.02];
  const amount = id === "knife" ? 1 : 1 - THREE.MathUtils.clamp(aim, 0, 1);
  model.rotation.set(pose[0]! * amount, pose[1]! * amount, pose[2]! * amount);
}
export function packViewportScale(id: WeaponId, aspect: number) {
  return PACK[id] ? Math.min(1, Math.max(0.3, aspect / 1.2)) : 1;
}
export function preloadWeaponPack() {
  for (const id of Object.keys(PACK) as WeaponId[]) void loadPrepared(id);
}

function loadPrepared(id: WeaponId): Promise<Prepared | null> {
  const hit = cache.get(id);
  if (hit) return hit;
  const spec = PACK[id]!;
  const promise = loader.loadAsync(`/models/weapons/${spec.file}`)
    .then((gltf) => prepare(gltf.scene, spec))
    .catch((error: unknown) => {
      console.warn(`[weapon-pack] ${id}: using procedural fallback`, error);
      cache.delete(id); // A transient network failure must not poison later retries.
      return null;
    });
  cache.set(id, promise);
  return promise;
}

/** Freeze the authored bind pose ONCE, then batch rigid pieces by material.
 * Recoil and melee swings remain driven by gameplay, not the artist's demo clip.
 * UVs, color/normal/metallic/roughness/emissive maps and authored colors are kept.
 */
function prepare(source: THREE.Object3D, spec: PackSpec): Prepared {
  source.updateMatrixWorld(true);
  const forward = new THREE.Vector3(...spec.forward).normalize();
  const authoredUp = new THREE.Vector3(...spec.up);
  if (spec.basisBone) {
    const bone = source.getObjectByName(spec.basisBone);
    if (!bone) throw new Error(`Missing weapon basis: ${spec.basisBone}`);
    const rotation = bone.getWorldQuaternion(new THREE.Quaternion());
    forward.applyQuaternion(rotation);
    authoredUp.applyQuaternion(rotation);
  }
  const right = forward.clone().cross(authoredUp).normalize();
  const up = right.clone().cross(forward).normalize();
  const orient = new THREE.Matrix4().makeBasis(right, up, forward.clone().negate()).invert();
  const batches = new Map<string, { material: THREE.Material; parts: THREE.BufferGeometry[] }>();
  const point = new THREE.Vector3();
  source.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (Array.isArray(mesh.material)) throw new Error(`Unsupported multi-material primitive: ${mesh.name}`);
    if (spec.onlyMaterial && mesh.material.name !== spec.onlyMaterial) return;
    const geometry = mesh.geometry.clone();
    const skinned = mesh as THREE.SkinnedMesh;
    if (skinned.isSkinnedMesh) skinned.skeleton.update();
    const pos = geometry.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      mesh.getVertexPosition(i, point); // Includes bind-pose skinning and morphs.
      if (!spec.localGeometry) point.applyMatrix4(mesh.matrixWorld);
      point.applyMatrix4(orient);
      pos.setXYZ(i, point.x, point.y, point.z);
    }
    // Bake normals after skinning; no skeleton evaluation is needed per frame.
    for (const name of Object.keys(geometry.attributes)) {
      if (!["position", "normal", "uv", "uv1"].includes(name)) geometry.deleteAttribute(name);
    }
    geometry.morphAttributes = {};
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    // The G4 artist baked opaque pink glass into both ends of the optic.
    // These measured triangle ranges cover the rear pane and front lens only.
    if (spec.file === "g4-dynamax-v2.glb" && mesh.name === "sight_low_03_-_Default_0" && geometry.index) {
      const indices = Array.from(geometry.index.array);
      const lens = geometry.clone();
      const glassIndices: number[] = [];
      const solidIndices: number[] = [];
      for (let i = 0; i < indices.length; i += 3) {
        const isGlass = i === 378 || (i >= 648 && i < 654) || (i >= 2472 && i < 2478) || (i >= 4029 && i < 4098);
        (isGlass ? glassIndices : solidIndices).push(indices[i]!, indices[i + 1]!, indices[i + 2]!);
      }
      lens.setIndex(glassIndices);
      geometry.setIndex(solidIndices);
      const glass = (mesh.material as THREE.MeshStandardMaterial).clone();
      glass.name = "G4-optic-glass";
      glass.transparent = true;
      glass.opacity = 0.08;
      glass.depthWrite = false;
      glass.metalness = 0.05;
      glass.roughness = 0.22;
      glass.emissiveIntensity = 0.03;
      batches.set("g4-optic-glass", { material: glass, parts: [lens] });
    }
    // Some Odin pieces have a second UV channel, others intentionally do not.
    const signature = `${mesh.material.uuid}:${!!geometry.index}:${Object.keys(geometry.attributes).sort().join(",")}`;
    const batch = batches.get(signature) ?? { material: mesh.material, parts: [] };
    batch.parts.push(geometry);
    batches.set(signature, batch);
  });
  const model = new THREE.Group();
  model.name = "imported-weapon";
  for (const { material, parts } of batches.values()) {
    const geometry = parts.length === 1 ? parts[0]! : mergeGeometries(parts);
    if (!geometry) throw new Error(`Incompatible geometry for ${material.name}`);
    if (parts.length > 1) for (const part of parts) part.dispose();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = material.name;
    model.add(mesh);
  }
  const box = new THREE.Box3().setFromObject(model);
  if (box.isEmpty()) throw new Error("No usable weapon geometry");
  const scale = spec.length / Math.max(0.0001, box.max.z - box.min.z);
  const muzzle = new THREE.Vector3(...spec.muzzle).applyMatrix4(orient).multiplyScalar(scale);
  const offset = new THREE.Vector3(-muzzle.x, -muzzle.y, -spec.length * 0.82 - muzzle.z);
  model.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.scale(scale, scale, scale).translate(offset.x, offset.y, offset.z);
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
  });
  // Loader geometries are no longer needed. Materials/textures are shared by cached batches.
  source.traverse((obj) => { const mesh = obj as THREE.Mesh; if (mesh.isMesh) mesh.geometry.dispose(); });
  return { model, muzzle: muzzle.add(offset) };
}

function instantiate(prepared: Prepared, fps: boolean, ratio = 1): THREE.Group {
  const model = prepared.model.clone(true);
  model.scale.setScalar(ratio);
  model.traverse((obj) => {
    obj.layers.set(fps ? 1 : 0);
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    // Renderer/bot teardown owns each geometry/material, but not shared textures.
    mesh.geometry = mesh.geometry.clone();
    mesh.material = (mesh.material as THREE.Material).clone();
    mesh.userData.packMaterial = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = !fps;
  });
  return model;
}

export function cancelWeaponPack(root: THREE.Object3D) {
  root.traverse((obj) => { obj.userData.packToken = null; });
}

export function mountPackView(slot: THREE.Group, id: WeaponId, muzzle: THREE.Object3D, fallback?: THREE.Object3D) {
  const token = {};
  slot.userData.packToken = token;
  void loadPrepared(id).then((prepared) => {
    if (!prepared || slot.userData.packToken !== token || !slot.parent) return;
    slot.add(instantiate(prepared, true));
    // Muzzle and slot share a parent: no rotated world AABB conversions.
    muzzle.position.copy(prepared.muzzle);
    if (fallback) fallback.visible = false;
    slot.userData.ready = true;
  });
}

export function mountPackWorld(slot: THREE.Group, id: WeaponId, fallback?: THREE.Object3D) {
  const token = {};
  slot.userData.packToken = token;
  void loadPrepared(id).then((prepared) => {
    if (!prepared || slot.userData.packToken !== token || !slot.parent) return;
    slot.add(instantiate(prepared, false, 0.28 / PACK[id]!.length));
    if (fallback) fallback.visible = false;
    slot.userData.ready = true;
  });
}

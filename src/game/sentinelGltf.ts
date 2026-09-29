import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { buildRig, driveRig, driveStatic, resetRig, type RigPose } from "./botRig";

export type FullbodySpec = {
  url: string;
  name: string;
  height: number;
  /** Keep the glTF double-sided flag (open coats, torn cloth). Default: force FrontSide. */
  doubleSided?: boolean;
  /** Turn BLEND materials into alpha-tested opaque ones (avoids sorting artefacts). */
  alphaMask?: boolean;
  /** Extra yaw (radians) applied to the model inside the fighter. */
  yaw?: number;
  /** Hide the procedural world gun (model already holds its own weapons). */
  hideGun?: boolean;
  /** Idle arm spread for skinned rigs. */
  armOut?: number;
  /** Animated by botRig (skinned bones or static body motion) instead of driveSentinelGltf. */
  rigged?: boolean;
};

export const STELLAR_SPEC: FullbodySpec = {
  url: "/models/stellar-sentinel.glb",
  name: "stellarSentinel",
  height: 1.72,
};

export const CHIBI_SPEC: FullbodySpec = {
  url: "/models/chibi-figure.glb",
  name: "chibiFigure",
  height: 1.38,
};

/* Bot roster models (kits 7-10). Optimised: webp textures + meshopt geometry. */
export const COWBOY_SPEC: FullbodySpec = {
  url: "/models/bots/agent-cowboy-v1.glb",
  name: "agentCowboy",
  height: 1.8,
  rigged: true,
  armOut: 0.3,
};

export const VENOM_SPEC: FullbodySpec = {
  url: "/models/bots/venom-blue-v1.glb",
  name: "venomBlue",
  height: 1.82,
  rigged: true,
  armOut: 0.5,
};

export const COWGIRL_SPEC: FullbodySpec = {
  url: "/models/bots/cowgirl-v1.glb",
  name: "cowgirl",
  height: 1.74,
  rigged: true,
  doubleSided: true,
  hideGun: true,
  yaw: 0.95,
};

export const GOKU_SPEC: FullbodySpec = {
  url: "/models/bots/goku-v1.glb",
  name: "goku",
  height: 1.78,
  rigged: true,
  doubleSided: true,
  alphaMask: true,
  armOut: 0.36,
};

export const BOT_MODEL_SPECS: Record<number, FullbodySpec> = {
  7: COWBOY_SPEC,
  8: VENOM_SPEC,
  9: COWGIRL_SPEC,
  10: GOKU_SPEC,
};

const FULLBODY_NAMES = new Set([STELLAR_SPEC.name, CHIBI_SPEC.name]);

type FullbodyAsset = { scene: THREE.Object3D; skinned: boolean };
const assets = new Map<string, FullbodyAsset>();
const waits = new Map<string, Promise<FullbodyAsset>>();

export function preloadFullbodyGltf(spec: FullbodySpec): Promise<FullbodyAsset> {
  const hit = waits.get(spec.url);
  if (hit) return hit;
  const wait = new Promise<FullbodyAsset>((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load(
      spec.url,
      (gltf) => {
        gltf.scene.updateMatrixWorld(true);
        let skinned = false;
        gltf.scene.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (!mesh.isMesh) return;
          if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
            skinned = true;
            // bones move the vertices; the bind-pose bounds would cull limbs
            mesh.frustumCulled = false;
          }
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const mat of mats) {
            const std = mat as THREE.MeshStandardMaterial;
            std.toneMapped = false;
            if (!spec.doubleSided) std.side = THREE.FrontSide;
            if (spec.alphaMask && std.transparent) {
              std.transparent = false;
              std.depthWrite = true;
              std.alphaTest = 0.5;
            }
          }
        });
        const asset = { scene: gltf.scene, skinned };
        assets.set(spec.url, asset);
        resolve(asset);
      },
      undefined,
      reject,
    );
  });
  waits.set(spec.url, wait);
  return wait;
}

export function preloadSentinelGltf() {
  return preloadFullbodyGltf(STELLAR_SPEC);
}

export function preloadChibiGltf() {
  return preloadFullbodyGltf(CHIBI_SPEC);
}

function fitFullBody(mount: THREE.Group, root: THREE.Group, height: number, yaw = 0, precise = false) {
  mount.position.set(0, 0, 0);
  mount.rotation.set(0, Math.PI + yaw, 0);
  mount.scale.setScalar(1);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(mount, precise);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  mount.scale.setScalar(height / Math.max(size.y, 0.01));
  mount.updateMatrixWorld(true);
  box.setFromObject(mount, precise);
  const inv = root.matrixWorld.clone().invert();
  const min = box.min.clone().applyMatrix4(inv);
  const max = box.max.clone().applyMatrix4(inv);
  mount.position.x += -0.5 * (min.x + max.x);
  mount.position.y += -min.y;
  mount.position.z += -0.5 * (min.z + max.z);
}

export function attachFullbodyGltf(root: THREE.Group, head: THREE.Group, spec: FullbodySpec) {
  const mount = new THREE.Group();
  mount.name = spec.name;
  root.add(mount);
  root.userData.gltfMount = mount;
  root.userData.fullbodyBaseY = 0;

  const hideBody = () => {
    head.visible = false;
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      let p: THREE.Object3D | null = obj;
      while (p) {
        if (p.name === spec.name || p.name === "worldGun") return;
        p = p.parent;
      }
      mesh.visible = false;
    });
  };

  const apply = (src: FullbodyAsset) => {
    if (mount.children.length) return;
    const model = src.skinned ? cloneSkinned(src.scene) : src.scene.clone(true);
    mount.add(model);
    fitFullBody(mount, root, spec.height, spec.yaw ?? 0);
    if (spec.rigged) {
      const rig = src.skinned ? buildRig(root, mount, spec.height, { armOut: spec.armOut }) : null;
      if (rig) {
        root.userData.botRig = rig;
        // settle into the idle pose, then fit on the posed (skinned) bounds
        driveRig(rig, idlePose(), null);
        fitFullBody(mount, root, spec.height, spec.yaw ?? 0, true);
      }
      root.userData.staticRig = {
        base: { x: mount.position.x, y: mount.position.y, z: mount.position.z, yaw: mount.rotation.y },
        state: { kick: 0, wasFiring: false, clock: 0 },
      };
    }
    root.userData.fullbodyBaseY = mount.position.y;
    hideBody();
    const gun = root.getObjectByName("worldGun");
    if (gun && spec.hideGun) gun.visible = false;
  };

  const ready = assets.get(spec.url);
  if (ready) apply(ready);
  else {
    preloadFullbodyGltf(spec)
      .then(apply)
      .catch(() => {
        head.visible = true;
      });
  }
}

export function attachSentinelGltf(root: THREE.Group, head: THREE.Group) {
  attachFullbodyGltf(root, head, STELLAR_SPEC);
}

export function attachChibiGltf(root: THREE.Group, head: THREE.Group) {
  attachFullbodyGltf(root, head, CHIBI_SPEC);
}

function idlePose(): RigPose {
  return { speed: 0, grounded: true, velY: 0, pitch: 0, dt: 0, firing: false, dead: false, deadT: 0, cycle: 0 };
}

export function attachBotModel(root: THREE.Group, head: THREE.Group, kit: number) {
  const spec = BOT_MODEL_SPECS[kit];
  if (spec) attachFullbodyGltf(root, head, spec);
}

export function preloadBotModels() {
  for (const spec of Object.values(BOT_MODEL_SPECS)) preloadFullbodyGltf(spec).catch(() => undefined);
}

type StaticRig = {
  base: { x: number; y: number; z: number; yaw: number };
  state: { kick: number; wasFiring: boolean; clock: number };
};

/** Run / shoot animation for the roster models (kits 7-10). */
export function driveBotModel(mesh: THREE.Group, pose: RigPose) {
  const mount = mesh.userData.gltfMount as THREE.Group | undefined;
  if (!mount) return;
  const rig = mesh.userData.botRig as Parameters<typeof driveRig>[0] | undefined;
  const stat = mesh.userData.staticRig as StaticRig | undefined;
  if (!stat) return;
  if (rig) {
    const gun = mesh.getObjectByName("worldGun") ?? null;
    driveRig(rig, pose, gun && gun.visible ? gun : null);
    const run = pose.grounded && !pose.dead ? Math.min(1, pose.speed / 8.5) : 0;
    const s = Math.abs(Math.sin(pose.cycle));
    mount.position.set(stat.base.x, stat.base.y + s * run * 0.045 - run * 0.03, stat.base.z);
    mount.rotation.set(0, stat.base.yaw, 0);
  } else {
    driveStatic(mount, stat.base, stat.state, pose);
  }
}

export function resetBotModel(mesh: THREE.Group) {
  const mount = mesh.userData.gltfMount as THREE.Group | undefined;
  const stat = mesh.userData.staticRig as StaticRig | undefined;
  if (!mount || !stat) return;
  mount.visible = true;
  mount.position.set(stat.base.x, stat.base.y, stat.base.z);
  mount.rotation.set(0, stat.base.yaw, 0);
  stat.state.kick = 0;
  stat.state.wasFiring = false;
  const rig = mesh.userData.botRig as Parameters<typeof resetRig>[0] | undefined;
  if (rig) {
    resetRig(rig);
    // never leave the bind pose (T/A-pose) visible after a respawn
    const gun = mesh.getObjectByName("worldGun") ?? null;
    driveRig(rig, idlePose(), gun && gun.visible ? gun : null);
  }
}

export function driveSentinelGltf(
  mesh: THREE.Group,
  pose: { hipsZ: number; torsoX: number; bob: number; pitch: number; deadT: number },
) {
  const mount = mesh.userData.gltfMount as THREE.Group | undefined;
  if (!mount || !FULLBODY_NAMES.has(mount.name)) return;
  const baseY = (mesh.userData.fullbodyBaseY as number) ?? (mesh.userData.sentinelBaseY as number) ?? 0;
  mount.position.y = baseY + pose.bob;
  mount.rotation.x = pose.torsoX * 0.35 + pose.pitch * 0.08 + pose.deadT * 0.15;
  mount.rotation.z = pose.hipsZ * 0.55;
}

export function resetSentinelGltf(mesh: THREE.Group) {
  const mount = mesh.userData.gltfMount as THREE.Group | undefined;
  if (!mount || !FULLBODY_NAMES.has(mount.name)) return;
  mount.visible = true;
  const baseY = (mesh.userData.fullbodyBaseY as number) ?? (mesh.userData.sentinelBaseY as number) ?? 0;
  mount.position.y = baseY;
  mount.rotation.x = 0;
  mount.rotation.z = 0;
}

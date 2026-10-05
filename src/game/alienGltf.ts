import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

type AlienAsset = {
  scene: THREE.Object3D;
  clips: THREE.AnimationClip[];
};

let asset: AlienAsset | null = null;
let wait: Promise<AlienAsset> | null = null;

export function preloadAlienGltf(): Promise<AlienAsset> {
  if (wait) return wait;
  wait = new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(
      "/models/alien.glb",
      (gltf) => {
        gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const mat of mats) {
            const std = mat as THREE.MeshStandardMaterial;
            std.toneMapped = false;
            if (typeof std.metalness === "number") std.metalness = Math.min(std.metalness, 0.32);
          }
        });
        asset = { scene: gltf.scene, clips: gltf.animations ?? [] };
        resolve(asset);
      },
      undefined,
      reject,
    );
  });
  return wait;
}

function findNamed(root: THREE.Object3D, name: string): THREE.Object3D | undefined {
  let found: THREE.Object3D | undefined;
  root.traverse((obj) => {
    if (!found && obj.name === name) found = obj;
  });
  return found;
}

function fitBust(mount: THREE.Group, torso: THREE.Group) {
  mount.position.set(0, 0, 0);
  mount.rotation.set(0, 0, 0);
  mount.scale.setScalar(1);
  torso.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(mount);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  mount.scale.setScalar(0.84 / Math.max(size.y, 0.01));
  mount.updateMatrixWorld(true);
  box.setFromObject(mount);
  const inv = torso.matrixWorld.clone().invert();
  const min = box.min.clone().applyMatrix4(inv);
  const max = box.max.clone().applyMatrix4(inv);
  mount.position.x += -0.5 * (min.x + max.x);
  mount.position.y += 0.03 - min.y;
  mount.position.z += 0.05 - 0.5 * (min.z + max.z);
}

export function attachAlienGltf(torso: THREE.Group, head: THREE.Group, root: THREE.Group) {
  head.visible = false;
  const mount = new THREE.Group();
  mount.name = "alienGltf";
  torso.add(mount);
  root.userData.gltfMount = mount;

  const apply = (src: AlienAsset) => {
    if (mount.children.length) return;
    const model = cloneSkinned(src.scene);
    mount.add(model);
    fitBust(mount, torso);
    const neck = findNamed(model, "Neck");
    const skull = findNamed(model, "SkullBase");
    root.userData.gltfNeck = neck;
    root.userData.gltfSkull = skull;
    root.userData.gltfNeckRest = neck ? neck.quaternion.clone() : null;
    root.userData.gltfSkullRest = skull ? skull.quaternion.clone() : null;
    if (src.clips.length) {
      const mixer = new THREE.AnimationMixer(model);
      mixer.clipAction(src.clips[0]!).play();
      root.userData.gltfMixer = mixer;
    }
  };

  if (asset) apply(asset);
  else {
    preloadAlienGltf()
      .then(apply)
      .catch(() => {
        head.visible = true;
      });
  }
}

export function driveAlienGltf(mesh: THREE.Group, pitch: number, yawComp: number, dt: number, deadT = 0) {
  const mixer = mesh.userData.gltfMixer as THREE.AnimationMixer | undefined;
  mixer?.update(dt);
  const neck = mesh.userData.gltfNeck as THREE.Object3D | undefined;
  const skull = mesh.userData.gltfSkull as THREE.Object3D | undefined;
  const neckRest = mesh.userData.gltfNeckRest as THREE.Quaternion | undefined;
  const skullRest = mesh.userData.gltfSkullRest as THREE.Quaternion | undefined;
  const look = THREE.MathUtils.clamp(pitch, -0.9, 0.9);
  if (neck && neckRest) {
    neck.quaternion.copy(neckRest);
    neck.rotateX(look * 0.42 + deadT * 0.2);
    neck.rotateY(yawComp * 0.55);
  }
  if (skull && skullRest) {
    skull.quaternion.copy(skullRest);
    skull.rotateX(look * 0.22 + deadT * 0.12);
  }
}

export function resetAlienGltf(mesh: THREE.Group) {
  const mount = mesh.userData.gltfMount as THREE.Group | undefined;
  if (mount) mount.visible = true;
  const mixer = mesh.userData.gltfMixer as THREE.AnimationMixer | undefined;
  mixer?.setTime(0);
  driveAlienGltf(mesh, 0, 0, 0, 0);
}

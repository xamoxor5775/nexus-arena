import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const MODEL_URL = "/models/environment/moon-woke-up-v1.glb";
let moonAsset: Promise<THREE.Group> | null = null;

function loadMoon() {
  moonAsset ??= new GLTFLoader().loadAsync(MODEL_URL).then((gltf) => gltf.scene);
  return moonAsset;
}

export function preloadPozoSkyMoon() {
  return loadMoon().then(() => undefined);
}

/** Static sky decoration: no shadows, collision, animation or per-frame work. */
export function mountPozoSkyMoon(parent: THREE.Group) {
  let disposed = false;
  let moon: THREE.Group | null = null;

  void loadMoon().then((source) => {
    if (disposed) return;
    moon = source.clone(true);
    moon.name = "pozo-sky-moon";
    const box = new THREE.Box3().setFromObject(moon);
    const size = box.getSize(new THREE.Vector3());
    const scale = 46 / Math.max(size.x, size.y, size.z, 0.001);
    const center = box.getCenter(new THREE.Vector3());
    moon.position.set(-center.x * scale - 132, -center.y * scale + 92, -center.z * scale - 138);
    moon.scale.setScalar(scale);
    moon.rotation.y = 0.42;
    moon.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = false;
      object.receiveShadow = false;
      object.frustumCulled = true;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      object.material = materials.map((material) => {
        const copy = material.clone();
        copy.depthWrite = true;
        if (copy instanceof THREE.MeshStandardMaterial) {
          copy.roughness = Math.max(0.72, copy.roughness);
          copy.metalness = Math.min(0.08, copy.metalness);
          copy.emissive.set(0x111822);
          copy.emissiveIntensity = 0.22;
        }
        return copy;
      });
      if (materials.length === 1) object.material = (object.material as THREE.Material[])[0]!;
    });
    moon.updateMatrixWorld(true);
    moon.matrixAutoUpdate = false;
    parent.add(moon);
  }).catch((error: unknown) => console.warn("[pozo-sky-moon] model unavailable", error));

  return {
    dispose() {
      disposed = true;
      if (!moon) return;
      parent.remove(moon);
      moon.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      });
      moon = null;
    },
  };
}

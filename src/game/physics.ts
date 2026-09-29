import * as THREE from "three";

export {
  aabb,
  blockedAt,
  bodyBox,
  boxAt,
  closestPointAABB,
  depenetrate,
  moveBody,
  overlaps,
  pointIn,
  rayAABB,
  raycastWorld,
} from "./collision";

const _accDir = new THREE.Vector3();

/** Quake-style horizontal accelerate against a wish direction. */
export function accelerateWish(
  vel: THREE.Vector3,
  wish: THREE.Vector3,
  wishSp: number,
  accel: number,
  dt: number,
) {
  if (wishSp <= 0 || wish.lengthSq() < 0.0001) return;
  _accDir.copy(wish).normalize();
  const current = vel.x * _accDir.x + vel.z * _accDir.z;
  const add = wishSp - current;
  if (add <= 0) return;
  let acc = accel * dt * wishSp;
  if (acc > add) acc = add;
  vel.x += _accDir.x * acc;
  vel.z += _accDir.z * acc;
}

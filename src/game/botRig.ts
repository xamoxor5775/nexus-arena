import * as THREE from "three";

/**
 * Procedural run / shoot animation for full-body GLB bots.
 *
 * Skinned models: limbs are found by bone name (tolerant to Unreal `thigh_l_0193`,
 * Mixamo `mixamorig:LeftUpLeg`, `THIGH_R_0247`, ...) and posed by aiming each bone
 * segment towards a target direction expressed in the fighter root space
 * (forward = -Z, right = +X, up = +Y). This works regardless of the rig's local
 * bone axes or rest pose (T-pose / A-pose). Static meshes get body motion only.
 */

export type RigPose = {
  speed: number;
  grounded: boolean;
  velY: number;
  pitch: number;
  dt: number;
  firing: boolean;
  dead: boolean;
  deadT: number;
  cycle: number;
};

export type RigOptions = {
  /** Lateral spread of the idle arms (bulky models need more). */
  armOut?: number;
};

type Limb = {
  upper: THREE.Object3D;
  mid: THREE.Object3D;
  end: THREE.Object3D;
  tip: THREE.Object3D | null;
};

type Rig = {
  root: THREE.Object3D;
  mount: THREE.Object3D;
  height: number;
  driven: THREE.Object3D[];
  rest: THREE.Quaternion[];
  spine: THREE.Object3D[];
  head: THREE.Object3D | null;
  armR: Limb | null;
  armL: Limb | null;
  legR: Limb | null;
  legL: Limb | null;
  footSlope: number;
  armOut: number;
  aim: number;
  kick: number;
  wasFiring: boolean;
  clock: number;
};

const BAD =
  /twist|roll|fix|scale|socket|(^|_)ik|ik_|vol|end$|_end|nub|option|utility|effect|fx_|latissimus|muscle|thorn|trapez|pole|target|weapon|attach|prop|jiggle|breast|hair|cloth|skirt|coat|cape|finger|thumb|index|middle|ring|pinky|metacarpal|phalange|eye|jaw|tongue|teeth|lip|brow|throw|reserve|helper|dummy/i;

function cleanName(name: string) {
  return name
    .replace(/^.*[:|]/, "")
    .replace(/(_\d+)+$/, "")
    .replace(/\.\d+$/, "");
}

function depthOf(o: THREE.Object3D) {
  let d = 0;
  let p = o.parent;
  while (p) {
    d++;
    p = p.parent;
  }
  return d;
}

function boneCount(o: THREE.Object3D): number {
  let n = 0;
  o.traverse((c) => {
    if ((c as THREE.Bone).isBone && c !== o) n++;
  });
  return n;
}

function isAncestor(a: THREE.Object3D, b: THREE.Object3D) {
  let p = b.parent;
  while (p) {
    if (p === a) return true;
    p = p.parent;
  }
  return false;
}

function bestChild(o: THREE.Object3D): THREE.Object3D | null {
  let best: THREE.Object3D | null = null;
  let score = -1;
  for (const c of o.children) {
    if (!(c as THREE.Bone).isBone) continue;
    if (BAD.test(cleanName(c.name)) && !/toe|ball|foot|hand|wrist|ankle/i.test(cleanName(c.name))) continue;
    const s = boneCount(c) * 10 + c.position.length() / Math.max(1e-6, o.position.length() + c.position.length());
    if (s > score) {
      score = s;
      best = c;
    }
  }
  return best;
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _tp = new THREE.Vector3();
const _m = new THREE.Matrix4();
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const NEG_Z = new THREE.Vector3(0, 0, -1);

function rootLocal(rig: Rig, obj: THREE.Object3D, out: THREE.Vector3) {
  out.setFromMatrixPosition(obj.matrixWorld);
  _m.copy(rig.root.matrixWorld).invert();
  return out.applyMatrix4(_m);
}

function parentWorldQuat(o: THREE.Object3D, out: THREE.Quaternion) {
  if (!o.parent) return out.identity();
  o.parent.matrixWorld.decompose(_tp, out, _s);
  return out;
}

function rootWorldQuat(rig: Rig, out: THREE.Quaternion) {
  rig.root.matrixWorld.decompose(_tp, out, _s);
  return out;
}

/** Rotate bone so the segment bone->child points along `dir` (root space). */
function aimBone(rig: Rig, bone: THREE.Object3D, child: THREE.Object3D, dir: THREE.Vector3, weight = 1) {
  bone.updateWorldMatrix(false, false);
  const from = _v1.setFromMatrixPosition(bone.matrixWorld);
  const to = _v2.copy(child.position).applyMatrix4(bone.matrixWorld).sub(from);
  if (to.lengthSq() < 1e-10) return;
  to.normalize();
  const want = _v3.copy(dir).normalize().applyQuaternion(rootWorldQuat(rig, _q3));
  _q1.setFromUnitVectors(to, want);
  if (weight < 1) _q1.slerp(_q2.identity(), 1 - weight);
  parentWorldQuat(bone, _q2);
  // local' = P^-1 * q * P * local
  const pInv = _q3.copy(_q2).invert();
  bone.quaternion.premultiply(pInv.multiply(_q1).multiply(_q2));
  bone.updateWorldMatrix(false, false);
  child.updateWorldMatrix(false, false);
}

/** Rotate bone by pitch (about root X) then yaw (about root Y). */
function turnBone(rig: Rig, bone: THREE.Object3D, pitch: number, yaw = 0) {
  if (Math.abs(pitch) < 1e-5 && Math.abs(yaw) < 1e-5) return;
  const rq = rootWorldQuat(rig, _q3);
  _q1.setFromAxisAngle(_v1.copy(X).applyQuaternion(rq).normalize(), pitch);
  _q2.setFromAxisAngle(_v1.copy(Y).applyQuaternion(rq).normalize(), yaw);
  _q1.premultiply(_q2);
  parentWorldQuat(bone, _q2);
  const pInv = _q3.copy(_q2).invert();
  bone.quaternion.premultiply(pInv.multiply(_q1).multiply(_q2));
  bone.updateWorldMatrix(false, true);
}

function pickBones(bones: THREE.Object3D[], patterns: RegExp[]) {
  for (const re of patterns) {
    const hits = bones.filter((b) => {
      const n = cleanName(b.name);
      return re.test(n) && !BAD.test(n);
    });
    if (hits.length) return hits;
  }
  return [];
}

function limbFrom(upper: THREE.Object3D | undefined, minLen: number): Limb | null {
  if (!upper) return null;
  const mid = bestChild(upper);
  if (!mid) return null;
  const end = bestChild(mid);
  if (!end) return null;
  if (mid.getWorldPosition(_v1).distanceTo(upper.getWorldPosition(_v2)) < minLen) return null;
  if (end.getWorldPosition(_v1).distanceTo(mid.getWorldPosition(_v2)) < minLen) return null;
  return { upper, mid, end, tip: bestChild(end) };
}

/**
 * Build a rig description for a cloned skinned model. `root` is the fighter root
 * group, `mount` the group holding the model (already fitted).
 */
export function buildRig(root: THREE.Object3D, mount: THREE.Object3D, height: number, opts: RigOptions = {}): Rig | null {
  const bones: THREE.Object3D[] = [];
  mount.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones.push(o);
  });
  if (bones.length < 8) return null;
  root.updateMatrixWorld(true);
  const rig: Rig = {
    root,
    mount,
    height,
    driven: [],
    rest: [],
    spine: [],
    head: null,
    armR: null,
    armL: null,
    legR: null,
    legL: null,
    footSlope: -0.45,
    armOut: opts.armOut ?? 0.28,
    aim: 0,
    kick: 0,
    wasFiring: false,
    clock: 0,
  };
  const top = (list: THREE.Object3D[]) => list.slice().sort((a, b) => depthOf(a) - depthOf(b));
  const side = (list: THREE.Object3D[], sign: number) =>
    top(list).find((b) => Math.sign(rootLocal(rig, b, _v1).x) === sign && Math.abs(_v1.x) > height * 0.02);

  const thighs = pickBones(bones, [/thigh/i, /up_?leg|upper_?leg/i, /^(l|r)_?hip$|^hip_?(l|r)$/i]);
  const arms = pickBones(bones, [/upper_?arm|arm_?upper/i, /^(left|right)_?arm$|^arm_?(l|r)$|^(l|r)_?arm$/i, /shoulder/i]);
  const minLen = height * 0.06;
  rig.legR = limbFrom(side(thighs, 1), minLen);
  rig.legL = limbFrom(side(thighs, -1), minLen);
  rig.armR = limbFrom(side(arms, 1), minLen);
  rig.armL = limbFrom(side(arms, -1), minLen);

  const heads = top(pickBones(bones, [/^head$/i, /^head/i]));
  rig.head = heads[0] ?? null;
  const anchor = rig.head ?? rig.armR?.upper ?? null;
  if (anchor) {
    rig.spine = top(pickBones(bones, [/spine|chest|torso|abdomen/i])).filter((b) => isAncestor(b, anchor) && b.children.some((c) => (c as THREE.Bone).isBone));
  }
  if (!rig.legR && !rig.armR) return null;

  const legTip = rig.legR ?? rig.legL;
  if (legTip?.tip) {
    const a = rootLocal(rig, legTip.end, new THREE.Vector3());
    const b = rootLocal(rig, legTip.tip, new THREE.Vector3());
    const d = b.sub(a);
    const horiz = Math.hypot(d.x, d.z);
    if (horiz > 1e-4) rig.footSlope = THREE.MathUtils.clamp(d.y / horiz, -1.2, 0.2);
  }

  const add = (o: THREE.Object3D | null | undefined) => {
    if (!o || rig.driven.includes(o)) return;
    rig.driven.push(o);
    rig.rest.push(o.quaternion.clone());
  };
  rig.spine.forEach(add);
  add(rig.head);
  for (const limb of [rig.legR, rig.legL, rig.armR, rig.armL]) {
    if (!limb) continue;
    add(limb.upper);
    add(limb.mid);
    add(limb.end);
  }
  return rig;
}

export function rigSummary(rig: Rig) {
  const n = (o: THREE.Object3D | null | undefined) => (o ? o.name : "-");
  const l = (x: Limb | null) => (x ? `${n(x.upper)}>${n(x.mid)}>${n(x.end)}>${n(x.tip)}` : "-");
  return {
    spine: rig.spine.map((b) => b.name),
    head: n(rig.head),
    armR: l(rig.armR),
    armL: l(rig.armL),
    legR: l(rig.legR),
    legL: l(rig.legL),
    footSlope: +rig.footSlope.toFixed(2),
  };
}

export function resetRig(rig: Rig) {
  rig.driven.forEach((b, i) => b.quaternion.copy(rig.rest[i]!));
  if (rig.head) rig.head.scale.setScalar(1);
  rig.aim = 0;
  rig.kick = 0;
  rig.wasFiring = false;
}

const _d = new THREE.Vector3();
const _g1 = new THREE.Vector3();
const _g2 = new THREE.Vector3();
const _g3 = new THREE.Vector3();
const _e = new THREE.Vector3();

function down(angle: number, lat: number, out: THREE.Vector3) {
  // segment pointing down, swung forward (towards -Z) by `angle`
  return out.set(lat, -Math.cos(angle), -Math.sin(angle)).normalize();
}

function pitchVec(v: THREE.Vector3, pitch: number) {
  return v.applyAxisAngle(X, pitch);
}

/** Pose the skeleton for this frame. Returns the right-hand world anchor for the gun. */
export function driveRig(rig: Rig, pose: RigPose, gun: THREE.Object3D | null) {
  const dt = Math.min(0.1, pose.dt);
  rig.clock += dt;
  rig.driven.forEach((b, i) => b.quaternion.copy(rig.rest[i]!));
  rig.root.updateMatrixWorld(true);

  const run = pose.grounded && !pose.dead ? THREE.MathUtils.clamp(pose.speed / 8.5, 0, 1) : 0;
  const c = pose.cycle;
  const sinL = Math.sin(c);
  const sinR = -sinL;

  if (pose.firing && !rig.wasFiring) rig.kick = 1;
  if (pose.firing) rig.kick = Math.max(rig.kick, 0.55 + 0.45 * Math.sin(rig.clock * 38));
  rig.wasFiring = pose.firing;
  rig.kick = Math.max(0, rig.kick - dt * 7);
  // raise quickly when a shot goes out, lower slowly so the bot keeps aiming between shots
  rig.aim += ((pose.firing ? 1 : 0) - rig.aim) * Math.min(1, dt * (pose.firing ? 18 : 1.6));
  const aim = pose.dead ? 0 : rig.aim;
  const kick = pose.dead ? 0 : rig.kick;
  const dead = pose.dead ? Math.min(1, pose.deadT) : 0;
  const pitch = THREE.MathUtils.clamp(pose.pitch, -0.9, 0.9);

  // torso: forward lean when running, twist with stride, recoil push back
  const nSp = Math.max(1, rig.spine.length);
  const lean = run * 0.2 + (pose.grounded ? 0 : 0.08) + dead * 0.25;
  const twist = sinL * run * 0.16 * (1 - aim * 0.7);
  for (const b of rig.spine) {
    turnBone(rig, b, (-lean + kick * 0.1 + pitch * 0.12 * aim) / nSp, twist / nSp);
  }
  if (rig.head) turnBone(rig, rig.head, pitch * 0.35 + lean * 0.4 - kick * 0.05);

  // legs
  const legPose = (limb: Limb | null, s: number, sw: number, sign: number) => {
    if (!limb) return;
    let thigh: number;
    let knee: number;
    if (pose.dead) {
      thigh = (sign > 0 ? 0.35 : -0.1) * dead;
      knee = (sign > 0 ? 0.9 : 0.4) * dead;
    } else if (!pose.grounded) {
      const tuck = pose.velY > 0 ? 1 : 0.6;
      thigh = (sign > 0 ? 0.62 : 0.2) * tuck;
      knee = (sign > 0 ? 1.15 : 0.75) * tuck;
    } else {
      thigh = sw * 0.72 * run;
      knee = 0.05 + run * (0.2 + 1.05 * Math.max(0, -sw)) + (1 - run) * 0.02;
    }
    const lat = s * 0.05;
    aimBone(rig, limb.upper, limb.mid, down(thigh, lat, _d));
    aimBone(rig, limb.mid, limb.end, down(thigh - knee, lat * 0.5, _d));
    if (limb.tip) {
      _e.set(s * 0.12, rig.footSlope, -1).normalize();
      _e.applyAxisAngle(X, (thigh - knee) * 0.45 + (pose.grounded ? 0 : -0.35));
      aimBone(rig, limb.end, limb.tip, _e);
    }
  };
  legPose(rig.legL, -1, sinL, 1);
  legPose(rig.legR, 1, sinR, -1);

  // gun arm (right, +X)
  const out = rig.armOut;
  if (rig.armR) {
    const a = rig.armR;
    if (pose.dead) {
      aimBone(rig, a.upper, a.mid, _d.set(out + 0.5 * dead, -0.8, 0.25).normalize());
      aimBone(rig, a.mid, a.end, _d.set(out + 0.2, -0.9, -0.1).normalize());
    } else {
      // ready: gun held low forward; aim: arm extended at eye line
      const ready = _d.set(out * 0.55, -0.9, -0.38 - run * 0.08 * sinR).normalize();
      const aimed = pitchVec(_e.set(0.04, -0.1, -1).normalize(), pitch);
      ready.lerp(aimed, aim).normalize().applyAxisAngle(X, kick * 0.28);
      aimBone(rig, a.upper, a.mid, ready);
      const fr = _d.set(-0.12, -0.28, -1).normalize();
      const fa = pitchVec(_e.set(-0.1, 0.02, -1).normalize(), pitch);
      fr.lerp(fa, aim).normalize().applyAxisAngle(X, kick * 0.42);
      aimBone(rig, a.mid, a.end, fr);
    }
  }
  // support arm (left, -X): swings when running, supports the gun when aiming
  if (rig.armL) {
    const a = rig.armL;
    if (pose.dead) {
      aimBone(rig, a.upper, a.mid, _d.set(-out - 0.5 * dead, -0.8, 0.3).normalize());
      aimBone(rig, a.mid, a.end, _d.set(-out - 0.2, -0.9, 0).normalize());
    } else {
      const swing = -sinL * 0.85 * run;
      const bend = 0.35 + run * 0.9 + (pose.grounded ? 0 : 0.5);
      const up = down(swing, -out, _d);
      const upAim = pitchVec(_e.set(-0.32, -0.42, -0.85).normalize(), pitch);
      up.lerp(upAim, aim * 0.85).normalize();
      aimBone(rig, a.upper, a.mid, up);
      const fore = down(swing + bend, -out * 0.5, _d);
      const foreAim = pitchVec(_e.set(0.62, 0.1, -0.78).normalize(), pitch);
      fore.lerp(foreAim, aim * 0.85).normalize();
      aimBone(rig, a.mid, a.end, fore);
    }
  }

  if (pose.dead && rig.head) {
    const broken = rig.root.userData.breakPart as string | null | undefined;
    if (broken === "head") {
      rig.mount.visible = true;
      rig.head.scale.setScalar(0.001);
    }
  }

  // keep the world gun in the right hand
  if (gun && rig.armR) {
    const a = rig.armR;
    a.end.updateWorldMatrix(false, false);
    const wrist = rootLocal(rig, a.end, _g1);
    const dir = rootLocal(rig, a.mid, _g2).sub(wrist).negate().normalize();
    const barrel = pitchVec(_g3.copy(NEG_Z), pitch * aim).lerp(dir, 0.35).normalize();
    if (gun.parent !== rig.root) rig.root.add(gun);
    gun.quaternion.setFromUnitVectors(NEG_Z, barrel);
    gun.position.copy(wrist).addScaledVector(dir, rig.height * 0.045).addScaledVector(barrel, 0.05).addScaledVector(Y, 0.02);
    gun.scale.setScalar(1);
  }
}

/** Body motion for static (unskinned) full-body meshes. */
export function driveStatic(
  mount: THREE.Object3D,
  base: { x: number; y: number; z: number; yaw: number },
  state: { kick: number; wasFiring: boolean; clock: number },
  pose: RigPose,
) {
  const dt = Math.min(0.1, pose.dt);
  state.clock += dt;
  if (pose.firing && !state.wasFiring) state.kick = 1;
  if (pose.firing) state.kick = Math.max(state.kick, 0.5 + 0.5 * Math.sin(state.clock * 38));
  state.wasFiring = pose.firing;
  state.kick = Math.max(0, state.kick - dt * 7);
  const run = pose.grounded && !pose.dead ? THREE.MathUtils.clamp(pose.speed / 8.5, 0, 1) : 0;
  const c = pose.cycle;
  const s = Math.sin(c);
  const kick = pose.dead ? 0 : state.kick;
  const dead = pose.dead ? Math.min(1, pose.deadT) : 0;
  const breath = run < 0.05 && !pose.dead ? Math.sin(state.clock * 2.2) * 0.006 : 0;
  mount.position.set(
    base.x + s * run * 0.03,
    base.y + Math.abs(s) * run * 0.07 - run * 0.02 + breath + (pose.grounded ? 0 : 0.03),
    base.z + kick * 0.05,
  );
  mount.rotation.set(-run * 0.16 + kick * 0.09 - (pose.grounded ? 0 : 0.06) + dead * 0.15, base.yaw + s * run * 0.07, s * run * 0.06);
}

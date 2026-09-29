import * as THREE from "three";
import { attachAlienGltf, driveAlienGltf, resetAlienGltf } from "./alienGltf";
import {
  attachBotModel,
  attachChibiGltf,
  attachSentinelGltf,
  driveBotModel,
  driveSentinelGltf,
  resetBotModel,
  resetSentinelGltf,
} from "./sentinelGltf";
import { loadTex } from "./textures";
import { buildWorldGun } from "./viewmodel";

export type FighterPose = {
  speed: number;
  grounded: boolean;
  velY: number;
  pitch: number;
  dt: number;
  firing: boolean;
  dead: boolean;
  land: number;
  protect: boolean;
};

type FighterParts = {
  hips: THREE.Group;
  torso: THREE.Group;
  neck: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  elbowL: THREE.Group;
  handL: THREE.Group;
  armR: THREE.Group;
  elbowR: THREE.Group;
  handR: THREE.Group;
  legL: THREE.Group;
  kneeL: THREE.Group;
  footL: THREE.Group;
  legR: THREE.Group;
  kneeR: THREE.Group;
  footR: THREE.Group;
  gun: THREE.Group;
};

function partsOf(mesh: THREE.Group): FighterParts | undefined {
  return mesh.userData.parts as FighterParts | undefined;
}

let metalMap: THREE.Texture | null = null;
let visorMap: THREE.Texture | null = null;
let bootMap: THREE.Texture | null = null;
let skinMap: THREE.Texture | null = null;
let armorMap: THREE.Texture | null = null;
let cyanMap: THREE.Texture | null = null;

function maps() {
  if (!metalMap) {
    metalMap = loadTex("/textures/weapon-steel.jpg", 2.4, 2.4);
    visorMap = loadTex("/textures/visor.jpg", 1, 1);
  }
  if (!bootMap) bootMap = loadTex("/textures/bots/space-boot-v1.webp", 1.4, 1.4);
  if (!skinMap) skinMap = loadTex("/textures/bots/alien-skin-albedo-v1.webp", 2.4, 2.4);
  if (!armorMap) armorMap = loadTex("/textures/bots/space-armor-albedo-v1.webp", 2.1, 2.1);
  if (!cyanMap) cyanMap = loadTex("/textures/bots/cyan-emissive-v1.webp", 1.6, 1.6);
  return {
    metal: metalMap,
    visor: visorMap!,
    boot: bootMap,
    skin: skinMap,
    armor: armorMap,
    cyan: cyanMap,
  };
}

function std(color: number, extra: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0.42,
    roughness: 0.46,
    ...extra,
  });
}

function kitScale(k: number) {
  if (k === 4) return 1.18;
  if (k >= 5 && k <= 10) return 1;
  const base = k === 0 ? 1.08 : k === 1 ? 0.92 : k === 3 ? 0.96 : 1;
  return base * 1.22;
}

function shadow(obj: THREE.Object3D) {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
}

function cap(r: number, len: number, mat: THREE.Material, segs = 7) {
  return new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 3, segs), mat);
}

function makeAlienHead(
  skin: THREE.Material,
  armor: THREE.Material,
  glow: THREE.Material,
  eyeMat: THREE.MeshStandardMaterial,
) {
  const head = new THREE.Group();
  const neck = cap(0.042, 0.07, skin);
  neck.position.y = -0.22;
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.016, 6, 14), armor);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = -0.17;

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 16), skin);
  skull.scale.set(0.9, 1.42, 0.92);
  skull.position.y = 0.04;
  const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 12), skin);
  cranium.scale.set(1.08, 0.72, 1.05);
  cranium.position.set(0, 0.16, -0.02);
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), skin);
  jaw.scale.set(0.88, 0.55, 0.78);
  jaw.position.set(0, -0.12, 0.04);
  const chin = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), skin);
  chin.scale.set(1.1, 0.7, 1.2);
  chin.position.set(0, -0.16, 0.08);

  const mkEye = (side: number) => {
    const eye = new THREE.Group();
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.052, 14, 10), eyeMat);
    lens.scale.set(1.42, 0.78, 0.52);
    const gloss = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 8, 6),
      std(0xd8ffff, { emissive: 0x7ae8ff, emissiveIntensity: 0.35, roughness: 0.08, metalness: 0.4, toneMapped: false }),
    );
    gloss.position.set(side * -0.012, 0.012, 0.028);
    eye.add(lens, gloss);
    eye.position.set(side * 0.068, 0.01, 0.155);
    eye.rotation.y = side * -0.18;
    return eye;
  };

  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.016, 0.012), skin);
  nose.position.set(0, -0.05, 0.175);
  const slitL = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.018, 0.006), eyeMat);
  slitL.position.set(-0.01, -0.052, 0.182);
  slitL.rotation.z = 0.35;
  const slitR = slitL.clone();
  slitR.position.x = 0.01;
  slitR.rotation.z = -0.35;
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.006, 0.008), eyeMat);
  mouth.position.set(0, -0.1, 0.155);

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 16, 12),
    std(0xd8fff8, {
      emissive: 0x7ff5e4,
      emissiveIntensity: 0.12,
      transparent: true,
      opacity: 0.04,
      roughness: 0.08,
      metalness: 0.1,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  dome.scale.set(0.96, 1.38, 0.96);
  dome.position.y = 0.04;
  const cracks: THREE.Mesh[] = [];
  const crackMat = std(0xe8fff8, { emissive: 0xffffff, emissiveIntensity: 0.8, roughness: 0.2, toneMapped: false });
  for (let i = 0; i < 4; i++) {
    const crack = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.18, 0.007), crackMat);
    const a = i * 1.4 + 0.4;
    crack.position.set(Math.sin(a) * 0.17, 0.06 + (i % 2) * 0.05, Math.cos(a) * 0.16);
    crack.rotation.set(0.4, a, 0.5);
    crack.visible = false;
    cracks.push(crack);
  }

  const templeL = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.06, 0.012), glow);
  templeL.position.set(-0.16, 0.02, 0.04);
  const templeR = templeL.clone();
  templeR.position.x = 0.16;

  head.add(neck, collar, skull, cranium, jaw, chin, mkEye(-1), mkEye(1), nose, slitL, slitR, mouth, dome, templeL, templeR, ...cracks);
  head.userData.dome = dome;
  head.userData.cracks = cracks;
  head.userData.seal = 1;
  return head;
}

function headOf(mesh: THREE.Group) {
  return partsOf(mesh)?.head;
}

export function crackFighter(mesh: THREE.Group, ratio: number) {
  const head = headOf(mesh);
  if (!head) return;
  const seal = Math.max(0, Math.min(1, (head.userData.seal as number) ?? 1, ratio));
  head.userData.seal = seal;
  const dome = head.userData.dome as THREE.Mesh | undefined;
  const mat = dome?.material as THREE.MeshStandardMaterial | undefined;
  if (mat) {
    mat.opacity = 0.14 + (1 - seal) * 0.4;
    mat.emissiveIntensity = 0.35 + (1 - seal) * 1.35;
  }
  const cracks = (head.userData.cracks as THREE.Mesh[] | undefined) ?? [];
  cracks.forEach((crack, i) => {
    crack.visible = seal < 0.82 - i * 0.18;
  });
}

export function shatterFighter(mesh: THREE.Group) {
  const head = headOf(mesh);
  if (!head) return;
  head.userData.seal = 0;
  const dome = head.userData.dome as THREE.Mesh | undefined;
  if (dome) dome.visible = false;
  const cracks = (head.userData.cracks as THREE.Mesh[] | undefined) ?? [];
  for (const crack of cracks) crack.visible = false;
}

export function makeBotMesh(color: number, kit = 0): THREE.Group {
  const { metal, visor: visorTex, boot: bootTex, skin: skinTex, armor: armorTex, cyan: cyanTex } = maps();
  const root = new THREE.Group();
  const gltfBust = kit === 4;
  // 5 stellar sentinel, 6 chibi, 7-10 roster models (cowboy, venom, cowgirl, goku)
  const gltfFull = kit >= 5 && kit <= 10;
  const gltfKit = gltfBust || gltfFull;
  const k = gltfKit ? 1 : kit % 4;
  const wide = k === 0 ? 1.08 : k === 1 ? 0.9 : k === 3 ? 0.96 : 1;
  const skin = std(0xd4ece4, {
    map: skinTex,
    metalness: 0.05,
    roughness: 0.62,
    emissive: 0x0a2a22,
    emissiveIntensity: 0.08,
    toneMapped: false,
  });
  const armor = std(k === 3 ? 0xd8c898 : 0xffffff, {
    map: armorTex,
    metalness: 0.68,
    roughness: 0.34,
    toneMapped: false,
  });
  const suit = std(0x8a9098, {
    map: armorTex,
    metalness: 0.22,
    roughness: 0.7,
    toneMapped: false,
  });
  const steel = std(0xc8ced6, { map: metal, metalness: 0.74, roughness: 0.28 });
  const glow = std(0xffffff, {
    map: cyanTex,
    emissive: 0x3cf0ff,
    emissiveMap: cyanTex,
    emissiveIntensity: 1.15,
    metalness: 0.18,
    roughness: 0.22,
    toneMapped: false,
  });
  const idGlow = std(color, { emissive: color, emissiveIntensity: 1.28, metalness: 0.22, roughness: 0.24, toneMapped: false });
  const eyeMat = std(0x05080c, {
    roughness: 0.08,
    metalness: 0.42,
    emissive: 0x031018,
    emissiveIntensity: 0.45,
    toneMapped: false,
  });
  const bootArmor = std(0xffffff, { map: bootTex, metalness: 0.4, roughness: 0.46, toneMapped: false });
  const visor = std(0xffffff, {
    map: visorTex,
    emissive: 0x3cf0ff,
    emissiveMap: visorTex,
    emissiveIntensity: 1.05,
    metalness: 0.15,
    roughness: 0.16,
  });

  const hips = new THREE.Group();
  hips.position.y = 0.74;
  const pelvis = new THREE.Mesh(new THREE.CapsuleGeometry(0.11 * wide, 0.05, 3, 8), suit);
  pelvis.scale.set(1.38, 0.78, 1.02);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.13 * wide, 0.02, 6, 14), armor);
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 0.04;
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.07 * wide, 0.04, 0.035), glow);
  buckle.position.set(0, 0.02, 0.13 * wide);
  hips.add(pelvis, belt, buckle);

  const mkLeg = (side: number) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.11 * wide, -0.02, 0);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.078 * wide, 10, 8), armor);
    const thigh = cap(0.068 * wide, 0.2, suit, 8);
    thigh.position.y = -0.15;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.09 * wide, 0.16, 0.04), armor);
    plate.position.set(0, -0.14, 0.055);
    const knee = new THREE.Group();
    knee.position.y = -0.3;
    const kneeBall = new THREE.Mesh(new THREE.SphereGeometry(0.062 * wide, 10, 8), armor);
    const shinM = cap(0.058 * wide, 0.2, armor, 8);
    shinM.position.y = -0.13;
    const shinLight = new THREE.Mesh(new THREE.BoxGeometry(0.035 * wide, 0.09, 0.018), glow);
    shinLight.position.set(0, -0.12, 0.068);
    const foot = new THREE.Group();
    foot.position.y = -0.28;
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.11 * wide, 0.09, 0.2), bootArmor);
    boot.position.set(0, -0.04, 0.04);
    const toe = new THREE.Mesh(new THREE.BoxGeometry(0.1 * wide, 0.055, 0.08), bootArmor);
    toe.position.set(0, -0.05, 0.14);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.12 * wide, 0.026, 0.24), steel);
    sole.position.set(0, -0.09, 0.055);
    const toeLight = new THREE.Mesh(new THREE.BoxGeometry(0.05 * wide, 0.018, 0.04), glow);
    toeLight.position.set(0, -0.02, 0.175);
    foot.add(boot, toe, sole, toeLight);
    knee.add(kneeBall, shinM, shinLight, foot);
    hip.add(ball, thigh, plate, knee);
    hip.userData.knee = knee;
    hip.userData.foot = foot;
    return hip;
  };
  const legL = mkLeg(-1);
  const legR = mkLeg(1);
  hips.add(legL, legR);

  const torso = new THREE.Group();
  torso.position.y = 0.14;
  const chestW = k === 0 ? 1.18 : k === 1 ? 0.92 : 1.04;
  const core = cap(0.11 * wide, 0.16, skin, 8);
  core.scale.set(1.05, 1, 0.78);
  core.position.y = 0.04;
  const pecL = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), armor);
  pecL.scale.set(1.15 * chestW, 0.62, 0.55);
  pecL.position.set(-0.08 * chestW, 0.2, 0.08);
  const pecR = pecL.clone();
  pecR.position.x *= -1;
  const rib = new THREE.Mesh(new THREE.BoxGeometry(0.28 * chestW, 0.12, 0.08), armor);
  rib.position.set(0, 0.08, 0.09);
  const chestBar = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.16, 0.03), glow);
  chestBar.position.set(0, 0.2, 0.145);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.09 * chestW, 0.022, 6, 12), armor);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.36;
  const abs = cap(0.1 * wide, 0.06, skin, 8);
  abs.scale.set(1.05, 1, 0.72);
  abs.position.y = -0.1;
  if (gltfKit) torso.add(abs);
  else torso.add(core, pecL, pecR, rib, chestBar, collar, abs);

  const backPlate = new THREE.Mesh(new THREE.BoxGeometry(0.22 * chestW, 0.26, 0.06), armor);
  backPlate.position.set(0, 0.16, -0.12);
  const backBar = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.14, 0.024), glow);
  backBar.position.set(0, 0.2, -0.155);
  const pauldron = (side: number) => {
    const p = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), armor);
    shell.scale.set(1.15, 0.52, 1.02);
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.028, 0.05), glow);
    light.position.set(side * 0.02, 0.04, 0.02);
    p.add(shell, light);
    p.position.set(side * 0.22 * chestW, 0.3, 0.02);
    return p;
  };
  if (!gltfKit) torso.add(backPlate, backBar, pauldron(-1), pauldron(1));

  const mkArm = (side: number) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.26 * chestW, 0.26, 0);
    const deltoid = new THREE.Mesh(new THREE.SphereGeometry(0.062 * wide, 10, 8), armor);
    const upper = cap(0.046 * wide, 0.16, skin, 8);
    upper.position.y = -0.12;
    const elbow = new THREE.Group();
    elbow.position.y = -0.24;
    const elbowBall = new THREE.Mesh(new THREE.SphereGeometry(0.048 * wide, 8, 6), armor);
    const gauntlet = cap(0.046 * wide, 0.13, armor, 8);
    gauntlet.position.y = -0.1;
    const cuffLight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.055, 0.02), glow);
    cuffLight.position.set(0, -0.1, 0.05);
    const hand = new THREE.Group();
    hand.position.y = -0.22;
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 6), skin);
    palm.scale.set(1.05, 0.78, 1.18);
    hand.add(palm);
    elbow.add(elbowBall, gauntlet, cuffLight, hand);
    shoulder.add(deltoid, upper, elbow);
    shoulder.userData.elbow = elbow;
    shoulder.userData.hand = hand;
    return shoulder;
  };
  const armL = mkArm(-1);
  const armR = mkArm(1);

  const idCell = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.028, 0.036), idGlow);
  idCell.position.set(0, 0.3, 0.12);
  const beaconL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.024, 0.032), idGlow);
  beaconL.position.set(-0.16 * chestW, 0.28, -0.08);
  const beaconR = beaconL.clone();
  beaconR.position.x *= -1;
  torso.add(idCell, beaconL, beaconR, armL, armR);

  const gun = buildWorldGun(steel, suit, visor, k === 2 ? "scatter" : k === 3 ? "lance" : k === 0 ? "torpedo" : "pulse");
  gun.name = "worldGun";
  gun.position.set(0.02, 0.02, 0.16);
  gun.rotation.x = 0.15;
  (armR.userData.hand as THREE.Group).add(gun);

  const neck = new THREE.Group();
  neck.position.y = 0.38;
  const head = makeAlienHead(skin, armor, glow, eyeMat);
  head.position.y = 0.12;
  neck.add(head);
  torso.add(neck);
  hips.add(torso);
  root.add(hips);

  root.userData.flashMat = glow;
  root.userData.idGlow = idGlow;
  root.userData.cycle = 0;
  root.userData.kit = gltfBust ? 4 : gltfFull ? kit : k;
  root.userData.parts = {
    hips,
    torso,
    neck,
    head,
    armL,
    elbowL: armL.userData.elbow as THREE.Group,
    handL: armL.userData.hand as THREE.Group,
    armR,
    elbowR: armR.userData.elbow as THREE.Group,
    handR: armR.userData.hand as THREE.Group,
    legL,
    kneeL: legL.userData.knee as THREE.Group,
    footL: legL.userData.foot as THREE.Group,
    legR,
    kneeR: legR.userData.knee as THREE.Group,
    footR: legR.userData.foot as THREE.Group,
    gun,
  } satisfies FighterParts;
  root.userData.base = {
    hipsY: hips.position.y,
    torsoY: torso.position.y,
    headY: head.position.y,
  };
  root.scale.setScalar(kitScale((root.userData.kit as number) ?? k));
  shadow(root);
  if (gltfBust) attachAlienGltf(torso, head, root);
  if (kit === 5) attachSentinelGltf(root, head);
  if (kit === 6) attachChibiGltf(root, head);
  if (kit >= 7 && kit <= 10) attachBotModel(root, head, kit);
  return root;
}

export function resetFighterMesh(mesh: THREE.Group) {
  mesh.rotation.set(0, mesh.rotation.y, 0);
  const kit = (mesh.userData.kit as number) ?? 0;
  mesh.scale.setScalar(kitScale(kit));
  mesh.visible = true;
  mesh.userData.cycle = 0;
  mesh.userData.deadT = 0;
  const p = partsOf(mesh);
  if (!p) return;
  for (const joint of [
    p.hips,
    p.torso,
    p.neck,
    p.head,
    p.armL,
    p.elbowL,
    p.handL,
    p.armR,
    p.elbowR,
    p.handR,
    p.legL,
    p.kneeL,
    p.footL,
    p.legR,
    p.kneeR,
    p.footR,
  ]) {
    joint.rotation.set(0, 0, 0);
  }
  p.hips.position.y = 0.74;
  p.torso.position.y = 0.14;
  p.head.visible = kit < 4;
  const dome = p.head.userData.dome as THREE.Mesh | undefined;
  if (dome) {
    dome.visible = true;
    const mat = dome.material as THREE.MeshStandardMaterial;
    mat.opacity = 0.14;
    mat.emissiveIntensity = 0.45;
  }
  p.head.userData.seal = 1;
  for (const crack of (p.head.userData.cracks as THREE.Mesh[] | undefined) ?? []) crack.visible = false;
  p.armL.visible = true;
  p.armR.visible = true;
  p.legL.visible = true;
  p.legR.visible = true;
  mesh.userData.breakPart = null;
  resetAlienGltf(mesh);
  resetSentinelGltf(mesh);
  resetBotModel(mesh);
}

export function animateFighter(mesh: THREE.Group, pose: FighterPose) {
  const p = partsOf(mesh);
  if (!p) return;
  const dt = pose.dt;
  const kit = (mesh.userData.kit as number) ?? 0;
  const baseScale = kitScale(kit);
  if (pose.dead) {
    mesh.userData.deadT = (mesh.userData.deadT as number) + dt;
    const t = Math.min(1, mesh.userData.deadT as number);
    mesh.rotation.x = t * 1.15;
    p.armL.rotation.set(-0.55 * t, 0, 0.35 * t);
    p.elbowL.rotation.set(-0.9 * t, 0, 0);
    p.handL.rotation.set(0.2 * t, 0, 0);
    p.armR.rotation.set(0.35 * t, 0, -0.28 * t);
    p.elbowR.rotation.set(-0.7 * t, 0, 0);
    p.legL.rotation.set(0.45 * t, 0, 0.12 * t);
    p.kneeL.rotation.set(0.85 * t, 0, 0);
    p.footL.rotation.set(-0.3 * t, 0, 0);
    p.legR.rotation.set(-0.25 * t, 0, -0.1 * t);
    p.kneeR.rotation.set(0.4 * t, 0, 0);
    p.footR.rotation.set(0.2 * t, 0, 0);
    p.torso.rotation.set(0.22 * t, 0.15 * t, 0);
    p.neck.rotation.set(0.18 * t, 0, 0);
    p.head.rotation.set(0.35 * t, 0, 0.12 * t);
    mesh.scale.set(baseScale, baseScale * Math.max(0.78, 1 - t * 0.12), baseScale);
    const broken = mesh.userData.breakPart as string | null;
    if (broken === "head") {
      p.head.visible = false;
      const mount = mesh.userData.gltfMount as THREE.Group | undefined;
      if (mount) mount.visible = false;
    } else if (broken === "armL") p.armL.visible = false;
    else if (broken === "armR") p.armR.visible = false;
    else if (broken === "legL") p.legL.visible = false;
    else if (broken === "legR") p.legR.visible = false;
    driveAlienGltf(mesh, 0.4, 0, dt, t);
    driveSentinelGltf(mesh, { hipsZ: p.hips.rotation.z, torsoX: p.torso.rotation.x, bob: 0, pitch: 0.3, deadT: t });
    driveBotModel(mesh, { ...pose, deadT: t, cycle: (mesh.userData.cycle as number) ?? 0 });
    return;
  }

  const spd = pose.speed;
  mesh.userData.cycle = (mesh.userData.cycle as number) + dt * Math.min(11, 3.2 + spd * 1.35);
  const c = mesh.userData.cycle as number;
  const amp = pose.grounded ? Math.min(0.78, spd * 0.09) : 0;
  const sinL = Math.sin(c);
  const sinR = -sinL;

  const hipL = sinL * amp;
  const hipR = sinR * amp;
  const kneeL = 0.1 + Math.max(0, -sinL) * (0.58 + amp * 0.75);
  const kneeR = 0.1 + Math.max(0, -sinR) * (0.58 + amp * 0.75);
  const footL = -kneeL * 0.55 + hipL * 0.18;
  const footR = -kneeR * 0.55 + hipR * 0.18;
  const elbowBase = -0.32;

  if (pose.grounded) {
    p.legL.rotation.set(hipL, 0, 0.03 * sinL);
    p.legR.rotation.set(hipR, 0, 0.03 * sinR);
    p.kneeL.rotation.set(kneeL, 0, 0);
    p.kneeR.rotation.set(kneeR, 0, 0);
    p.footL.rotation.set(footL, 0, 0);
    p.footR.rotation.set(footR, 0, 0);
    p.armL.rotation.set(-hipL * 0.92, 0.08 * sinL, 0.12);
    p.armR.rotation.set(-hipR * 0.78, 0.08 * sinR, -0.12);
    p.elbowL.rotation.set(elbowBase - Math.max(0, sinL) * 0.42, 0, 0);
    p.elbowR.rotation.set(elbowBase - Math.max(0, sinR) * 0.42, 0, 0);
    p.handL.rotation.set(0.08 * sinL, 0, 0);
    p.handR.rotation.set(0.08 * sinR, 0, 0);
    p.hips.rotation.set(0, sinL * amp * 0.08, sinL * amp * 0.16);
    p.torso.rotation.set(-amp * 0.08, -sinL * amp * 0.22, -p.hips.rotation.z * 0.45);
  } else {
    const tuck = pose.velY > 0 ? 0.42 : 0.22;
    p.legL.rotation.set(-tuck, 0, 0.06);
    p.legR.rotation.set(-tuck * 0.72, 0, -0.05);
    p.kneeL.rotation.set(0.85 + tuck * 0.4, 0, 0);
    p.kneeR.rotation.set(0.7 + tuck * 0.35, 0, 0);
    p.footL.rotation.set(-0.35, 0, 0);
    p.footR.rotation.set(-0.28, 0, 0);
    p.armL.rotation.set(-0.62, 0.1, 0.18);
    p.armR.rotation.set(-0.12, -0.08, -0.16);
    p.elbowL.rotation.set(-0.85, 0, 0);
    p.elbowR.rotation.set(-0.55, 0, 0);
    p.handL.rotation.set(0.15, 0, 0);
    p.handR.rotation.set(0.05, 0, 0);
    p.hips.rotation.set(0.08, 0, 0);
    p.torso.rotation.set(-0.12, 0, 0);
  }

  if (pose.firing) {
    p.armR.rotation.set(-1.08, -0.12, -0.06);
    p.elbowR.rotation.set(-0.92, 0.08, 0);
    p.handR.rotation.set(0.18, 0, 0);
    p.torso.rotation.y += 0.1;
    p.torso.rotation.x += -0.04;
  }

  const look = THREE.MathUtils.clamp(pose.pitch, -0.9, 0.9);
  p.neck.rotation.set(look * 0.38, -p.torso.rotation.y * 0.55, 0);
  p.head.rotation.set(look * 0.28, -p.torso.rotation.y * 0.25, 0);
  driveAlienGltf(mesh, pose.pitch, -p.torso.rotation.y, dt);

  const breath = pose.grounded && spd < 0.4 ? Math.sin(c * 0.35) * 0.012 : 0;
  const bob = pose.grounded ? Math.abs(sinL) * amp * 0.045 : 0;
  const squash = pose.land > 0 ? -0.08 * Math.min(1, pose.land / 0.12) : 0;
  const stretch = !pose.grounded && pose.velY > 2 ? 0.06 : 0;
  mesh.scale.set(
    baseScale * (1 - stretch + Math.abs(squash) * 0.5),
    baseScale * (1 + stretch + squash),
    baseScale,
  );
  p.hips.position.y = 0.74 + bob;
  p.torso.position.y = 0.14 + breath;
  driveSentinelGltf(mesh, {
    hipsZ: p.hips.rotation.z,
    torsoX: p.torso.rotation.x,
    bob,
    pitch: pose.pitch,
    deadT: 0,
  });
  driveBotModel(mesh, { ...pose, deadT: 0, cycle: c });

  const flash = mesh.userData.flashMat as THREE.MeshStandardMaterial | undefined;
  if (flash) {
    const target = pose.protect ? 1.25 : 0.62;
    flash.emissiveIntensity += (target - flash.emissiveIntensity) * Math.min(1, dt * 8);
  }
  const idGlow = mesh.userData.idGlow as THREE.MeshStandardMaterial | undefined;
  if (idGlow) {
    const running = Math.min(1, spd / 10);
    const pulse = 0.76 + Math.sin(c * (0.55 + running * 0.16)) * 0.16 + (pose.firing ? 0.32 : 0);
    idGlow.emissiveIntensity += (pulse - idGlow.emissiveIntensity) * Math.min(1, dt * 10);
  }
}


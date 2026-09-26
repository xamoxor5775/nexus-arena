import * as THREE from "three";
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

let metalMap: THREE.Texture | null = null;
let polyMap: THREE.Texture | null = null;
let visorMap: THREE.Texture | null = null;
let skullMap: THREE.Texture | null = null;

function maps() {
  if (!metalMap) {
    metalMap = loadTex("/textures/weapon-steel.jpg", 2.4, 2.4);
    polyMap = loadTex("/textures/weapon-grip.jpg", 3.2, 3.2);
    visorMap = loadTex("/textures/visor.jpg", 1, 1);
    skullMap = loadTex("/textures/skull.jpg", 1, 1);
  }
  return { metal: metalMap, poly: polyMap!, visor: visorMap!, skull: skullMap! };
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

const FACE_TONE = ["#c48a6a", "#e4b898", "#8d5a3c", "#c4a06a"];
const faceCache = new Map<number, THREE.CanvasTexture>();

function faceMap(k: number) {
  const cached = faceCache.get(k);
  if (cached) return cached;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 320;
  const g = c.getContext("2d");
  if (!g) return null;
  g.fillStyle = FACE_TONE[k] ?? FACE_TONE[0]!;
  g.fillRect(0, 0, 256, 320);
  const shade = g.createLinearGradient(0, 0, 0, 320);
  shade.addColorStop(0, "rgba(255,255,255,0.18)");
  shade.addColorStop(0.45, "rgba(0,0,0,0)");
  shade.addColorStop(1, "rgba(70,30,20,0.28)");
  g.fillStyle = shade;
  g.fillRect(0, 0, 256, 320);
  g.fillStyle = "rgba(40,18,12,0.55)";
  g.beginPath();
  g.ellipse(78, 118, 38, 10, -0.2, 0, Math.PI * 2);
  g.ellipse(178, 118, 38, 10, 0.2, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#f6f1ea";
  g.beginPath();
  g.ellipse(78, 142, 28, 16, 0, 0, Math.PI * 2);
  g.ellipse(178, 142, 28, 16, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = k === 2 ? "#3a2414" : "#2a4a38";
  g.beginPath();
  g.arc(78, 144, 9, 0, Math.PI * 2);
  g.arc(178, 144, 9, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#140e0c";
  g.beginPath();
  g.arc(78, 144, 4.5, 0, Math.PI * 2);
  g.arc(178, 144, 4.5, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "rgba(255,255,255,0.85)";
  g.fillRect(84, 138, 4, 4);
  g.fillRect(184, 138, 4, 4);
  g.fillStyle = "rgba(90,40,30,0.35)";
  g.beginPath();
  g.ellipse(128, 190, 14, 22, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#8a4038";
  g.beginPath();
  g.ellipse(128, 236, 28, 10, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "rgba(90,30,24,0.7)";
  g.lineWidth = 3;
  g.beginPath();
  g.ellipse(128, 232, 22, 6, 0, 0.15, Math.PI - 0.15);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  faceCache.set(k, tex);
  return tex;
}

function makeHumanHead(
  k: number,
  skin: THREE.Material,
  dark: THREE.Material,
  steel: THREE.Material,
  trim: THREE.Material,
) {
  const head = new THREE.Group();
  head.position.y = 1.3;
  const neck = cap(0.055, 0.05, dark);
  neck.position.y = -0.16;
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.018, 6, 12), steel);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = -0.12;

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.145, 14, 12), skin);
  skull.scale.set(1.02, 1.08, 0.96);
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), skin);
  jaw.scale.set(1.05, 0.72, 0.82);
  jaw.position.set(0, -0.07, 0.03);
  const painted = faceMap(k);
  const faceMat = std(0xffffff, {
    map: painted ?? undefined,
    roughness: 0.62,
    metalness: 0.02,
  });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.25), faceMat);
  face.position.set(0, -0.01, 0.12);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), dark);
  hair.scale.set(1.04, 0.55, 1.02);
  hair.position.set(0, 0.07, -0.02);
  head.add(neck, collar, skull, jaw, face, hair);
  if (k === 1) {
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), dark);
    bun.position.set(0, 0.12, -0.1);
    head.add(bun);
  } else if (k === 3) {
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.48), dark);
    hood.position.y = 0.02;
    head.add(hood);
  } else if (k === 0) {
    const crest = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.1, 2, 5), trim);
    crest.position.set(0, 0.16, -0.02);
    head.add(crest);
  }

  const glass = std(0xb7fff4, {
    emissive: 0x7ff5e4,
    emissiveIntensity: 0.45,
    transparent: true,
    opacity: 0.22,
    roughness: 0.08,
    metalness: 0.15,
    depthWrite: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), glass);
  dome.scale.set(1.05, 1.08, 1.02);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 6, 16), trim);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.08;
  const cracks: THREE.Mesh[] = [];
  const crackMat = std(0xe8fff8, { emissive: 0xffffff, emissiveIntensity: 0.8, roughness: 0.2 });
  for (let i = 0; i < 4; i++) {
    const crack = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.16, 0.008), crackMat);
    const a = i * 1.4 + 0.4;
    crack.position.set(Math.sin(a) * 0.16, 0.04 + (i % 2) * 0.04, Math.cos(a) * 0.16);
    crack.rotation.set(0.4, a, 0.5);
    crack.visible = false;
    cracks.push(crack);
  }
  head.add(dome, ring, ...cracks);
  head.userData.dome = dome;
  head.userData.cracks = cracks;
  head.userData.seal = 1;
  return head;
}

function headOf(mesh: THREE.Group) {
  const parts = mesh.userData.parts as { head?: THREE.Group } | undefined;
  return parts?.head;
}

export function crackFighter(mesh: THREE.Group, ratio: number) {
  const head = headOf(mesh);
  if (!head) return;
  const seal = Math.max(0, Math.min(1, (head.userData.seal as number) ?? 1, ratio));
  head.userData.seal = seal;
  const dome = head.userData.dome as THREE.Mesh | undefined;
  const mat = dome?.material as THREE.MeshStandardMaterial | undefined;
  if (mat) {
    mat.opacity = 0.12 + seal * 0.32;
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

function makeAxe(steel: THREE.Material, glow: THREE.Material) {
  const axe = new THREE.Group();
  const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.78, 8), steel);
  haft.rotation.z = Math.PI / 2;
  haft.position.x = 0.14;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.32, 0.05), steel);
  head.position.set(0.5, 0.05, 0);
  const bit = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.38, 0.02), glow);
  bit.position.set(0.56, 0.03, 0);
  const spike = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.16, 6), steel);
  spike.rotation.z = -Math.PI / 2;
  spike.position.set(0.42, 0.2, 0);
  axe.add(haft, head, bit, spike);
  return axe;
}

export function makeBotMesh(color: number, kit = 0): THREE.Group {
  const { metal, poly, visor: visorTex } = maps();
  const root = new THREE.Group();
  const k = kit % 4;
  const steel = std(k === 3 ? 0x6a7078 : 0xc2c8d0, { map: metal, metalness: 0.72, roughness: 0.28 });
  const dark = std(k === 3 ? 0x14181e : 0x1c222a, { map: metal, metalness: 0.55, roughness: 0.4 });
  const fabric = std(k === 1 ? 0x3a4448 : 0x6e7468, { map: poly, metalness: 0.08, roughness: 0.82 });
  const accent = std(color, { emissive: color, emissiveIntensity: 0.7, roughness: 0.32 });
  // Identidad visible a distancia: pocos prismas, cero geometría dinámica.
  const idGlow = std(color, { emissive: color, emissiveIntensity: 1.35, metalness: 0.28, roughness: 0.24 });
  const visor = std(0xffffff, {
    map: visorTex,
    emissive: k === 0 ? 0xff6a45 : k === 3 ? 0xd4b45a : 0x7af0ff,
    emissiveMap: visorTex,
    emissiveIntensity: 1.25,
    metalness: 0.15,
    roughness: 0.16,
  });
  const orange = std(0xff6a45, { emissive: 0xff6a45, emissiveIntensity: 0.9 });
  const gold = std(0xd4b45a, { emissive: 0xd4b45a, emissiveIntensity: 0.75, metalness: 0.6, roughness: 0.3 });
  const skin = std(0xc4a882, { metalness: 0.05, roughness: 0.68 });
  const trim = k === 0 ? orange : k === 3 ? gold : accent;

  const hips = new THREE.Group();
  hips.position.y = 0.74;
  const wide = k === 0 ? 1.14 : k === 1 ? 0.9 : k === 3 ? 0.94 : 1.02;

  const pelvis = new THREE.Mesh(new THREE.CapsuleGeometry(0.13 * wide, 0.06, 3, 8), k === 2 ? fabric : dark);
  pelvis.scale.set(1.45, 0.72, 1.05);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.15 * wide, 0.022, 6, 14), trim);
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 0.05;
  hips.add(pelvis, belt);

  const mkLeg = (side: number) => {
    const g = new THREE.Group();
    g.position.set(side * 0.125 * wide, -0.02, 0);
    const hip = new THREE.Mesh(new THREE.SphereGeometry(0.09 * wide, 10, 8), steel);
    const thigh = cap(0.078 * wide, 0.2, k === 0 ? steel : k === 2 ? fabric : dark, 8);
    thigh.position.y = -0.15;
    const shin = new THREE.Group();
    shin.position.y = -0.3;
    const shinM = cap(0.062 * wide, 0.2, k === 0 ? steel : dark, 8);
    shinM.position.y = -0.13;
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.072 * wide, 10, 8), trim);
    const boot = new THREE.Mesh(new THREE.CapsuleGeometry(0.055 * wide, 0.1, 3, 6), dark);
    boot.rotation.x = Math.PI / 2;
    boot.scale.set(1.15, 0.85, 1);
    boot.position.set(0, -0.28, 0.05);
    const toe = new THREE.Mesh(new THREE.SphereGeometry(0.045 * wide, 8, 6), steel);
    toe.scale.set(1.1, 0.7, 1.35);
    toe.position.set(0, -0.3, 0.14);
    shin.add(shinM, knee, boot, toe);
    if (k === 2) {
      const pouch = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.06, 2, 6), fabric);
      pouch.position.set(side * 0.07, -0.06, 0.08);
      shin.add(pouch);
    }
    if (k === 3) {
      const stripe = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.16, 2, 5), gold);
      stripe.position.set(side * 0.055, -0.1, 0.07);
      shin.add(stripe);
    }
    g.add(hip, thigh, shin);
    g.userData.shin = shin;
    return g;
  };
  const legL = mkLeg(-1);
  const legR = mkLeg(1);
  hips.add(legL, legR);

  const torso = new THREE.Group();
  torso.position.y = 0.88;
  const chestW = k === 0 ? 1.35 : k === 1 ? 0.92 : k === 3 ? 1.02 : 1.12;
  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.26, 4, 8), k === 0 ? steel : k === 1 ? fabric : dark);
  chest.scale.set(chestW, 1, k === 0 ? 0.95 : 0.82);
  chest.position.y = 0.16;
  const abs = cap(0.12 * wide, 0.08, dark, 8);
  abs.scale.set(1.15, 1, 0.9);
  abs.position.y = -0.1;
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.11 * chestW, 0.028, 6, 12), trim);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.38;
  torso.add(chest, abs, collar);

  if (k === 0) {
    const vplate = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.16, 3, 6), orange);
    vplate.scale.set(1.1, 1, 0.35);
    vplate.position.set(0, 0.2, 0.16);
    const cableL = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.3, 6), orange);
    cableL.position.set(-0.1, 0.12, 0.16);
    const cableR = cableL.clone();
    cableR.position.x = 0.1;
    torso.add(vplate, cableL, cableR);
  } else if (k === 1) {
    const plate = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.08, 3, 6), visor);
    plate.scale.set(1.2, 1.1, 0.28);
    plate.position.set(0, 0.2, 0.15);
    const harnessL = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.28, 2, 5), accent);
    harnessL.position.set(-0.11, 0.12, 0.14);
    const harnessR = harnessL.clone();
    harnessR.position.x = 0.11;
    torso.add(plate, harnessL, harnessR);
  } else if (k === 2) {
    const screen = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.04, 2, 6), visor);
    screen.scale.set(1.4, 1, 0.3);
    screen.position.set(-0.08, 0.22, 0.15);
    const flask = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8), orange);
    flask.position.set(0.14, 0.08, 0.14);
    torso.add(screen, flask);
  } else {
    const slit = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.08, 2, 6), gold);
    slit.rotation.z = Math.PI / 2;
    slit.scale.set(0.35, 1, 0.4);
    slit.position.set(0, 0.22, 0.15);
    const cloak = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.22, 3, 6), dark);
    cloak.scale.set(1.15, 1, 0.22);
    cloak.position.set(0, 0.06, -0.16);
    cloak.rotation.x = 0.18;
    torso.add(slit, cloak);
  }

  const pack = new THREE.Mesh(
    new THREE.BoxGeometry(k === 2 ? 0.4 : 0.26, k === 2 ? 0.38 : 0.28, k === 2 ? 0.2 : 0.14),
    k === 2 ? fabric : dark,
  );
  pack.position.set(0, 0.14, k === 2 ? -0.24 : -0.2);
  torso.add(pack);
  const spine = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const cell = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.07, 0.025), idGlow);
    cell.position.set(0, 0.28 - i * 0.11, -0.31);
    spine.add(cell);
  }
  const beaconL = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.03, 0.04), idGlow);
  beaconL.position.set(-0.18, 0.29, -0.11);
  const beaconR = beaconL.clone();
  beaconR.position.x = 0.18;
  torso.add(spine, beaconL, beaconR);
  if (k === 2) {
    const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.15, 0.1), fabric);
    p1.position.set(-0.16, 0.06, -0.34);
    const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.13, 0.1), dark);
    p2.position.set(0.16, 0.0, -0.34);
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.28, 8), fabric);
    roll.rotation.z = Math.PI / 2;
    roll.position.set(0, 0.34, -0.24);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.22, 5), steel);
    antenna.position.set(0.12, 0.4, -0.2);
    torso.add(p1, p2, roll, antenna);
  }
  if (k === 0) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.28, 8), steel);
    tank.position.set(-0.1, 0.16, -0.24);
    const tank2 = tank.clone();
    tank2.position.x = 0.1;
    torso.add(tank, tank2);
  }

  const pauldron = (side: number) => {
    const s = k === 0 ? 0.16 : k === 1 ? 0.1 : 0.12;
    const p = new THREE.Mesh(new THREE.SphereGeometry(s, 10, 8), k === 0 ? steel : trim);
    p.scale.set(1.15, 0.55, 1.05);
    p.position.set(side * (k === 0 ? 0.28 : 0.22), 0.32, 0.02);
    return p;
  };
  torso.add(pauldron(-1), pauldron(1));

  const mkArm = (side: number) => {
    const g = new THREE.Group();
    g.position.set(side * (k === 0 ? 0.32 : 0.26), 0.28, 0);
    const deltoid = new THREE.Mesh(new THREE.SphereGeometry(0.07 * wide, 10, 8), steel);
    const upper = cap(0.055 * wide, 0.16, k === 0 ? steel : dark, 8);
    upper.position.y = -0.12;
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.055 * wide, 8, 6), trim);
    elbow.position.y = -0.22;
    const forearm = new THREE.Group();
    forearm.position.y = -0.24;
    const forearmM = cap(0.048 * wide, 0.14, dark, 8);
    forearmM.position.y = -0.1;
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.05 * wide, 0.012, 5, 10), trim);
    cuff.position.y = -0.18;
    const fist = new THREE.Mesh(new THREE.SphereGeometry(0.048, 8, 6), steel);
    fist.scale.set(1.05, 0.8, 1.15);
    fist.position.y = -0.22;
    forearm.add(forearmM, cuff, fist);
    g.add(deltoid, upper, elbow, forearm);
    g.userData.forearm = forearm;
    return g;
  };
  const armL = mkArm(-1);
  const armR = mkArm(1);

  if (k === 0) {
    const axe = makeAxe(steel, visor);
    axe.position.set(-0.06, -0.24, 0.04);
    axe.rotation.set(0.2, 0.4, 1.15);
    armL.userData.forearm.add(axe);
  }

  const gun = buildWorldGun(steel, dark, visor, k === 2 ? "scatter" : k === 3 ? "lance" : k === 0 ? "torpedo" : "pulse");
  gun.position.set(0.02, -0.24, 0.16);
  gun.rotation.x = 0.15;
  armR.userData.forearm.add(gun);
  torso.add(armL, armR);

  const head = makeHumanHead(k, skin, dark, steel, trim);

  root.add(hips, torso, head);
  root.userData.flashMat = k === 0 ? orange : k === 3 ? gold : visor;
  root.userData.idGlow = idGlow;
  root.userData.cycle = 0;
  root.userData.kit = k;
  root.userData.parts = { hips, torso, head, armL, armR, legL, legR, gun };
  root.userData.base = {
    hipsY: hips.position.y,
    torsoY: torso.position.y,
    headY: head.position.y,
  };
  root.scale.setScalar(kitScale(k));
  shadow(root);
  return root;
}

export function resetFighterMesh(mesh: THREE.Group) {
  mesh.rotation.set(0, mesh.rotation.y, 0);
  const kit = (mesh.userData.kit as number) ?? 0;
  mesh.scale.setScalar(kitScale(kit));
  mesh.visible = true;
  mesh.userData.cycle = 0;
  mesh.userData.deadT = 0;
  const p = mesh.userData.parts as
    | {
        hips: THREE.Group;
        torso: THREE.Group;
        head: THREE.Group;
        armL: THREE.Group;
        armR: THREE.Group;
        legL: THREE.Group;
        legR: THREE.Group;
      }
    | undefined;
  if (!p) return;
  p.hips.rotation.set(0, 0, 0);
  p.torso.rotation.set(0, 0, 0);
  p.head.rotation.set(0, 0, 0);
  p.armL.rotation.set(0, 0, 0);
  p.armR.rotation.set(0, 0, 0);
  p.legL.rotation.set(0, 0, 0);
  p.legR.rotation.set(0, 0, 0);
  p.head.visible = true;
  const dome = p.head.userData.dome as THREE.Mesh | undefined;
  if (dome) {
    dome.visible = true;
    const mat = dome.material as THREE.MeshStandardMaterial;
    mat.opacity = 0.22;
    mat.emissiveIntensity = 0.45;
  }
  p.head.userData.seal = 1;
  for (const crack of (p.head.userData.cracks as THREE.Mesh[] | undefined) ?? []) crack.visible = false;
  p.armL.visible = true;
  p.armR.visible = true;
  p.legL.visible = true;
  p.legR.visible = true;
  mesh.userData.breakPart = null;
}

export function animateFighter(mesh: THREE.Group, pose: FighterPose) {
  const p = mesh.userData.parts as
    | {
        hips: THREE.Group;
        torso: THREE.Group;
        head: THREE.Group;
        armL: THREE.Group;
        armR: THREE.Group;
        legL: THREE.Group;
        legR: THREE.Group;
      }
    | undefined;
  if (!p) return;
  const dt = pose.dt;
  const kit = (mesh.userData.kit as number) ?? 0;
  const baseScale = kitScale(kit);
  if (pose.dead) {
    mesh.userData.deadT = (mesh.userData.deadT as number) + dt;
    const t = Math.min(1, mesh.userData.deadT as number);
    mesh.rotation.x = t * 1.15;
    p.armL.rotation.x = -0.8 * t;
    p.armR.rotation.x = 0.5 * t;
    p.legL.rotation.x = 0.4 * t;
    p.legR.rotation.x = -0.2 * t;
    p.head.rotation.x = 0.4 * t;
    mesh.scale.set(baseScale, baseScale * Math.max(0.78, 1 - t * 0.12), baseScale);
    const broken = mesh.userData.breakPart as string | null;
    if (broken === "head") p.head.visible = false;
    else if (broken === "armL") p.armL.visible = false;
    else if (broken === "armR") p.armR.visible = false;
    else if (broken === "legL") p.legL.visible = false;
    else if (broken === "legR") p.legR.visible = false;
    return;
  }

  const spd = pose.speed;
  mesh.userData.cycle = (mesh.userData.cycle as number) + dt * Math.min(11, 3.2 + spd * 1.35);
  const c = mesh.userData.cycle as number;
  const amp = pose.grounded ? Math.min(0.72, spd * 0.085) : 0;
  const swing = Math.sin(c) * amp;

  if (pose.grounded) {
    p.legL.rotation.x = swing;
    p.legR.rotation.x = -swing;
    p.armL.rotation.x = -swing * 0.85;
    p.armR.rotation.x = swing * 0.7;
    p.hips.rotation.z = Math.sin(c) * amp * 0.12;
    p.torso.rotation.y = Math.sin(c) * amp * 0.18;
  } else {
    const tuck = pose.velY > 0 ? 0.35 : 0.18;
    p.legL.rotation.x = -tuck;
    p.legR.rotation.x = -tuck * 0.7;
    p.armL.rotation.x = -0.55;
    p.armR.rotation.x = 0.15;
    p.hips.rotation.z = 0;
    p.torso.rotation.y = 0;
  }

  if (pose.firing) {
    p.armR.rotation.x = -0.85;
    p.torso.rotation.y += 0.12;
  }

  p.head.rotation.x = THREE.MathUtils.clamp(pose.pitch * 0.55, -0.7, 0.7);
  const breath = pose.grounded && spd < 0.4 ? Math.sin(c * 0.35) * 0.012 : 0;
  const squash = pose.land > 0 ? -0.08 * Math.min(1, pose.land / 0.12) : 0;
  const stretch = !pose.grounded && pose.velY > 2 ? 0.06 : 0;
  mesh.scale.set(
    baseScale * (1 - stretch + Math.abs(squash) * 0.5),
    baseScale * (1 + stretch + squash),
    baseScale,
  );
  p.torso.position.y = 0.88 + breath;

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

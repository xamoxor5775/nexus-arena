import * as THREE from "three";
import { gunMetalTex, loadTex, polymerTex } from "./textures";
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
    metalMap = gunMetalTex(2.4, 2.4);
    polyMap = polymerTex(3.2, 3.2);
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
  return k === 0 ? 1.08 : k === 1 ? 0.92 : k === 3 ? 0.96 : 1;
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
  const { metal, poly, visor: visorTex, skull } = maps();
  const root = new THREE.Group();
  const k = kit % 4;
  const steel = std(k === 3 ? 0x6a7078 : 0xc2c8d0, { map: metal, metalness: 0.72, roughness: 0.28 });
  const dark = std(k === 3 ? 0x14181e : 0x1c222a, { map: metal, metalness: 0.55, roughness: 0.4 });
  const fabric = std(k === 1 ? 0x3a4448 : 0x6e7468, { map: poly, metalness: 0.08, roughness: 0.82 });
  const accent = std(color, { emissive: color, emissiveIntensity: 0.7, roughness: 0.32 });
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

  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.42 * wide, 0.16, 0.26), k === 2 ? fabric : dark);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.16 * wide, 0.025, 6, 14), trim);
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 0.04;
  hips.add(pelvis, belt);

  const mkLeg = (side: number) => {
    const g = new THREE.Group();
    g.position.set(side * 0.12 * wide, -0.04, 0);
    const thigh = cap(0.075 * wide, 0.26, k === 0 ? steel : k === 2 ? fabric : dark);
    thigh.position.y = -0.18;
    const hip = new THREE.Mesh(new THREE.SphereGeometry(0.085 * wide, 8, 6), steel);
    hip.position.y = -0.02;
    const shin = new THREE.Group();
    shin.position.y = -0.38;
    const shinM = cap(0.068 * wide, 0.24, k === 0 ? steel : dark);
    shinM.position.y = -0.14;
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.15 * wide, 0.09, 0.24), dark);
    boot.position.set(0, -0.34, 0.05);
    const toe = new THREE.Mesh(new THREE.BoxGeometry(0.13 * wide, 0.05, 0.1), steel);
    toe.position.set(0, -0.35, 0.14);
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.08 * wide, 8, 6), trim);
    knee.position.y = 0.0;
    shin.add(shinM, boot, toe, knee);
    if (k === 2) {
      const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.07), fabric);
      pouch.position.set(side * 0.07, -0.08, 0.1);
      shin.add(pouch);
    }
    if (k === 3) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.04), gold);
      stripe.position.set(side * 0.06, -0.12, 0.08);
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
  const chestW = k === 0 ? 0.58 : k === 1 ? 0.42 : k === 3 ? 0.46 : 0.5;
  const chest = new THREE.Mesh(new THREE.BoxGeometry(chestW, 0.46, 0.3), k === 0 ? steel : k === 1 ? fabric : dark);
  chest.position.y = 0.16;
  const abs = cap(0.14 * wide, 0.1, dark);
  abs.position.y = -0.12;
  const collar = new THREE.Mesh(new THREE.TorusGeometry(chestW * 0.28, 0.03, 6, 12), trim);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.4;
  torso.add(chest, abs, collar);

  if (k === 0) {
    const vplate = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.28, 0.05), orange);
    vplate.position.set(0, 0.2, 0.17);
    const cableL = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.34, 6), orange);
    cableL.position.set(-0.11, 0.1, 0.18);
    const cableR = cableL.clone();
    cableR.position.x = 0.11;
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.08), steel);
    rib.position.set(0, 0.02, 0.16);
    torso.add(vplate, cableL, cableR, rib);
  } else if (k === 1) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.05), visor);
    plate.position.set(0, 0.2, 0.17);
    const harnessL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.38, 0.04), accent);
    harnessL.position.set(-0.12, 0.12, 0.16);
    const harnessR = harnessL.clone();
    harnessR.position.x = 0.12;
    torso.add(plate, harnessL, harnessR);
  } else if (k === 2) {
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.11, 0.04), visor);
    screen.position.set(-0.1, 0.22, 0.17);
    const flask = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.14, 8), orange);
    flask.position.set(0.16, 0.08, 0.16);
    const tools = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.06), steel);
    tools.position.set(0.08, -0.02, 0.17);
    torso.add(screen, flask, tools);
  } else {
    const slit = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.04), gold);
    slit.position.set(0, 0.22, 0.17);
    const cloak = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.42, 0.04), dark);
    cloak.position.set(0, 0.08, -0.18);
    cloak.rotation.x = 0.15;
    torso.add(slit, cloak);
  }

  const pack = new THREE.Mesh(
    new THREE.BoxGeometry(k === 2 ? 0.4 : 0.26, k === 2 ? 0.38 : 0.28, k === 2 ? 0.2 : 0.14),
    k === 2 ? fabric : dark,
  );
  pack.position.set(0, 0.14, k === 2 ? -0.24 : -0.2);
  torso.add(pack);
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
    const s = k === 0 ? 1.32 : k === 1 ? 0.88 : 1;
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.13 * s, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), k === 0 ? steel : trim);
    p.rotation.z = side > 0 ? -0.55 : 0.55;
    p.position.set(side * (k === 0 ? 0.34 : 0.28), 0.34, 0.02);
    return p;
  };
  torso.add(pauldron(-1), pauldron(1));

  const mkArm = (side: number) => {
    const g = new THREE.Group();
    g.position.set(side * (k === 0 ? 0.38 : 0.3), 0.3, 0);
    const upper = cap(0.065 * wide, 0.2, k === 0 ? steel : dark);
    upper.position.y = -0.12;
    const deltoid = new THREE.Mesh(new THREE.SphereGeometry(0.08 * wide, 8, 6), steel);
    const forearm = new THREE.Group();
    forearm.position.y = -0.28;
    const forearmM = cap(0.06 * wide, 0.18, dark);
    forearmM.position.y = -0.1;
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.062 * wide, 0.016, 5, 10), trim);
    cuff.position.y = -0.2;
    const fist = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), steel);
    fist.scale.set(1.15, 0.85, 1.25);
    fist.position.y = -0.26;
    forearm.add(forearmM, cuff, fist);
    g.add(deltoid, upper, forearm);
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

  const head = new THREE.Group();
  head.position.y = 1.3;
  const neck = cap(0.06, 0.06, dark);
  neck.position.y = -0.16;
  head.add(neck);

  if (k === 0) {
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), std(0xffffff, { map: skull, metalness: 0.62, roughness: 0.36 }));
    helm.scale.set(1.05, 1.05, 1.12);
    const vis = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.07, 0.05), orange);
    vis.position.set(0, 0.03, 0.17);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.18), dark);
    jaw.position.set(0, -0.14, 0.05);
    const crest = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.22), steel);
    crest.position.set(0, 0.16, 0);
    head.add(helm, vis, jaw, crest);
  } else if (k === 1) {
    const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), skin);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.155, 10, 8), dark);
    hair.scale.set(1.02, 0.7, 1.05);
    hair.position.set(0, 0.07, -0.02);
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), dark);
    bun.position.set(0, 0.12, -0.14);
    const vis = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.14), visor);
    vis.position.set(0, 0.02, 0.1);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.16), dark);
    brow.position.set(0, 0.08, 0.08);
    head.add(cranium, hair, bun, vis, brow);
  } else if (k === 2) {
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), dark);
    helm.scale.set(1.05, 0.95, 1.05);
    const face = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.07), skin);
    face.position.set(0, -0.02, 0.12);
    const vis = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.045, 0.05), visor);
    vis.position.set(0, 0.04, 0.16);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), orange);
    lamp.position.set(0, 0.14, 0.12);
    head.add(helm, face, vis, lamp);
  } else {
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.165, 10, 8), dark);
    helm.scale.set(1.08, 1.0, 1.12);
    const vis = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.035, 0.05), gold);
    vis.position.set(0, 0.04, 0.16);
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), dark);
    hood.rotation.x = Math.PI;
    hood.position.y = 0.04;
    const mask = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.06), steel);
    mask.position.set(0, -0.06, 0.14);
    head.add(helm, vis, hood, mask);
  }

  root.add(hips, torso, head);
  root.userData.flashMat = k === 0 ? orange : k === 3 ? gold : visor;
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
    mesh.scale.set(baseScale, baseScale * Math.max(0.35, 1 - t * 0.15), baseScale);
    if (t > 0.98) mesh.visible = false;
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
}

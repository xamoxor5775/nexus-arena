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
    metalMap = loadTex("/textures/gunmetal.jpg", 2.4, 2.4);
    polyMap = loadTex("/textures/polymer.jpg", 3.2, 3.2);
    visorMap = loadTex("/textures/visor.jpg", 1, 1);
    skullMap = loadTex("/textures/skull.jpg", 1, 1);
  }
  return { metal: metalMap, poly: polyMap!, visor: visorMap!, skull: skullMap! };
}

function mat(color: number, extra: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0.48,
    roughness: 0.4,
    ...extra,
  });
}

function makeAxe(steel: THREE.Material, glow: THREE.Material) {
  const axe = new THREE.Group();
  const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.72, 6), steel);
  haft.rotation.z = Math.PI / 2;
  haft.position.x = 0.12;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.28, 0.06), steel);
  head.position.set(0.46, 0.04, 0);
  const bit = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.34, 0.03), glow);
  bit.position.set(0.52, 0.02, 0);
  const spike = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.04), steel);
  spike.position.set(0.38, 0.16, 0);
  axe.add(haft, head, bit, spike);
  return axe;
}

export function makeBotMesh(color: number, kit = 0): THREE.Group {
  const { metal, poly, visor: visorTex, skull } = maps();
  const root = new THREE.Group();
  const k = kit % 3;
  const steel = mat(0xb8c0c8, { map: metal, metalness: 0.62, roughness: 0.38 });
  const dark = mat(0x2a3038, { map: metal, metalness: 0.5, roughness: 0.45 });
  const fabric = mat(0x8a9080, { map: poly, metalness: 0.12, roughness: 0.78 });
  const accent = mat(color, { emissive: color, emissiveIntensity: 0.55 });
  const visor = mat(0xffffff, {
    map: visorTex,
    emissive: 0x7af0ff,
    emissiveMap: visorTex,
    emissiveIntensity: 1.15,
    metalness: 0.2,
    roughness: 0.18,
  });
  const orange = mat(0xff6a45, { emissive: 0xff6a45, emissiveIntensity: 0.85 });
  const skin = mat(0xc4a882, { metalness: 0.08, roughness: 0.62 });

  const hips = new THREE.Group();
  hips.position.y = 0.72;

  const wide = k === 0 ? 1.12 : k === 2 ? 1.04 : 0.92;
  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.46 * wide, 0.22, 0.3), k === 2 ? fabric : dark);
  hips.add(pelvis);

  const mkLeg = (side: number) => {
    const g = new THREE.Group();
    g.position.set(side * 0.14 * wide, -0.08, 0);
    const thigh = new THREE.Mesh(
      new THREE.BoxGeometry(0.16 * wide, 0.38, 0.18),
      k === 0 ? steel : k === 2 ? fabric : dark,
    );
    thigh.position.y = -0.2;
    const shin = new THREE.Group();
    shin.position.y = -0.4;
    const shinM = new THREE.Mesh(new THREE.BoxGeometry(0.15 * wide, 0.36, 0.17), k === 0 ? steel : dark);
    shinM.position.y = -0.16;
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.17 * wide, 0.1, 0.26), dark);
    boot.position.set(0, -0.36, 0.04);
    const knee = new THREE.Mesh(new THREE.BoxGeometry(0.18 * wide, 0.1, 0.2), accent);
    knee.position.y = -0.02;
    shin.add(shinM, boot, knee);
    if (k === 2) {
      const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.08), fabric);
      pouch.position.set(side * 0.08, -0.1, 0.12);
      shin.add(pouch);
    }
    g.add(thigh, shin);
    g.userData.shin = shin;
    return g;
  };
  const legL = mkLeg(-1);
  const legR = mkLeg(1);
  hips.add(legL, legR);

  const torso = new THREE.Group();
  torso.position.y = 0.86;
  const chestW = k === 0 ? 0.62 : k === 1 ? 0.44 : 0.52;
  const chest = new THREE.Mesh(new THREE.BoxGeometry(chestW, 0.5, 0.34), k === 0 ? steel : k === 1 ? dark : fabric);
  chest.position.y = 0.18;
  const abs = new THREE.Mesh(new THREE.BoxGeometry(chestW * 0.78, 0.18, 0.26), dark);
  abs.position.y = -0.12;
  torso.add(chest, abs);

  if (k === 0) {
    const vplate = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.06), orange);
    vplate.position.set(0, 0.22, 0.2);
    const cableL = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.36, 6), orange);
    cableL.position.set(-0.12, 0.12, 0.2);
    const cableR = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.36, 6), orange);
    cableR.position.set(0.12, 0.12, 0.2);
    torso.add(vplate, cableL, cableR);
  } else if (k === 1) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.06), visor);
    plate.position.set(0, 0.2, 0.2);
    torso.add(plate);
  } else {
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.04), visor);
    screen.position.set(-0.1, 0.22, 0.2);
    const flask = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, 0.07), orange);
    flask.position.set(0.16, 0.08, 0.18);
    torso.add(screen, flask);
  }

  const packW = k === 2 ? 0.42 : 0.28;
  const pack = new THREE.Mesh(new THREE.BoxGeometry(packW, k === 2 ? 0.42 : 0.32, k === 2 ? 0.22 : 0.16), k === 2 ? fabric : dark);
  pack.position.set(0, 0.16, k === 2 ? -0.26 : -0.22);
  torso.add(pack);
  if (k === 2) {
    const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.1), fabric);
    p1.position.set(-0.16, 0.08, -0.36);
    const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.1), dark);
    p2.position.set(0.16, 0.02, -0.36);
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.28, 8), fabric);
    roll.rotation.z = Math.PI / 2;
    roll.position.set(0, 0.36, -0.26);
    torso.add(p1, p2, roll);
  }

  const pauldron = (side: number) => {
    const s = k === 0 ? 1.35 : 1;
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.22 * s, 0.16 * s, 0.3 * s), k === 0 ? steel : accent);
    p.position.set(side * (k === 0 ? 0.4 : 0.32), 0.36, 0);
    return p;
  };
  torso.add(pauldron(-1), pauldron(1));

  const mkArm = (side: number) => {
    const g = new THREE.Group();
    g.position.set(side * (k === 0 ? 0.42 : 0.34), 0.32, 0);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.14 * wide, 0.32, 0.15), k === 0 ? steel : dark);
    upper.position.y = -0.14;
    const forearm = new THREE.Group();
    forearm.position.y = -0.3;
    const forearmM = new THREE.Mesh(new THREE.BoxGeometry(0.13 * wide, 0.28, 0.14), dark);
    forearmM.position.y = -0.12;
    const fist = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), steel);
    fist.position.y = -0.28;
    forearm.add(forearmM, fist);
    g.add(upper, forearm);
    g.userData.forearm = forearm;
    return g;
  };
  const armL = mkArm(-1);
  const armR = mkArm(1);

  if (k === 0) {
    const axe = makeAxe(steel, visor);
    axe.position.set(-0.08, -0.28, 0.06);
    axe.rotation.set(0.2, 0.4, 1.15);
    armL.userData.forearm.add(axe);
  }

  const gun = buildWorldGun(steel, dark, visor);
  gun.position.set(0.02, -0.28, 0.18);
  armR.userData.forearm.add(gun);
  torso.add(armL, armR);

  const head = new THREE.Group();
  head.position.y = 1.28;

  if (k === 0) {
    const helm = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.32, 0.36),
      mat(0xffffff, { map: skull, metalness: 0.58, roughness: 0.4 }),
    );
    const vis = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.06), orange);
    vis.position.set(0, 0.04, 0.18);
    const socketL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.04), dark);
    socketL.position.set(-0.08, 0.06, 0.2);
    const socketR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.04), dark);
    socketR.position.set(0.08, 0.06, 0.2);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.22), dark);
    jaw.position.set(0, -0.18, 0.06);
    const teeth = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.04), visor);
    teeth.position.set(0, -0.14, 0.16);
    head.add(helm, vis, socketL, socketR, jaw, teeth);
  } else if (k === 1) {
    const cranium = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.26, 0.28), skin);
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.1, 0.28), dark);
    hair.position.set(0, 0.14, -0.02);
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), dark);
    bun.position.set(0, 0.16, -0.14);
    const vis = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.16), visor);
    vis.position.set(0, 0.02, 0.12);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, 0.18), dark);
    brow.position.set(0, 0.08, 0.1);
    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.22), fabric);
    collar.position.set(0, -0.18, 0.02);
    head.add(cranium, hair, bun, vis, brow, collar);
  } else {
    const helm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, 0.3), dark);
    const face = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.08), skin);
    face.position.set(0, -0.02, 0.14);
    const vis = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.06), visor);
    vis.position.set(0, 0.04, 0.18);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.16), dark);
    jaw.position.set(0, -0.16, 0.04);
    head.add(helm, face, vis, jaw);
  }

  root.add(hips, torso, head);
  root.userData.flashMat = k === 1 ? visor : k === 0 ? orange : visor;
  root.userData.cycle = 0;
  root.userData.kit = k;
  root.userData.parts = { hips, torso, head, armL, armR, legL, legR, gun };
  root.userData.base = {
    hipsY: hips.position.y,
    torsoY: torso.position.y,
    headY: head.position.y,
  };
  if (k === 0) root.scale.setScalar(1.06);
  if (k === 1) root.scale.setScalar(0.94);
  return root;
}

export function resetFighterMesh(mesh: THREE.Group) {
  mesh.rotation.set(0, mesh.rotation.y, 0);
  const kit = (mesh.userData.kit as number) ?? 0;
  mesh.scale.setScalar(kit === 0 ? 1.06 : kit === 1 ? 0.94 : 1);
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
  const baseScale = kit === 0 ? 1.06 : kit === 1 ? 0.94 : 1;
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
  p.torso.position.y = 0.86 + breath;

  const flash = mesh.userData.flashMat as THREE.MeshStandardMaterial | undefined;
  if (flash) {
    const target = pose.protect ? 1.15 : 0.55;
    flash.emissiveIntensity += (target - flash.emissiveIntensity) * Math.min(1, dt * 8);
  }
}

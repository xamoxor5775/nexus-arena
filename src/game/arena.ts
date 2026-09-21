import * as THREE from "three";
import { boxAt } from "./collision";
import type { AABB, ItemPad, JumpPad, Spawn } from "./types";
import { isPower, POWER_META } from "./constants";
import { loadArenaMaps, loadSkyTex, padTexture } from "./textures";
import { createArenaLights, type ArenaLights } from "./lighting";
import { BoxBatch, bakeMeshes, instanceCylinders, instancePlanes } from "./instancing";

export type ArenaData = {
  group: THREE.Group;
  solids: AABB[];
  pads: JumpPad[];
  items: ItemPad[];
  spawns: Spawn[];
  waypoints: { x: number; y: number; z: number }[];
  lights: ArenaLights;
  dispose: () => void;
};

function addBox(
  batch: BoxBatch,
  solids: AABB[],
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  collide = true,
) {
  batch.add(mat, x, y, z, w, h, d);
  if (collide) solids.push(boxAt(x, y, z, w, h, d));
}

export function buildArena(scene: THREE.Scene): ArenaData {
  const group = new THREE.Group();
  const solids: AABB[] = [];
  const mats: THREE.Material[] = [];
  const texs: THREE.Texture[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const batch = new BoxBatch();

  const maps = loadArenaMaps();
  const padTex = padTexture();
  texs.push(
    maps.floor,
    maps.plate,
    maps.beam,
    maps.pipes,
    maps.hazard,
    maps.console,
    maps.rune,
    maps.ruin,
    maps.armor,
    maps.skull,
    padTex,
  );

  const floorMat = new THREE.MeshStandardMaterial({
    map: maps.floor,
    roughness: 0.7,
    metalness: 0.48,
    color: 0xffffff,
    emissive: 0x2ee0c8,
    emissiveMap: maps.floor,
    emissiveIntensity: 0.22,
  });
  const plateMat = new THREE.MeshStandardMaterial({
    map: maps.plate,
    roughness: 0.58,
    metalness: 0.48,
    color: 0xffffff,
  });
  const beamMat = new THREE.MeshStandardMaterial({
    map: maps.beam,
    roughness: 0.7,
    metalness: 0.32,
    color: 0xffffff,
  });
  const pipeMat = new THREE.MeshStandardMaterial({
    map: maps.pipes,
    roughness: 0.55,
    metalness: 0.5,
    color: 0xffffff,
  });
  const hazardMat = new THREE.MeshStandardMaterial({
    map: maps.hazard,
    roughness: 0.55,
    metalness: 0.28,
    color: 0xffffff,
  });
  const consoleMat = new THREE.MeshStandardMaterial({
    map: maps.console,
    roughness: 0.48,
    metalness: 0.42,
    color: 0xffffff,
    emissive: 0x2ee0c8,
    emissiveMap: maps.console,
    emissiveIntensity: 0.28,
  });
  const ionMat = new THREE.MeshStandardMaterial({
    color: 0x1a3c38,
    emissive: 0x7ff5e4,
    emissiveIntensity: 1.6,
    roughness: 0.28,
    metalness: 0.45,
  });
  const emberMat = new THREE.MeshStandardMaterial({
    color: 0x3a1812,
    emissive: 0xff6a45,
    emissiveIntensity: 1.35,
    roughness: 0.3,
  });
  const padMat = new THREE.MeshStandardMaterial({
    map: padTex,
    emissive: 0x7ff5e4,
    emissiveIntensity: 0.85,
    roughness: 0.32,
    metalness: 0.5,
  });
  const runeMat = new THREE.MeshStandardMaterial({
    map: maps.rune,
    roughness: 0.45,
    metalness: 0.35,
    color: 0xffffff,
    emissive: 0x2ee0c8,
    emissiveMap: maps.rune,
    emissiveIntensity: 0.85,
  });
  const skullMat = new THREE.MeshStandardMaterial({
    map: maps.skull,
    roughness: 0.42,
    metalness: 0.55,
    color: 0xffffff,
    emissive: 0xff5a28,
    emissiveMap: maps.skull,
    emissiveIntensity: 0.28,
  });
  const ruinMat = new THREE.MeshStandardMaterial({
    map: maps.ruin,
    roughness: 0.72,
    metalness: 0.28,
    color: 0xffffff,
    emissive: 0xff4a22,
    emissiveMap: maps.ruin,
    emissiveIntensity: 0.12,
  });
  const armorMat = new THREE.MeshStandardMaterial({
    map: maps.armor,
    roughness: 0.5,
    metalness: 0.58,
    color: 0xffffff,
  });
  mats.push(
    floorMat,
    plateMat,
    beamMat,
    pipeMat,
    hazardMat,
    consoleMat,
    ionMat,
    emberMat,
    padMat,
    runeMat,
    skullMat,
    ruinMat,
    armorMat,
  );

  const lights = createArenaLights(scene, {
    floor: floorMat,
    rune: runeMat,
    console: consoleMat,
    ruin: ruinMat,
    skull: skullMat,
    pad: padMat,
    ion: ionMat,
    ember: emberMat,
  });

  const WALL_H = 11;
  addBox(batch, solids, floorMat, 0, -1, 0, 90, 1, 90);
  addBox(batch, solids, ruinMat, 0, 0, -44.7, 92, WALL_H, 1.4);
  addBox(batch, solids, ruinMat, 0, 0, 44.7, 92, WALL_H, 1.4);
  addBox(batch, solids, ruinMat, -44.7, 0, 0, 1.4, WALL_H, 92);
  addBox(batch, solids, ruinMat, 44.7, 0, 0, 1.4, WALL_H, 92);

  const runeDecals = [
    { x: 0, y: 5.2, z: -43.96, ry: 0, s: 3.2 },
    { x: 0, y: 5.2, z: 43.96, ry: Math.PI, s: 3.2 },
    { x: -43.96, y: 5.2, z: 0, ry: Math.PI / 2, s: 3.2 },
    { x: 43.96, y: 5.2, z: 0, ry: -Math.PI / 2, s: 3.2 },
  ];
  const skullDecals = [
    { x: -16, y: 4.2, z: -43.96, ry: 0, s: 3.6 },
    { x: 16, y: 4.2, z: 43.96, ry: Math.PI, s: 3.6 },
    { x: -43.96, y: 4.2, z: 16, ry: Math.PI / 2, s: 3.6 },
    { x: 43.96, y: 4.2, z: -16, ry: -Math.PI / 2, s: 3.6 },
  ];
  geos.push(instancePlanes(group, runeMat, runeDecals).geo);
  geos.push(instancePlanes(group, skullMat, skullDecals).geo);

  addBox(batch, solids, hazardMat, 0, 3.2, -44.05, 88, 0.12, 0.2, false);
  addBox(batch, solids, hazardMat, 0, 3.2, 44.05, 88, 0.12, 0.2, false);
  addBox(batch, solids, ionMat, -44.05, 6.2, 0, 0.18, 0.1, 88, false);
  addBox(batch, solids, ionMat, 44.05, 6.2, 0, 0.18, 0.1, 88, false);
  addBox(batch, solids, consoleMat, 0, 0, 0, 7.2, 1.35, 7.2);
  addBox(batch, solids, emberMat, 0, 1.35, 0, 7.2, 0.08, 7.2, false);

  for (const [px, pz, ph] of [
    [-8, -8, 4.4],
    [8, -8, 4.4],
    [-8, 8, 4.4],
    [8, 8, 4.4],
    [0, -11, 4.4],
    [0, 11, 4.4],
    [-24, -24, 5.2],
    [24, -24, 5.2],
    [-24, 24, 5.2],
    [24, 24, 5.2],
    [0, -32, 5.6],
    [0, 32, 5.6],
    [-32, 0, 5.6],
    [32, 0, 5.6],
  ] as const) {
    const bunker = Math.hypot(px, pz) > 20;
    addBox(batch, solids, bunker ? armorMat : beamMat, px, 0, pz, bunker ? 2.1 : 1.35, ph, bunker ? 2.1 : 1.35);
    addBox(batch, solids, ionMat, px, ph, pz, bunker ? 2.2 : 1.4, 0.1, bunker ? 2.2 : 1.4, false);
  }

  addBox(batch, solids, plateMat, 0, 3.15, -18.2, 16, 0.28, 4.4);
  addBox(batch, solids, plateMat, 0, 3.15, 18.2, 16, 0.28, 4.4);
  addBox(batch, solids, hazardMat, 0, 3.42, -18.2, 16, 0.06, 4.4, false);
  addBox(batch, solids, hazardMat, 0, 3.42, 18.2, 16, 0.06, 4.4, false);
  addBox(batch, solids, plateMat, -18.4, 3.15, 0, 4.2, 0.28, 10);
  addBox(batch, solids, plateMat, 18.4, 3.15, 0, 4.2, 0.28, 10);
  addBox(batch, solids, armorMat, 0, 3.15, -36, 28, 0.3, 7);
  addBox(batch, solids, armorMat, 0, 3.15, 36, 28, 0.3, 7);
  addBox(batch, solids, armorMat, -36, 3.15, 0, 7, 0.3, 22);
  addBox(batch, solids, armorMat, 36, 3.15, 0, 7, 0.3, 22);
  addBox(batch, solids, hazardMat, 0, 3.46, -36, 28, 0.06, 7, false);
  addBox(batch, solids, hazardMat, 0, 3.46, 36, 28, 0.06, 7, false);
  addBox(batch, solids, plateMat, 0, 3.15, -27, 4.4, 0.28, 14);
  addBox(batch, solids, plateMat, 0, 3.15, 27, 4.4, 0.28, 14);
  addBox(batch, solids, plateMat, -27, 3.15, 0, 14, 0.28, 4.4);
  addBox(batch, solids, plateMat, 27, 3.15, 0, 14, 0.28, 4.4);

  const mkStairs = (x: number, z: number, dir: number, along = "z") => {
    for (let i = 0; i < 9; i++) {
      const sy = i * 0.36;
      const off = dir * (i * 0.72 + 0.4);
      if (along === "z") addBox(batch, solids, hazardMat, x, 0, z + off, 3.2, sy + 0.36, 0.74);
      else addBox(batch, solids, hazardMat, x + off, 0, z, 0.74, sy + 0.36, 3.2);
    }
  };
  mkStairs(-10, -14.5, -1);
  mkStairs(10, 14.5, 1);
  mkStairs(-28, -30.5, -1);
  mkStairs(28, 30.5, 1);
  mkStairs(-30.5, 28, -1, "x");
  mkStairs(30.5, -28, 1, "x");

  addBox(batch, solids, pipeMat, -14, 0, 0, 0.7, 1.15, 5.5);
  addBox(batch, solids, pipeMat, 14, 0, 0, 0.7, 1.15, 5.5);
  addBox(batch, solids, pipeMat, 0, 0, -14, 5.5, 1.15, 0.7);
  addBox(batch, solids, pipeMat, 0, 0, 14, 5.5, 1.15, 0.7);
  addBox(batch, solids, pipeMat, -30, 0, 12, 0.8, 1.2, 8);
  addBox(batch, solids, pipeMat, 30, 0, -12, 0.8, 1.2, 8);
  addBox(batch, solids, beamMat, 0, 8.2, 0, 72, 0.4, 0.55, false);
  addBox(batch, solids, beamMat, 0, 8.2, 0, 0.55, 0.4, 72, false);

  const pads: JumpPad[] = [];
  const padSpecs: Array<{ x: number; z: number; vx: number; vy: number; vz: number; lit?: boolean }> = [
    { x: -17, z: -17, vx: 8, vy: 13.5, vz: 8, lit: true },
    { x: 17, z: -17, vx: -8, vy: 13.5, vz: 8, lit: true },
    { x: 17, z: 17, vx: -8, vy: 13.5, vz: -8, lit: true },
    { x: -17, z: 17, vx: 8, vy: 13.5, vz: -8, lit: true },
    { x: -18.4, z: -8, vx: 0, vy: 12.4, vz: 0, lit: true },
    { x: 18.4, z: 8, vx: 0, vy: 12.4, vz: 0, lit: true },
    { x: -38, z: -38, vx: 11, vy: 14.5, vz: 11 },
    { x: 38, z: -38, vx: -11, vy: 14.5, vz: 11 },
    { x: 38, z: 38, vx: -11, vy: 14.5, vz: -11 },
    { x: -38, z: 38, vx: 11, vy: 14.5, vz: -11 },
  ];
  for (const p of padSpecs) {
    if (p.lit) lights.addPad(group, p.x, p.z);
    pads.push({ aabb: boxAt(p.x, 0, p.z, 2.1, 1.2, 2.1), vx: p.vx, vy: p.vy, vz: p.vz });
  }
  geos.push(instanceCylinders(group, padMat, padSpecs.map((p) => ({ x: p.x, y: 0.1, z: p.z })), 1.05, 1.15, 0.16).geo);

  const items: ItemPad[] = [
    { id: "h1", kind: "health", x: -6, y: 1.55, z: 0, respawn: 12 },
    { id: "h2", kind: "health", x: 6, y: 1.55, z: 0, respawn: 12 },
    { id: "h3", kind: "health", x: 0, y: 0.2, z: -6, respawn: 10 },
    { id: "h4", kind: "health", x: 0, y: 0.2, z: 6, respawn: 10 },
    { id: "h5", kind: "health", x: -36, y: 3.55, z: -12, respawn: 12 },
    { id: "h6", kind: "health", x: 36, y: 3.55, z: 12, respawn: 12 },
    { id: "m1", kind: "mega", x: 0, y: 1.55, z: 0, respawn: 35 },
    { id: "a1", kind: "armor", x: -18.4, y: 3.55, z: 0, respawn: 22 },
    { id: "a2", kind: "armor", x: 18.4, y: 3.55, z: 0, respawn: 22 },
    { id: "a3", kind: "armor", x: 0, y: 3.55, z: -36, respawn: 24 },
    { id: "a4", kind: "armor", x: 0, y: 3.55, z: 36, respawn: 24 },
    { id: "am1", kind: "ammo", x: 0, y: 3.55, z: -18.2, respawn: 14 },
    { id: "am2", kind: "ammo", x: 0, y: 3.55, z: 18.2, respawn: 14 },
    { id: "am3", kind: "ammo", x: -36, y: 3.55, z: 0, respawn: 14 },
    { id: "w1", kind: "scatter", x: -11, y: 0.25, z: -4, respawn: 18 },
    { id: "w2", kind: "torpedo", x: 11, y: 0.25, z: 4, respawn: 22 },
    { id: "w3", kind: "lance", x: 0, y: 3.55, z: -18.2, respawn: 28 },
    { id: "w4", kind: "ion", x: 0, y: 3.55, z: 18.2, respawn: 20 },
    { id: "w5", kind: "torpedo", x: -17, y: 0.25, z: 0, respawn: 22 },
    { id: "w6", kind: "scatter", x: 32, y: 3.55, z: 0, respawn: 20 },
    { id: "w7", kind: "ion", x: -32, y: 3.55, z: 0, respawn: 20 },
    { id: "p1", kind: "rush", x: -14, y: 0.28, z: 8, respawn: 22 },
    { id: "p2", kind: "blink", x: 14, y: 0.28, z: -8, respawn: 26 },
    { id: "p3", kind: "volt", x: 0, y: 1.55, z: 8, respawn: 24 },
    { id: "p4", kind: "rush", x: 14, y: 0.28, z: 8, respawn: 22 },
    { id: "p5", kind: "blink", x: -14, y: 0.28, z: -8, respawn: 26 },
    { id: "p6", kind: "volt", x: 0, y: 3.55, z: 0, respawn: 30 },
    { id: "p7", kind: "rush", x: -36, y: 3.55, z: 8, respawn: 24 },
    { id: "p8", kind: "blink", x: 36, y: 3.55, z: -8, respawn: 26 },
    { id: "p9", kind: "volt", x: 0, y: 3.55, z: 32, respawn: 28 },
  ];

  const spawns: Spawn[] = [
    { x: -16, y: 0, z: -16, yaw: Math.PI * 0.25 },
    { x: 16, y: 0, z: -16, yaw: Math.PI * 0.75 },
    { x: 16, y: 0, z: 16, yaw: -Math.PI * 0.75 },
    { x: -16, y: 0, z: 16, yaw: -Math.PI * 0.25 },
    { x: 0, y: 3.43, z: -18.2, yaw: 0 },
    { x: 0, y: 3.43, z: 18.2, yaw: Math.PI },
    { x: -18.4, y: 3.43, z: 0, yaw: Math.PI / 2 },
    { x: 18.4, y: 3.43, z: 0, yaw: -Math.PI / 2 },
    { x: -36, y: 3.43, z: -8, yaw: Math.PI / 2 },
    { x: 36, y: 3.43, z: 8, yaw: -Math.PI / 2 },
    { x: -8, y: 3.43, z: -36, yaw: 0 },
    { x: 8, y: 3.43, z: 36, yaw: Math.PI },
  ];

  const waypoints = [
    { x: 0, y: 1.35, z: 0 },
    { x: -16, y: 0, z: -16 },
    { x: 16, y: 0, z: -16 },
    { x: 16, y: 0, z: 16 },
    { x: -16, y: 0, z: 16 },
    { x: 0, y: 3.43, z: -18 },
    { x: 0, y: 3.43, z: 18 },
    { x: -18, y: 3.43, z: 0 },
    { x: 18, y: 3.43, z: 0 },
    { x: -8, y: 0, z: 0 },
    { x: 8, y: 0, z: 0 },
    { x: 0, y: 0, z: -8 },
    { x: 0, y: 0, z: 8 },
    { x: -17, y: 0, z: -17 },
    { x: 17, y: 0, z: 17 },
    { x: -36, y: 3.43, z: 0 },
    { x: 36, y: 3.43, z: 0 },
    { x: 0, y: 3.43, z: -36 },
    { x: 0, y: 3.43, z: 36 },
    { x: -24, y: 0, z: -24 },
    { x: 24, y: 0, z: 24 },
    { x: -38, y: 0, z: -38 },
    { x: 38, y: 0, z: 38 },
  ];

  const skyDome = loadSkyTex("/textures/sky-dome.jpg");
  const horizon = loadSkyTex("/textures/horizon.jpg");
  horizon.wrapS = THREE.RepeatWrapping;
  horizon.repeat.set(2, 1);
  texs.push(skyDome, horizon);

  const skyGeo = new THREE.SphereGeometry(260, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const skyMat = new THREE.MeshBasicMaterial({
    map: skyDome,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
    toneMapped: false,
  });
  mats.push(skyMat);
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.position.y = 12;
  sky.frustumCulled = false;
  sky.renderOrder = -20;
  scene.add(sky);

  const cityGeo = new THREE.CylinderGeometry(92, 92, 40, 20, 1, true);
  const cityMat = new THREE.MeshBasicMaterial({
    map: horizon,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
    toneMapped: false,
  });
  mats.push(cityMat);
  const city = new THREE.Mesh(cityGeo, cityMat);
  city.position.y = 18;
  city.frustumCulled = false;
  city.renderOrder = -18;
  scene.add(city);

  batch.build(group);
  geos.push(skyGeo, cityGeo);

  scene.add(group);

  return {
    group,
    solids,
    pads,
    items,
    spawns,
    waypoints,
    lights,
    dispose: () => {
      scene.remove(group);
      scene.remove(sky);
      scene.remove(city);
      lights.dispose();
      batch.dispose();
      group.traverse((obj) => {
        if (obj instanceof THREE.BatchedMesh || obj instanceof THREE.InstancedMesh) obj.dispose();
      });
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      for (const t of texs) t.dispose();
    },
  };
}

export { makeBotMesh } from "./fighterMesh";

export function makeItemMesh(kind: ItemPad["kind"]): THREE.Group {
  const g = new THREE.Group();
  let color = 0x3ccf7a;
  if (kind === "mega") color = 0x7dffb2;
  else if (kind === "armor") color = 0x5aa8ff;
  else if (kind === "ammo") color = 0xe8c36a;
  else if (kind === "scatter") color = 0xe24a2b;
  else if (kind === "torpedo") color = 0xff7a3a;
  else if (kind === "lance") color = 0x2ee0c8;
  else if (kind === "ion") color = 0x5aa8ff;
  else if (kind === "pulse") color = 0xe8c36a;
  else if (isPower(kind)) color = POWER_META[kind].color;
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: isPower(kind) ? 1.1 : 0.7,
    roughness: 0.28,
    metalness: 0.35,
  });
  if (kind === "health" || kind === "mega") {
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.12), mat);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.12), mat);
    g.add(a, b);
  } else if (kind === "armor") {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.28, 0.22), mat));
  } else if (kind === "ammo") {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.32), mat));
  } else if (kind === "rush") {
    g.add(new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 5), mat));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.04, 6, 14), mat);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
  } else if (kind === "blink") {
    g.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.28), mat));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 6, 14), mat);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
  } else if (kind === "volt") {
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.48, 0.1), mat);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.1), mat);
    b.position.y = 0.06;
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.26, 0.1), mat);
    c.position.set(0.12, -0.1, 0);
    g.add(a, b, c);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.04, 6, 14), mat);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
  } else {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.42), mat));
  }
  bakeMeshes(g, mat);
  return g;
}

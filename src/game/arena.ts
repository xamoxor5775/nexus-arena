import * as THREE from "three";
import { boxAt } from "./collision";
import type { AABB, ItemPad, JumpPad, Spawn, TeleportGate } from "./types";
import { isPower, POWER_META } from "./constants";
import { loadArenaMaps, loadSkyTex, loadTex, pickupTexture, supplyCrateTexture } from "./textures";
import { createArenaLights, type ArenaLights } from "./lighting";
import { BoxBatch, bakeMeshes, instanceCylinders, instancePlanes } from "./instancing";

export type ArenaData = {
  group: THREE.Group;
  solids: AABB[];
  pads: JumpPad[];
  hazards?: Array<{ x: number; y: number; z: number; radius: number; damage: number; color: number }>;
  teleports?: TeleportGate[];
  items: ItemPad[];
  spawns: Spawn[];
  waypoints: { x: number; y: number; z: number }[];
  lights: ArenaLights;
  update?: (now: number, dt: number) => void;
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

export function buildArena(scene: THREE.Scene, renderer?: THREE.WebGLRenderer): ArenaData {
  const group = new THREE.Group();
  const solids: AABB[] = [];
  const mats: THREE.Material[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const batch = new BoxBatch();

  const maps = loadArenaMaps();
  const padTex = loadTex("/textures/power-emblem.jpg", 1, 1);
  const voxelTex = loadTex("/textures/voxel-stone.jpg", 1, 1);

  const floorMat = new THREE.MeshStandardMaterial({
    map: maps.floor,
    roughness: 0.7,
    metalness: 0.48,
    color: 0xffffff,
    emissive: 0x2ee0c8,
    emissiveMap: maps.floor,
    emissiveIntensity: 0.22,
  });
  const plateMat = new THREE.MeshLambertMaterial({
    map: maps.plate,
    color: 0xffffff,
  });
  const beamMat = new THREE.MeshLambertMaterial({
    map: maps.beam,
    color: 0xffffff,
  });
  const pipeMat = new THREE.MeshLambertMaterial({
    map: maps.pipes,
    color: 0xffffff,
  });
  const hazardMat = new THREE.MeshLambertMaterial({
    map: maps.hazard,
    color: 0xffffff,
  });
  const consoleMat = new THREE.MeshLambertMaterial({
    map: maps.console,
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
  const voxelMat = new THREE.MeshLambertMaterial({
    map: voxelTex,
    color: 0xffffff,
    emissive: 0x261c19,
    emissiveIntensity: 0.1,
  });
  const padMat = new THREE.MeshStandardMaterial({
    map: padTex,
    emissive: 0x7ff5e4,
    emissiveMap: padTex,
    emissiveIntensity: 0.85,
    roughness: 0.32,
    metalness: 0.5,
  });
  const runeMat = new THREE.MeshLambertMaterial({
    map: maps.rune,
    color: 0xffffff,
    emissive: 0x2ee0c8,
    emissiveMap: maps.rune,
    emissiveIntensity: 0.85,
  });
  const skullMat = new THREE.MeshLambertMaterial({
    map: maps.skull,
    color: 0xffffff,
    emissive: 0xff5a28,
    emissiveMap: maps.skull,
    emissiveIntensity: 0.28,
  });
  const ruinMat = new THREE.MeshLambertMaterial({
    map: maps.ruin,
    color: 0xffffff,
    emissive: 0xff4a22,
    emissiveMap: maps.ruin,
    emissiveIntensity: 0.12,
  });
  const armorMat = new THREE.MeshLambertMaterial({
    map: maps.armor,
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
    voxelMat,
    padMat,
    runeMat,
    skullMat,
    ruinMat,
    armorMat,
  );

  const lights = createArenaLights(
    scene,
    {
      floor: floorMat,
      rune: runeMat,
      console: consoleMat,
      ruin: ruinMat,
      skull: skullMat,
      pad: padMat,
      ion: ionMat,
      ember: emberMat,
    },
    renderer,
  );

  const WALL_H = 11;
  const ARENA_HALF = 55;
  const ARENA_SIZE = ARENA_HALF * 2 + 2;
  const cryptBrick = loadTex("/textures/crypt-brick.jpg", 3, 2);
  const cryptArch = loadTex("/textures/crypt-arch.jpg", 4, 1);
  const boneMat = new THREE.MeshLambertMaterial({
    map: cryptBrick,
    color: 0xc8c2b8,
    emissive: 0x1a1612,
    emissiveIntensity: 0.06,
  });
  const archMat = new THREE.MeshLambertMaterial({
    map: cryptArch,
    color: 0xd0cbc2,
    emissive: 0x1c1814,
    emissiveIntensity: 0.05,
  });
  mats.push(boneMat, archMat);
  buildCatacombs(batch, solids, group, geos, mats, floorMat, boneMat, skullMat, emberMat, ARENA_SIZE, archMat);
  addBox(batch, solids, ruinMat, 0, 0, -ARENA_HALF, ARENA_SIZE, WALL_H, 1.4);
  addBox(batch, solids, ruinMat, 0, 0, ARENA_HALF, ARENA_SIZE, WALL_H, 1.4);
  addBox(batch, solids, ruinMat, -ARENA_HALF, 0, 0, 1.4, WALL_H, ARENA_SIZE);
  addBox(batch, solids, ruinMat, ARENA_HALF, 0, 0, 1.4, WALL_H, ARENA_SIZE);

  const runeDecals = [
    { x: 0, y: 5.2, z: -54.26, ry: 0, s: 3.2 },
    { x: 0, y: 5.2, z: 54.26, ry: Math.PI, s: 3.2 },
    { x: -54.26, y: 5.2, z: 0, ry: Math.PI / 2, s: 3.2 },
    { x: 54.26, y: 5.2, z: 0, ry: -Math.PI / 2, s: 3.2 },
  ];
  const skullDecals = [
    { x: -16, y: 4.2, z: -54.26, ry: 0, s: 3.6 },
    { x: 16, y: 4.2, z: 54.26, ry: Math.PI, s: 3.6 },
    { x: -54.26, y: 4.2, z: 16, ry: Math.PI / 2, s: 3.6 },
    { x: 54.26, y: 4.2, z: -16, ry: -Math.PI / 2, s: 3.6 },
  ];
  geos.push(instancePlanes(group, runeMat, runeDecals).geo);
  geos.push(instancePlanes(group, skullMat, skullDecals).geo);

  addBox(batch, solids, hazardMat, 0, 3.2, -54.05, 108, 0.12, 0.2, false);
  addBox(batch, solids, hazardMat, 0, 3.2, 54.05, 108, 0.12, 0.2, false);
  addBox(batch, solids, ionMat, -54.05, 6.2, 0, 0.18, 0.1, 108, false);
  addBox(batch, solids, ionMat, 54.05, 6.2, 0, 0.18, 0.1, 108, false);
  addBox(batch, solids, consoleMat, 0, 0, 0, 7.2, 1.35, 7.2);
  addBox(batch, solids, emberMat, 0, 1.35, 0, 7.2, 0.08, 7.2, false);
  const altarCorners = [
    [-3.6, -3.6],
    [3.6, -3.6],
    [3.6, 3.6],
    [-3.6, 3.6],
  ] as const;
  geos.push(
    instanceCylinders(
      group,
      consoleMat,
      altarCorners.map(([x, z]) => ({ x, y: 0.675, z })),
      0.95,
      0.95,
      1.35,
    ).geo,
  );

  // Voxel ruins: stepped blocks give the arena a readable Minecraft-like silhouette
  // without replacing the existing industrial collision layout.
  for (const [x, z, h] of [[-34, -20, 4], [34, -20, 3], [-34, 20, 3], [34, 20, 4], [-20, -34, 3], [20, 34, 4]] as const) {
    for (let level = 0; level < h; level++) {
      const inset = level * 0.18;
      addBox(batch, solids, voxelMat, x, level * 1.05, z, 3.2 - inset, 1.02, 3.2 - inset);
    }
  }

  const pitCols = [
    [-8, -8, 4.4],
    [8, -8, 4.4],
    [-8, 8, 4.4],
    [8, 8, 4.4],
    [0, -11, 4.4],
    [0, 11, 4.4],
  ] as const;
  for (const [px, pz, ph] of pitCols) solids.push(boxAt(px, 0, pz, 1.36, ph, 1.36));
  geos.push(
    instanceCylinders(
      group,
      beamMat,
      pitCols.map(([x, z, h]) => ({ x, y: h / 2, z })),
      0.68,
      0.74,
      4.4,
    ).geo,
  );
  geos.push(
    instanceCylinders(
      group,
      ionMat,
      pitCols.map(([x, z]) => ({ x, y: 4.46, z })),
      0.78,
      0.78,
      0.12,
    ).geo,
  );
  for (const [px, pz, ph] of [
    [-24, -24, 5.2],
    [24, -24, 5.2],
    [-24, 24, 5.2],
    [24, 24, 5.2],
    [0, -32, 5.6],
    [0, 32, 5.6],
    [-32, 0, 5.6],
    [32, 0, 5.6],
  ] as const) {
    addBox(batch, solids, armorMat, px, 0, pz, 2.1, ph, 2.1);
    addBox(batch, solids, ionMat, px, ph, pz, 2.2, 0.1, 2.2, false);
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
    const rise = 0.36;
    const tread = 1.12;
    const width = 5.8;
    for (let i = 0; i < 9; i++) {
      const top = (i + 1) * rise;
      const off = dir * (i * 0.78 + 0.56);
      const slabY = top - rise;
      const nose = dir * (tread * 0.36);
      if (along === "z") {
        addBox(batch, solids, plateMat, x, slabY, z + off, width, rise, tread);
        addBox(batch, solids, hazardMat, x, top - 0.04, z + off + nose, width * 0.94, 0.045, 0.2, false);
      } else {
        addBox(batch, solids, plateMat, x + off, slabY, z, tread, rise, width);
        addBox(batch, solids, hazardMat, x + off + nose, top - 0.04, z, 0.2, 0.045, width * 0.94, false);
      }
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

  // Perimeter cover expands the combat space with a small, batched geometry cost.
  const corners = [
    [-49, -42],
    [49, -42],
    [-49, 42],
    [49, 42],
  ] as const;
  for (const [x, z] of corners) solids.push(boxAt(x, 0, z, 4.3, 4.8, 4.3));
  geos.push(instanceCylinders(group, ruinMat, corners.map(([x, z]) => ({ x, y: 2.4, z })), 2.2, 2.35, 4.8).geo);
  geos.push(instanceCylinders(group, ionMat, corners.map(([x, z]) => ({ x, y: 4.9, z })), 2.45, 2.45, 0.14).geo);

  const towers = [
    [-42, -26],
    [42, -26],
    [-42, 26],
    [42, 26],
  ] as const;
  const shaftH = 6.6;
  const shaftR = 1.55;
  for (const [x, z] of towers) solids.push(boxAt(x, 0, z, shaftR * 2, shaftH, shaftR * 2));
  geos.push(
    instanceCylinders(
      group,
      ruinMat,
      towers.map(([x, z]) => ({ x, y: shaftH / 2, z })),
      shaftR,
      shaftR + 0.16,
      shaftH,
    ).geo,
  );
  geos.push(instanceCylinders(group, boneMat, towers.map(([x, z]) => ({ x, y: 0.38, z })), 2.15, 2.35, 0.76).geo);
  geos.push(instanceCylinders(group, boneMat, towers.map(([x, z]) => ({ x, y: shaftH + 0.16, z })), 1.95, 1.85, 0.32).geo);
  const towerSkulls: Array<{ x: number; y: number; z: number; ry: number; s: number }> = [];
  for (const [x, z] of towers) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const mx = x + Math.cos(a) * 1.55;
      const mz = z + Math.sin(a) * 1.55;
      addBox(batch, solids, boneMat, mx, shaftH + 0.28, mz, 0.42, 0.72, 0.42, false);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      addBox(
        batch,
        solids,
        armorMat,
        x + Math.cos(a) * (shaftR + 0.08),
        1.15,
        z + Math.sin(a) * (shaftR + 0.08),
        0.22,
        4.2,
        0.22,
        false,
      );
    }
    addBox(batch, solids, emberMat, x, shaftH + 0.32, z, 0.55, 0.16, 0.55, false);
    addBox(batch, solids, ionMat, x, 3.1, z - shaftR, 0.28, 0.9, 0.08, false);
    const len = Math.hypot(x, z) || 1;
    const nx = -x / len;
    const nz = -z / len;
    towerSkulls.push({
      x: x + nx * (shaftR + 0.04),
      y: 4.4,
      z: z + nz * (shaftR + 0.04),
      ry: Math.atan2(nx, nz),
      s: 1.05,
    });
    lights.addGlint(group, x, shaftH + 1.35, z);
  }
  geos.push(instancePlanes(group, skullMat, towerSkulls).geo);

  lights.addFill(group, 0, 5.6, 0, 0xffc090, 6.4, 34);

  const pitSkulls = [
    { x: 0, y: 0.82, z: -3.68, ry: 0, s: 1.15 },
    { x: 0, y: 0.82, z: 3.68, ry: Math.PI, s: 1.15 },
    { x: -3.68, y: 0.82, z: 0, ry: Math.PI / 2, s: 1.15 },
    { x: 3.68, y: 0.82, z: 0, ry: -Math.PI / 2, s: 1.15 },
    { x: -4.2, y: 2.5, z: -15.9, ry: 0, s: 1.25 },
    { x: 4.2, y: 2.5, z: -15.9, ry: 0, s: 1.25 },
    { x: -4.2, y: 2.5, z: 15.9, ry: Math.PI, s: 1.25 },
    { x: 4.2, y: 2.5, z: 15.9, ry: Math.PI, s: 1.25 },
    { x: -16.2, y: 2.5, z: -3.2, ry: Math.PI / 2, s: 1.25 },
    { x: -16.2, y: 2.5, z: 3.2, ry: Math.PI / 2, s: 1.25 },
    { x: 16.2, y: 2.5, z: -3.2, ry: -Math.PI / 2, s: 1.25 },
    { x: 16.2, y: 2.5, z: 3.2, ry: -Math.PI / 2, s: 1.25 },
  ];
  for (const col of pitCols) {
    const len = Math.hypot(col[0], col[1]) || 1;
    const nx = -col[0] / len;
    const nz = -col[1] / len;
    pitSkulls.push({
      x: col[0] + nx * 0.78,
      y: 2.15,
      z: col[1] + nz * 0.78,
      ry: Math.atan2(nx, nz),
      s: 0.95,
    });
  }
  geos.push(instancePlanes(group, skullMat, pitSkulls).geo);
  for (const skull of pitSkulls) {
    const nx = Math.sin(skull.ry);
    const nz = Math.cos(skull.ry);
    lights.addGlint(group, skull.x + nx * 0.15, skull.y + 0.35, skull.z + nz * 0.15);
  }
  for (const [x, z] of corners) {
    lights.addGlint(group, x, 5.15, z);
  }

  const pads: JumpPad[] = [];
  const teleports: TeleportGate[] = [];
  const padSpecs: Array<{ x: number; z: number; vx: number; vy: number; vz: number; lit?: boolean }> = [
    { x: -17, z: -17, vx: 8, vy: 13.5, vz: 8, lit: true },
    { x: 17, z: -17, vx: -8, vy: 13.5, vz: 8, lit: true },
    { x: 17, z: 17, vx: -8, vy: 13.5, vz: -8, lit: true },
    { x: -17, z: 17, vx: 8, vy: 13.5, vz: -8, lit: true },
    { x: -18.4, z: -8, vx: 0, vy: 12.4, vz: 0, lit: true },
    { x: 18.4, z: 8, vx: 0, vy: 12.4, vz: 0, lit: true },
  ];
  for (const p of padSpecs) {
    if (p.lit) lights.addPad(group, p.x, p.z);
    pads.push({ aabb: boxAt(p.x, 0, p.z, 2.1, 1.2, 2.1), vx: p.vx, vy: p.vy, vz: p.vz });
  }
  geos.push(instanceCylinders(group, padMat, padSpecs.map((p) => ({ x: p.x, y: 0.1, z: p.z })), 1.05, 1.15, 0.16).geo);

  const portalRing = new THREE.TorusGeometry(1.15, 0.09, 8, 22);
  const portalBase = new THREE.CylinderGeometry(1.2, 1.32, 0.14, 16);
  const skyRing = new THREE.TorusGeometry(1.45, 0.06, 6, 20);
  geos.push(portalRing, portalBase, skyRing);
  const portal = (
    x: number,
    z: number,
    targetX: number,
    targetZ: number,
  ) => {
    teleports.push({
      aabb: boxAt(x, 0.85, z, 2.3, 1.7, 2.3),
      target: { x: targetX, y: 26, z: targetZ, yaw: Math.atan2(-targetX, -targetZ) },
      chute: true,
    });
    const base = new THREE.Mesh(portalBase, padMat);
    base.position.set(x, 0.08, z);
    const ring = new THREE.Mesh(portalRing, ionMat);
    ring.position.set(x, 1.15, z);
    ring.rotation.x = Math.PI / 2;
    const mark = new THREE.Mesh(skyRing, ionMat);
    mark.position.set(targetX, 26.4, targetZ);
    mark.rotation.x = Math.PI / 2;
    group.add(base, ring, mark);
    lights.addPad(group, x, z, 0.7);
  };
  portal(-26, 20, 12, -18);
  portal(26, -20, -12, 18);

  const items: ItemPad[] = [
    { id: "h1", kind: "health", x: -6, y: 0.2, z: 0, respawn: 12 },
    { id: "h2", kind: "health", x: 6, y: 0.2, z: 0, respawn: 12 },
    { id: "h3", kind: "health", x: 0, y: 0.2, z: -6, respawn: 12 },
    { id: "h4", kind: "health", x: 0, y: 0.2, z: 6, respawn: 12 },
    { id: "m1", kind: "mega", x: 0, y: 0.2, z: 0, respawn: 35 },
    { id: "a1", kind: "armor", x: -18.4, y: 3.55, z: 0, respawn: 22 },
    { id: "a2", kind: "armor", x: 18.4, y: 3.55, z: 0, respawn: 22 },
    { id: "am1", kind: "ammo", x: 0, y: 3.55, z: -18.2, respawn: 14 },
    { id: "am2", kind: "ammo", x: 0, y: 3.55, z: 18.2, respawn: 14 },
    { id: "w1", kind: "scatter", x: -11, y: 0.25, z: -4, respawn: 18 },
    { id: "w2", kind: "torpedo", x: 6, y: 3.55, z: -18.2, respawn: 22 },
    { id: "w3", kind: "lance", x: 0, y: 3.55, z: -36, respawn: 28 },
    { id: "w4", kind: "ion", x: -36, y: 3.55, z: 0, respawn: 20 },
    { id: "p1", kind: "rush", x: -14, y: 0.28, z: 8, respawn: 22 },
    { id: "p2", kind: "blink", x: 14, y: 0.28, z: -8, respawn: 26 },
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
    { x: -48, y: 0, z: -42 },
    { x: 48, y: 0, z: -42 },
    { x: 48, y: 0, z: 42 },
    { x: -48, y: 0, z: 42 },
    { x: 0, y: -4.6, z: 0 },
    { x: 0, y: -4.6, z: -28 },
    { x: 0, y: -4.6, z: 28 },
    { x: -28, y: -4.6, z: 0 },
    { x: 28, y: -4.6, z: 0 },
    { x: -16, y: -4.6, z: -16 },
    { x: 16, y: -4.6, z: 16 },
    { x: 0, y: -9, z: 22 },
  ];

  const addWire = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, w = 0.36) => {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dy, dz);
    const n = Math.max(2, Math.ceil(len / 0.58));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      addBox(batch, solids, beamMat, x0 + dx * t, y0 + dy * t, z0 + dz * t, w, 0.14, w);
    }
  };
  addBox(batch, solids, plateMat, -24, 8.7, -40, 3.2, 0.22, 3.2);
  addBox(batch, solids, plateMat, 24, 8.7, -40, 3.2, 0.22, 3.2);
  addWire(-8, 0.2, -40, -24, 8.7, -40);
  addWire(8, 0.2, -40, 24, 8.7, -40);
  addWire(-24, 8.7, -40, 24, 8.7, -40, 0.7);

  const stars = loadSkyTex("/textures/sky-stars.jpg");
  const skyGeo = new THREE.SphereGeometry(240, 32, 20);
  const skyMat = new THREE.MeshBasicMaterial({
    map: stars,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
    toneMapped: false,
  });
  mats.push(skyMat);
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -20;
  sky.castShadow = false;
  sky.receiveShadow = false;
  scene.add(sky);

  batch.build(group);
  geos.push(skyGeo);

  scene.add(group);

  return {
    group,
    solids,
    pads,
    teleports,
    items,
    spawns,
    waypoints,
    lights,
    dispose: () => {
      scene.remove(group);
      scene.remove(sky);
      lights.dispose();
      batch.dispose();
      group.traverse((obj) => {
        if (obj instanceof THREE.BatchedMesh || obj instanceof THREE.InstancedMesh) obj.dispose();
      });
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
    },
  };
}

function buildCatacombs(
  batch: BoxBatch,
  solids: AABB[],
  group: THREE.Group,
  geos: THREE.BufferGeometry[],
  mats: THREE.Material[],
  floorMat: THREE.Material,
  boneMat: THREE.Material,
  skullMat: THREE.Material,
  emberMat: THREE.Material,
  arenaSize: number,
  archMat: THREE.Material,
) {
  const half = arenaSize / 2;
  const lip = 2.7;
  const shafts = [
    { x: 0, z: -42, along: "z" as const, dir: -1 },
    { x: 0, z: 42, along: "z" as const, dir: 1 },
    { x: -42, z: 0, along: "x" as const, dir: -1 },
    { x: 42, z: 0, along: "x" as const, dir: 1 },
  ];
  const bands: Array<[number, number, number, number]> = [
    [-half, -45.6, -half, half],
    [-45.6, -38.4, -half, -lip],
    [-45.6, -38.4, lip, half],
    [-38.4, -lip, -half, half],
    [-lip, lip, -half, -45.6],
    [-lip, lip, -38.4, 38.4],
    [-lip, lip, 45.6, half],
    [lip, 16.05, -half, half],
    [16.05, 16.35, -half, -1.15],
    [16.05, 16.35, 1.15, half],
    [16.35, 20.05, -half, half],
    [20.05, 20.35, -half, -1.15],
    [20.05, 20.35, 1.15, half],
    [20.35, 24.05, -half, half],
    [24.05, 24.35, -half, -1.15],
    [24.05, 24.35, 1.15, half],
    [24.35, 38.4, -half, half],
    [38.4, 45.6, -half, -lip],
    [38.4, 45.6, lip, half],
    [45.6, half, -half, half],
  ];
  for (const [z0, z1, x0, x1] of bands) {
    addBox(batch, solids, floorMat, (x0 + x1) / 2, -1, (z0 + z1) / 2, x1 - x0, 1, z1 - z0);
  }

  const crypt = -4.6;
  const deep = -9;
  const cryptFloor = (x: number, z: number, w: number, d: number) => {
    addBox(batch, solids, boneMat, x, crypt - 1.1, z, w, 1.1, d);
  };
  cryptFloor(0, -19, 96, 58);
  cryptFloor(0, 38, 96, 20);
  cryptFloor(-24.8, 14, 46.4, 8);
  cryptFloor(24.8, 14, 46.4, 8);
  cryptFloor(0, 19.025, 96, 2.05);
  cryptFloor(-24.8, 20.2, 46.4, 0.3);
  cryptFloor(24.8, 20.2, 46.4, 0.3);
  cryptFloor(0, 22.2, 96, 3.7);
  cryptFloor(-24.8, 24.2, 46.4, 0.3);
  cryptFloor(24.8, 24.2, 46.4, 0.3);
  cryptFloor(0, 26.175, 96, 3.65);
  const shell = [
    [0, -48, 96, 1.4],
    [0, 48, 96, 1.4],
  ] as const;
  for (const [x, z, w, d] of shell) addBox(batch, solids, archMat, x, crypt, z, w, 3.5, d);
  addBox(batch, solids, archMat, -48, crypt, 0, 1.4, 3.5, 96);
  addBox(batch, solids, archMat, 48, crypt, 0, 1.4, 3.5, 96);

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addBox(batch, solids, boneMat, sx * 16, crypt, sz * 16, 18, 2.2, 18);
    }
  }
  const throat = 2.2;
  for (const side of [-1, 1]) {
    addBox(batch, solids, archMat, side * 1.55, crypt, -18, 0.7, throat, 28);
    addBox(batch, solids, archMat, side * 1.55, crypt, 18, 0.7, throat, 28);
    addBox(batch, solids, archMat, -18, crypt, side * 1.55, 28, throat, 0.7);
    addBox(batch, solids, archMat, 18, crypt, side * 1.55, 28, throat, 0.7);
  }
  const hallCeil = (z: number, d: number) => {
    addBox(batch, solids, boneMat, 0, crypt + 2.05, z, 2.5, 0.45, d);
  };
  hallCeil(-8, 48);
  hallCeil(18.2, 3.7);
  hallCeil(22.2, 3.7);
  hallCeil(28.175, 7.65);
  addBox(batch, solids, boneMat, 0, crypt + 2.05, 0, 64, 0.45, 2.5);
  for (let i = -4; i <= 4; i++) {
    if (i === 0) continue;
    const o = i * 7;
    if (Math.abs(o) !== 14 && Math.abs(o) !== 21) {
      addBox(batch, solids, boneMat, 0, crypt + 1.72, o, 2.35, 0.28, 0.35);
    }
    addBox(batch, solids, boneMat, o, crypt + 1.72, 0, 0.35, 0.28, 2.35);
  }

  addBox(batch, solids, boneMat, 0, deep - 1.1, 19, 11, 1.1, 19);
  addBox(batch, solids, boneMat, -4.6, deep, 19, 0.7, 3.3, 18);
  addBox(batch, solids, boneMat, 4.6, deep, 19, 0.7, 3.3, 18);
  addBox(batch, solids, boneMat, 0, deep, 27.6, 10, 3.3, 0.7);
  for (let i = 0; i < 8; i++) {
    const drop = (i + 1) * 0.55;
    const h = crypt - drop - deep;
    if (h < 0.2) continue;
    addBox(batch, solids, boneMat, 0, deep, 10.45 + i * 0.85, 2.5, h, 0.72);
  }

  for (const s of shafts) {
    const inner = s.along === "z" ? s.z - s.dir * 3.6 : s.x - s.dir * 3.6;
    for (let i = 0; i < 8; i++) {
      const drop = (i + 1) * 0.55;
      const pos = inner + s.dir * (0.45 + i * 0.82);
      const h = -drop - crypt;
      if (h <= 0.25) continue;
      if (s.along === "z") addBox(batch, solids, boneMat, s.x, crypt, pos, 4.2, h, 0.78);
      else addBox(batch, solids, boneMat, pos, crypt, s.z, 0.78, h, 4.2);
    }
  }

  const niches: Array<{ x: number; y: number; z: number; ry: number; s: number }> = [];
  for (let i = -4; i <= 4; i++) {
    if (i === 0) continue;
    const o = i * 8;
    niches.push(
      { x: -1.05, y: crypt + 1.15, z: o, ry: Math.PI / 2, s: 0.72 },
      { x: 1.05, y: crypt + 1.15, z: o, ry: -Math.PI / 2, s: 0.72 },
      { x: o, y: crypt + 1.15, z: -1.05, ry: 0, s: 0.72 },
      { x: o, y: crypt + 1.15, z: 1.05, ry: Math.PI, s: 0.72 },
    );
  }
  geos.push(instancePlanes(group, skullMat, niches).geo);

  const redMat = new THREE.MeshStandardMaterial({
    color: 0xff2a2a,
    emissive: 0xff2020,
    emissiveIntensity: 2.1,
    roughness: 0.35,
  });
  mats.push(redMat);
  for (const s of shafts) {
    const mouth = s.along === "z"
      ? { x: s.x, z: s.z - s.dir * 4.2 }
      : { x: s.x - s.dir * 4.2, z: s.z };
    for (const side of [-1, 1]) {
      const lx = s.along === "z" ? mouth.x + side * 1.15 : mouth.x;
      const lz = s.along === "z" ? mouth.z : mouth.z + side * 1.15;
      addBox(batch, solids, redMat, lx, 0.15, lz, 0.16, 0.22, 0.16, false);
    }
    const lamp = new THREE.PointLight(0xff2a2a, 2.2, 8, 1.8);
    lamp.position.set(mouth.x, 0.8, mouth.z);
    lamp.castShadow = false;
    group.add(lamp);
    const foot = s.along === "z"
      ? { x: s.x, z: s.z + s.dir * 2.2 }
      : { x: s.x + s.dir * 2.2, z: s.z };
    addBox(batch, solids, redMat, foot.x, crypt + 0.2, foot.z, 0.14, 0.16, 0.14, false);
  }

  const candles: Array<[number, number]> = [
    [0, 0],
    [0, -14],
    [0, 14],
    [0, -28],
    [0, 28],
    [-14, 0],
    [14, 0],
    [-28, 0],
    [28, 0],
  ];
  const sunMat = new THREE.MeshBasicMaterial({
    color: 0xfff1c4,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    toneMapped: false,
  });
  mats.push(sunMat);
  for (const z of [16.2, 20.2, 24.2]) {
    addBox(batch, solids, sunMat, 0, -8.9, z, 0.16, 8.7, 0.16, false);
    const shaft = new THREE.PointLight(0xffc070, 2.6, 9, 1.4);
    shaft.position.set(0, deep + 1.6, z);
    shaft.castShadow = false;
    group.add(shaft);
  }

  for (const [x, z] of candles) {
    addBox(batch, solids, emberMat, x, crypt, z, 0.12, 0.28, 0.12, false);
  }
  for (const [x, z] of [[0, 0], [0, 22], [0, -22]] as const) {
    const lamp = new THREE.PointLight(0xffb060, 1.5, 14, 1.7);
    lamp.position.set(x, crypt + 1.2, z);
    lamp.castShadow = false;
    group.add(lamp);
  }
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
  const crateStyle = kind === "armor"
    ? "armor"
    : kind === "ammo"
      ? "ammo"
      : kind === "pulse" || kind === "scatter" || kind === "torpedo" || kind === "lance" || kind === "ion"
        ? "weapon"
        : null;
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: kind === "health" || kind === "rush" ? 1.55 : isPower(kind) ? 1.1 : 0.7,
    roughness: kind === "health" || kind === "rush" ? 0.38 : 0.28,
    metalness: kind === "health" || kind === "rush" ? 0.56 : 0.35,
    map: kind === "health" || kind === "rush" ? pickupTexture(kind) : crateStyle ? supplyCrateTexture(crateStyle) : null,
  });
  if (kind === "health" || kind === "mega") {
    if (kind === "health") {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.32), mat);
      const a = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.16, 0.12), mat);
      a.position.z = 0.18;
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.76, 0.12), mat);
      b.position.z = 0.18;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.045, 6, 12), mat);
      rim.rotation.x = Math.PI / 2;
      rim.position.z = 0.17;
      g.add(body, a, b, rim);
    } else {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.52, 0.42), mat);
      const a = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.13, 0.12), mat);
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.5, 0.12), mat);
      a.position.z = b.position.z = 0.24;
      g.add(body, a, b);
    }
  } else if (kind === "armor") {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.4, 0.46), mat);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.1, 0.52), mat);
    lid.position.y = 0.25;
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), mat);
    core.position.y = 0.33;
    g.add(body, lid, core);
  } else if (kind === "ammo") {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.38, 0.48), mat);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.09, 0.54), mat);
    lid.position.y = 0.24;
    for (const x of [-0.16, 0, 0.16]) {
      const cell = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.23, 6), mat);
      cell.position.set(x, 0.31, 0);
      g.add(cell);
    }
    g.add(body, lid);
  } else if (kind === "rush") {
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.38, 0.68, 8), mat);
    core.rotation.z = Math.PI / 2;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.32, 6), mat);
    nose.rotation.z = -Math.PI / 2;
    nose.position.x = 0.42;
    const finA = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.5), mat);
    const finB = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.12), mat);
    finA.position.x = finB.position.x = -0.08;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.055, 6, 16), mat);
    ring.rotation.x = Math.PI / 2;
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.035, 6, 14), mat);
    ring2.rotation.x = Math.PI / 2;
    ring2.position.x = -0.14;
    g.add(core, nose, finA, finB, ring, ring2);
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
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.34, 0.62), mat);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.1, 0.68), mat);
    lid.position.y = 0.22;
    const seal = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.07), mat);
    seal.position.set(0, 0.04, 0.35);
    g.add(body, lid, seal);
  }
  const scanRing = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.032, 6, 16), mat);
  scanRing.rotation.x = Math.PI / 2;
  scanRing.position.y = -0.22;
  g.add(scanRing);
  g.userData.pickupMat = mat;
  g.userData.featuredPickup = true;
  bakeMeshes(g, mat);
  return g;
}

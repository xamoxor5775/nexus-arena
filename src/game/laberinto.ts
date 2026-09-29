import * as THREE from "three";
import { boxAt } from "./collision";
import type { ArenaData } from "./arena";
import { stampJumpPads, stampPortals } from "./arena";
import { BoxBatch, instanceCylinders, stampDecks } from "./instancing";
import { createArenaLights } from "./lighting";
import { isLoDevice, loadSpaceSky, loadTex, mazeWaterTex, skySphereGeo } from "./textures";
import type { AABB, FlagPad, ItemPad, JumpPad, Spawn, TeleportGate, WaterZone } from "./types";

/** 7 m de salto con JUMP_VEL 10.4 → g = v² / (2h). */
const MAZE_G = 7.72;
const N = 9;
const MID = 4;
const CELL = 4.85;
const PLAY_R = 20.6;
const FLOOR_Y = [0, 6.4, 12.8, 19.2] as const;
const CISTERN_Y = -6.4;
const THICK = 0.7;
const FULL_H = 5.55;
const HALF_H = 2.18;
const RAIL_H = 0.42;
const WALL_T = 0.55;
const MOON_R = 36;
const MOON_CY = 11.2;
const SHAFTS: Array<[number, number]> = [
  [1, MID],
  [7, MID],
  [MID, 1],
  [MID, 7],
];

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

function cx(i: number) {
  return (i - MID) * CELL;
}
function cz(j: number) {
  return (j - MID) * CELL;
}
function inDisk(i: number, j: number) {
  const x = cx(i);
  const z = cz(j);
  return x * x + z * z <= PLAY_R * PLAY_R;
}
function keyOf(i: number, j: number) {
  return `${i},${j}`;
}
function isShaft(i: number, j: number) {
  return SHAFTS.some(([a, b]) => a === i && b === j);
}

function mazeWalls(floor: number, cells: Array<[number, number]>) {
  const idOf = new Map<string, number>();
  cells.forEach(([i, j], n) => idOf.set(keyOf(i, j), n));
  const parent = cells.map((_, n) => n);
  const find = (a: number): number => (parent[a] === a ? a : (parent[a] = find(parent[a]!)));
  const walls = new Set<string>();
  const edges: Array<{ i: number; j: number; dir: 0 | 1 }> = [];
  for (const [i, j] of cells) {
    if (idOf.has(keyOf(i + 1, j))) edges.push({ i, j, dir: 0 });
    if (idOf.has(keyOf(i, j + 1))) edges.push({ i, j, dir: 1 });
    walls.add(`e:${i},${j}`);
    walls.add(`s:${i},${j}`);
  }
  let seed = ((floor + 3) * 1103515245 + 12345) >>> 0;
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = edges.length - 1; i > 0; i--) {
    const k = Math.floor(rnd() * (i + 1));
    const tmp = edges[i]!;
    edges[i] = edges[k]!;
    edges[k] = tmp;
  }
  for (const e of edges) {
    const a = idOf.get(keyOf(e.i, e.j))!;
    const b = idOf.get(e.dir === 0 ? keyOf(e.i + 1, e.j) : keyOf(e.i, e.j + 1))!;
    const pa = find(a);
    const pb = find(b);
    if (pa === pb) continue;
    parent[pa] = pb;
    walls.delete(e.dir === 0 ? `e:${e.i},${e.j}` : `s:${e.i},${e.j}`);
  }
  for (const e of edges) {
    if (rnd() < 0.52) walls.delete(e.dir === 0 ? `e:${e.i},${e.j}` : `s:${e.i},${e.j}`);
  }
  return walls;
}

function isHole(floor: number, i: number, j: number) {
  if (!inDisk(i, j)) return false;
  if (i === MID && j === MID) return floor >= 1;
  if (isShaft(i, j)) return floor >= 1;
  return false;
}

function isSpawnCell(i: number, j: number) {
  return (
    (i === 1 && j === 1) ||
    (i === 7 && j === 1) ||
    (i === 1 && j === 7) ||
    (i === 7 && j === 7) ||
    (i === 2 && j === MID) ||
    (i === 6 && j === MID)
  );
}

function stairRun(
  batch: BoxBatch,
  solids: AABB[],
  mat: THREE.Material,
  decks: Array<{ x: number; y: number; z: number; w: number; d: number }>,
  x0: number,
  z0: number,
  y0: number,
  x1: number,
  z1: number,
  y1: number,
  width: number,
) {
  const rise = y1 - y0;
  const n = Math.max(1, Math.ceil(Math.abs(rise) / 0.4));
  const h = rise / n;
  const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
  const span = Math.hypot(x1 - x0, z1 - z0) / n + 0.36;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const top = y0 + (i + 1) * h;
    const x = x0 + (x1 - x0) * t;
    const z = z0 + (z1 - z0) * t;
    const w = alongX ? span : width;
    const d = alongX ? width : span;
    addBox(batch, solids, mat, x, top - Math.abs(h), z, w, Math.abs(h), d);
    decks.push({ x, y: top + 0.02, z, w, d });
  }
}

/** Luna hueca de cuatro pisos + cisterna. Salto de 7 m, agua y luces. */
export function buildLaberinto(scene: THREE.Scene, renderer?: THREE.WebGLRenderer): ArenaData {
  const group = new THREE.Group();
  const solids: AABB[] = [];
  const pads: JumpPad[] = [];
  const teleports: TeleportGate[] = [];
  const items: ItemPad[] = [];
  const spawns: Spawn[] = [];
  const waypoints: { x: number; y: number; z: number }[] = [];
  const flags: FlagPad[] = [];
  const water: WaterZone[] = [];
  const mats: THREE.Material[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const batch = new BoxBatch();
  const decks: Array<{ x: number; y: number; z: number; w: number; d: number }> = [];

  const dust = loadTex("/textures/moon/piso-luna.webp", 1, 1);
  const crater = loadTex("/textures/moon/crateres.webp", 1, 1);
  const oxide = loadTex("/textures/moon/oxido.webp", 1, 1);
  const plate = loadTex("/textures/armor.jpg", 2.6, 2.6);
  const rune = loadTex("/textures/rune.jpg", 1.4, 1.4);
  const waterMap = mazeWaterTex(2.8, 2.8);

  const dustMat = new THREE.MeshLambertMaterial({
    map: dust,
    color: 0xffffff,
    emissive: 0x2a241c,
    emissiveIntensity: 0.1,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const craterMat = new THREE.MeshLambertMaterial({
    map: crater,
    color: 0xffffff,
    emissive: 0x1c2830,
    emissiveIntensity: 0.1,
    toneMapped: false,
  });
  const makeBasalt = (tiles: number) => {
    const m = new THREE.MeshLambertMaterial({
      map: loadTex("/textures/moon/basalto.webp", tiles, Math.max(1, Math.round(tiles * 0.55))),
      color: 0xffffff,
      emissive: 0x1a1814,
      emissiveIntensity: 0.08,
      toneMapped: false,
    });
    mats.push(m);
    return m;
  };
  const rockTiers = new Map<number, THREE.Material>();
  const rockFor = (size: number) => {
    const tiles = Math.max(1, Math.round(size / 2.8));
    let m = rockTiers.get(tiles);
    if (!m) {
      m = makeBasalt(tiles);
      rockTiers.set(tiles, m);
    }
    return m;
  };
  const oxideMat = new THREE.MeshLambertMaterial({
    map: oxide,
    color: 0xffffff,
    emissive: 0x4a1808,
    emissiveIntensity: 0.14,
    toneMapped: false,
  });
  const coreMat = new THREE.MeshStandardMaterial({
    map: plate,
    color: 0x9aa8b8,
    roughness: 0.52,
    metalness: 0.48,
    emissive: 0x1a3048,
    emissiveIntensity: 0.32,
  });
  const ionMat = new THREE.MeshLambertMaterial({
    map: rune,
    color: 0xffffff,
    emissive: 0x2ee0c8,
    emissiveMap: rune,
    emissiveIntensity: 0.7,
  });
  const padMat = new THREE.MeshLambertMaterial({ color: 0x7ee8ff, emissive: 0x2ee0c8, emissiveIntensity: 0.72 });
  const waterMat = new THREE.MeshLambertMaterial({
    map: waterMap,
    color: 0xb8fff8,
    transparent: true,
    opacity: 0.62,
    emissive: 0x2ee8ff,
    emissiveMap: waterMap,
    emissiveIntensity: 0.85,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const glassMat = new THREE.MeshBasicMaterial({
    color: 0x9ad8ff,
    transparent: true,
    opacity: 0.11,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });
  mats.push(dustMat, craterMat, oxideMat, coreMat, ionMat, padMat, waterMat, glassMat);

  const pulse = (color: number) => {
    const m = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.22 });
    mats.push(m);
    return m;
  };

  const lights = createArenaLights(
    scene,
    {
      floor: dustMat,
      rune: pulse(0x7af0ff),
      console: pulse(0x6a90b0),
      ruin: pulse(0x8a8074),
      skull: pulse(0xc8c2b8),
      pad: padMat,
      ion: pulse(0x5aa8ff),
      ember: pulse(0xff7a32),
    },
    renderer,
    "moon",
  );

  const cells: Array<[number, number]> = [];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if (inDisk(i, j) && !(i === MID && j === MID)) cells.push([i, j]);
    }
  }

  const addWaterDisc = (x: number, y: number, z: number, radius: number, height: number) => {
    water.push({ x, y, z, radius, height });
    const geo = new THREE.CircleGeometry(radius, 28);
    geo.rotateX(-Math.PI / 2);
    geos.push(geo);
    const mesh = new THREE.Mesh(geo, waterMat);
    mesh.position.set(x, y + height * 0.92, z);
    mesh.renderOrder = 4;
    mesh.frustumCulled = false;
    group.add(mesh);
  };

  const addWall = (x: number, y: number, z: number, w: number, h: number, d: number, mat: THREE.Material, collide = true) => {
    addBox(batch, solids, mat, x, y, z, w, h, d, collide);
  };

  const holeHere = (floor: number, i: number, j: number) => isHole(floor, i, j) && !isSpawnCell(i, j);

  addBox(batch, solids, rockFor(40), 0, CISTERN_Y - 1.15, 0, 40, 1.12, 40);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    addWall(Math.cos(a) * 22.6, CISTERN_Y, Math.sin(a) * 22.6, 5.2, 3.2, 5.2, rockFor(8));
  }
  decks.push({ x: 0, y: CISTERN_Y + 0.04, z: 0, w: 36, d: 36 });
  addWaterDisc(0, CISTERN_Y + 0.06, 0, 12.4, 1.05);
  lights.addFill(group, 0, CISTERN_Y + 1.4, 0, 0x3cf0ff, 4.4, 22);
  lights.addFill(group, -8, CISTERN_Y + 1.8, 6, 0x7af0ff, 2.2, 14);
  lights.addFill(group, 8, CISTERN_Y + 1.8, -6, 0x5aa8ff, 2.2, 14);
  waypoints.push({ x: 0, y: CISTERN_Y + 1.2, z: 0 });
  waypoints.push({ x: 8, y: CISTERN_Y + 1.2, z: 0 });
  waypoints.push({ x: -8, y: CISTERN_Y + 1.2, z: 0 });
  stairRun(batch, solids, rockFor(8), decks, 0, 8.4, CISTERN_Y, 0, 13.2, FLOOR_Y[0], 2.6);

  for (let f = 0; f < FLOOR_Y.length; f++) {
    const y = FLOOR_Y[f]!;
    const walls = mazeWalls(f, cells);
    const rock = rockFor(CELL);
    const rim = rockFor(6);

    for (const [i, j] of cells) {
      if (holeHere(f, i, j)) continue;
      const x = cx(i);
      const z = cz(j);
      addBox(batch, solids, rock, x, y - THICK, z, CELL + 0.42, THICK, CELL + 0.42);
      decks.push({ x, y: y + 0.03, z, w: CELL + 0.2, d: CELL + 0.2 });
      waypoints.push({ x, y, z });
    }

    for (const [i, j] of cells) {
      const x = cx(i);
      const z = cz(j);
      const hole = holeHere(f, i, j);
      const eastOpen = !inDisk(i + 1, j);
      const southOpen = !inDisk(i, j + 1);
      const northOpen = !inDisk(i, j - 1);
      const westOpen = !inDisk(i - 1, j);
      if (!hole) {
        if (eastOpen) addWall(x + CELL * 0.5, y, z, WALL_T, FULL_H, CELL + 0.2, rim);
        if (westOpen) addWall(x - CELL * 0.5, y, z, WALL_T, FULL_H, CELL + 0.2, rim);
        if (southOpen) addWall(x, y, z + CELL * 0.5, CELL + 0.2, FULL_H, WALL_T, rim);
        if (northOpen) addWall(x, y, z - CELL * 0.5, CELL + 0.2, FULL_H, WALL_T, rim);
      }

      const eastHole = holeHere(f, i + 1, j) || !inDisk(i + 1, j);
      const southHole = holeHere(f, i, j + 1) || !inDisk(i, j + 1);
      if (hole || eastHole) {
        if (holeHere(f, i, j) && inDisk(i + 1, j) && !holeHere(f, i + 1, j)) {
          addWall(x + CELL * 0.42, y, z, 0.28, RAIL_H, CELL * 0.7, ionMat);
        }
      } else if (walls.has(`e:${i},${j}`)) {
        const half = (f + i + j) % 3 !== 0;
        addWall(x + CELL * 0.5, y, z, WALL_T, half ? HALF_H : FULL_H, CELL * 0.72, half ? oxideMat : rock);
      }
      if (hole || southHole) {
        if (holeHere(f, i, j) && inDisk(i, j + 1) && !holeHere(f, i, j + 1)) {
          addWall(x, y, z + CELL * 0.42, CELL * 0.7, RAIL_H, 0.28, ionMat);
        }
      } else if (walls.has(`s:${i},${j}`)) {
        const half = (f + i * 2 + j) % 3 !== 0;
        addWall(x, y, z + CELL * 0.5, CELL * 0.72, half ? HALF_H : FULL_H, WALL_T, half ? oxideMat : rock);
      }
    }

    addWall(CELL * 0.52, y, CELL * 0.52, 0.9, FULL_H, 0.9, coreMat);
    addWall(-CELL * 0.52, y, CELL * 0.52, 0.9, FULL_H, 0.9, coreMat);
    addWall(CELL * 0.52, y, -CELL * 0.52, 0.9, FULL_H, 0.9, coreMat);
    addWall(-CELL * 0.52, y, -CELL * 0.52, 0.9, FULL_H, 0.9, coreMat);
    addBox(batch, solids, ionMat, 0, y + 2.4, 0, 0.28, 4.6, 0.28, false);

    lights.addFill(group, 0, y + 3.2, 0, f % 2 ? 0x7af0ff : 0xb8e8ff, 2.6, 16);
    if (!isLoDevice()) {
      lights.addFill(group, 12, y + 2.6, -10, 0x5ee8ff, 1.7, 12);
      lights.addFill(group, -12, y + 2.6, 10, 0xffc070, 1.4, 11);
    }
  }

  addBox(batch, solids, rockFor(10), 0, -THICK, 0, CELL + 1.8, THICK, CELL + 1.8);
  decks.push({ x: 0, y: 0.04, z: 0, w: CELL + 1.4, d: CELL + 1.4 });
  addWaterDisc(0, 0.05, 0, 2.15, 0.48);
  waypoints.push({ x: 0, y: FLOOR_Y[0], z: 0 });

  stairRun(batch, solids, rockFor(8), decks, 8.6, 11.2, FLOOR_Y[0], 13.4, 11.2, FLOOR_Y[1], 2.5);
  stairRun(batch, solids, rockFor(8), decks, -11.2, 8.6, FLOOR_Y[1], -11.2, 13.4, FLOOR_Y[2], 2.5);
  stairRun(batch, solids, rockFor(8), decks, -8.6, -11.2, FLOOR_Y[2], -13.4, -11.2, FLOOR_Y[3], 2.5);
  waypoints.push({ x: 11, y: FLOOR_Y[0] + 3.2, z: 11.2 });
  waypoints.push({ x: -11.2, y: FLOOR_Y[1] + 3.2, z: 11 });
  waypoints.push({ x: -11, y: FLOOR_Y[2] + 3.2, z: -11.2 });
  waypoints.push({ x: 0, y: CISTERN_Y + 3.2, z: 10.8 });

  const poolCells: Array<[number, number]> = [
    [2, 6],
    [6, 2],
    [3, 3],
    [5, 5],
  ];
  for (const [i, j] of poolCells) {
    if (!inDisk(i, j) || holeHere(0, i, j)) continue;
    addWaterDisc(cx(i), 0.06, cz(j), 1.55, 0.42);
    if (!isLoDevice()) lights.addFill(group, cx(i), 0.7, cz(j), 0x3cf0ff, 1.8, 8);
  }

  const fallGeo = new THREE.CylinderGeometry(1.05, 1.22, 20.8, 18, 1, true);
  geos.push(fallGeo);
  const fall = new THREE.Mesh(fallGeo, waterMat);
  fall.position.set(0, 10.4, 0);
  fall.renderOrder = 5;
  fall.frustumCulled = false;
  group.add(fall);
  lights.addFill(group, 0, 8.4, 0, 0x7af0ff, 3.6, 18);
  lights.addFill(group, 0, 16.8, 0, 0xb8fff8, 2.8, 14);

  const yawTo = (x: number, z: number) => Math.atan2(-x, -z);
  const corner = (i: number, j: number, y: number, team?: Spawn["team"]) => {
    const x = cx(i);
    const z = cz(j);
    spawns.push({ x, y: y + 0.08, z, yaw: yawTo(x, z), team });
  };
  corner(1, 1, FLOOR_Y[0], "ion");
  corner(1, 7, FLOOR_Y[0], "ion");
  corner(2, MID, FLOOR_Y[1], "ion");
  corner(7, 7, FLOOR_Y[3], "ember");
  corner(7, 1, FLOOR_Y[3], "ember");
  corner(6, MID, FLOOR_Y[2], "ember");
  corner(1, 7, FLOOR_Y[2]);
  corner(7, 1, FLOOR_Y[1]);

  flags.push({ team: "ion", x: cx(2), y: FLOOR_Y[0] + 1.12, z: cz(2) });
  flags.push({ team: "ember", x: cx(6), y: FLOOR_Y[3] + 1.12, z: cz(6) });

  const drop = (id: string, kind: ItemPad["kind"], x: number, y: number, z: number, respawn = 16) =>
    items.push({ id, kind, x, y, z, respawn });
  drop("maze-health-0", "health", cx(3), FLOOR_Y[0], cz(5), 10);
  drop("maze-health-2", "health", cx(5), FLOOR_Y[2], cz(3), 10);
  drop("maze-mega", "mega", 0, CISTERN_Y + 1.2, 0, 28);
  drop("maze-armor", "armor", cx(6), FLOOR_Y[1], cz(2), 18);
  drop("maze-torpedo", "torpedo", cx(2), FLOOR_Y[3], cz(6), 18);
  drop("maze-lance", "lance", cx(7), FLOOR_Y[2], cz(3), 18);
  drop("maze-ion", "ion", cx(3), FLOOR_Y[1], cz(7), 20);
  drop("maze-scatter", "scatter", cx(5), FLOOR_Y[0], cz(1), 16);
  drop("maze-fauces", "fauces", cx(6), FLOOR_Y[1], cz(5), 22);
  drop("maze-bate", "bate", cx(4), FLOOR_Y[0], cz(4), 18);
  drop("maze-martillo", "martillo", cx(2), FLOOR_Y[2], cz(6), 24);
  drop("maze-rush", "rush", cx(1), FLOOR_Y[2], cz(3), 22);
  drop("maze-blink", "blink", cx(6), FLOOR_Y[3], cz(4), 22);

  const padAt = (x: number, y: number, z: number, vx: number, vy: number, vz: number) => {
    pads.push({ aabb: boxAt(x, y + 0.12, z, 2.1, 1.05, 2.1), vx, vy, vz });
  };
  for (const [i, j] of SHAFTS) {
    const x = cx(i);
    const z = cz(j);
    const inwardX = -Math.sign(x) * 3.6;
    const inwardZ = -Math.sign(z) * 3.6;
    padAt(x + Math.sign(x || 1) * 2.4, FLOOR_Y[0], z + Math.sign(z || 1) * 0.2, inwardX * 0.15, 9.6, inwardZ * 0.15);
    padAt(x * 0.55, CISTERN_Y + 1.22, z * 0.55, Math.sign(x || 1) * 3.2, 10.4, Math.sign(z || 1) * 3.2);
    waypoints.push({ x: x + Math.sign(x || 1) * 2.6, y: FLOOR_Y[0], z });
    waypoints.push({ x: x * 0.55, y: CISTERN_Y + 1.2, z: z * 0.55 });
  }
  padAt(cx(2), FLOOR_Y[0], cz(MID), 0, 9.4, 0);
  padAt(cx(6), FLOOR_Y[0], cz(MID), 0, 9.4, 0);
  padAt(cx(MID), FLOOR_Y[2], cz(2), 0, 8.8, 0);
  const padSpots = pads.map((p) => ({
    x: (p.aabb.minX + p.aabb.maxX) / 2,
    y: p.aabb.minY + 0.14,
    z: (p.aabb.minZ + p.aabb.maxZ) / 2,
  }));
  geos.push(instanceCylinders(group, padMat, padSpots, 1.05, 1.15, 0.16).geo);
  stampJumpPads(
    group,
    mats,
    geos,
    padSpots.map((p) => ({ ...p, y: p.y + 0.1 })),
    1.08,
  );

  teleports.push({
    aabb: boxAt(cx(1), FLOOR_Y[0] + 0.9, cz(1), 1.6, 1.4, 1.6),
    target: { x: cx(7), y: FLOOR_Y[3] + 0.08, z: cz(7), yaw: Math.PI },
  });
  teleports.push({
    aabb: boxAt(cx(7), FLOOR_Y[3] + 0.9, cz(7), 1.6, 1.4, 1.6),
    target: { x: cx(1), y: FLOOR_Y[0] + 0.08, z: cz(1), yaw: 0 },
  });
  teleports.push({
    aabb: boxAt(cx(1), FLOOR_Y[2] + 0.9, cz(7), 1.6, 1.4, 1.6),
    target: { x: cx(7), y: FLOOR_Y[1] + 0.08, z: cz(1), yaw: Math.PI },
  });
  teleports.push({
    aabb: boxAt(cx(7), FLOOR_Y[1] + 0.9, cz(1), 1.6, 1.4, 1.6),
    target: { x: cx(1), y: FLOOR_Y[2] + 0.08, z: cz(7), yaw: 0 },
  });
  const portalDiscs = stampPortals(
    group,
    mats,
    geos,
    [
      { x: cx(1), y: FLOOR_Y[0] + 1.15, z: cz(1) },
      { x: cx(7), y: FLOOR_Y[3] + 1.15, z: cz(7) },
      { x: cx(1), y: FLOOR_Y[2] + 1.15, z: cz(7) },
      { x: cx(7), y: FLOOR_Y[1] + 1.15, z: cz(1) },
    ],
    0.82,
  );

  const moonTex = loadTex("/textures/moon/piso-luna.webp", 2.4, 1.6);
  const shellGeo = new THREE.SphereGeometry(MOON_R, 48, 32);
  const shellMat = new THREE.MeshLambertMaterial({
    map: moonTex,
    color: 0xc8c0b4,
    emissive: 0x1a1814,
    emissiveIntensity: 0.12,
    side: THREE.BackSide,
    toneMapped: false,
  });
  mats.push(shellMat);
  geos.push(shellGeo);
  const shell = new THREE.Mesh(shellGeo, shellMat);
  shell.position.set(0, MOON_CY, 0);
  shell.frustumCulled = false;
  group.add(shell);

  const glassGeo = new THREE.SphereGeometry(MOON_R - 0.85, 32, 24);
  geos.push(glassGeo);
  const glass = new THREE.Mesh(glassGeo, glassMat);
  glass.position.set(0, MOON_CY, 0);
  glass.frustumCulled = false;
  glass.renderOrder = 3;
  group.add(glass);

  const skyTex = loadSpaceSky("luna");
  const skyGeo = skySphereGeo();
  const skyMat = new THREE.MeshBasicMaterial({
    map: skyTex,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
    toneMapped: false,
  });
  mats.push(skyMat);
  geos.push(skyGeo);
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -20;
  scene.add(sky);

  geos.push(stampDecks(group, dustMat, decks, 3.4).geo);
  geos.push(stampDecks(group, craterMat, [{ x: 0, y: CISTERN_Y + 0.06, z: 0, w: 18, d: 18 }], 3.1).geo);
  batch.build(group);
  scene.add(group);

  return {
    group,
    solids,
    pads,
    teleports,
    items,
    spawns,
    waypoints,
    flags,
    water,
    gravity: MAZE_G,
    killY: -18,
    lights,
    update: (now) => {
      waterMap.offset.x = (now * 0.035) % 1;
      waterMap.offset.y = (now * 0.022) % 1;
      const pulseAmt = 0.94 + Math.sin(now * 1.7) * 0.06;
      fall.scale.set(pulseAmt, 1, pulseAmt);
      for (let i = 0; i < portalDiscs.length; i++) {
        portalDiscs[i]!.rotation.z = now * (i % 2 ? 0.4 : -0.4);
      }
    },
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

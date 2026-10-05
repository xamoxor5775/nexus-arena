import * as THREE from "three";
import { ROUND_SECONDS } from "./constants";
import { boxAt } from "./collision";
import type { AABB, ItemPad, JumpPad, Spawn, TeleportGate } from "./types";
import { createArenaLights } from "./lighting";
import { BoxBatch, instanceCones, instanceCylinders, stampDecks } from "./instancing";
import { isLoDevice, loadArenaSurface, loadSkyTex, loadSummitTex, loadTex, portalTex, skySphereGeo } from "./textures";
import { stampJumpPads, type ArenaData } from "./arena";

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

/**
 * Cuerpo de roca + cubierta de musgo en un plano aparte.
 * BatchedMesh escala un cubo unitario y deja las UV en 0–1: el césped en esa tapa
 * se estiraba en islas rectangulares y se manchaba en los cantos de 16 cm.
 */
function slab(
  batch: BoxBatch,
  solids: AABB[],
  rockFor: (size: number) => THREE.Material,
  decks: Array<{ x: number; y: number; z: number; w: number; d: number }>,
  x: number,
  top: number,
  z: number,
  w: number,
  d: number,
) {
  const thick = 1.15;
  const size = (w + d) / 2;
  solids.push(boxAt(x, top - thick, z, w, thick, d));
  addBox(batch, solids, rockFor(size), x, top - thick, z, w, thick - 0.08, d, false);
  decks.push({ x, y: top + 0.02, z, w, d });
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
  const n = Math.max(1, Math.ceil(rise / 0.42));
  const h = rise / n;
  const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
  const span = Math.hypot(x1 - x0, z1 - z0) / n + 0.32;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const top = y0 + (i + 1) * h;
    const x = x0 + (x1 - x0) * t;
    const z = z0 + (z1 - z0) * t;
    const w = alongX ? span : width;
    const d = alongX ? width : span;
    addBox(batch, solids, mat, x, top - h, z, w, h, d);
    decks.push({ x, y: top + 0.02, z, w, d });
  }
}

export function buildSummit(scene: THREE.Scene, renderer?: THREE.WebGLRenderer): ArenaData {
  const group = new THREE.Group();
  const solids: AABB[] = [];
  const pads: JumpPad[] = [];
  const teleports: TeleportGate[] = [];
  const items: ItemPad[] = [];
  const spawns: Spawn[] = [];
  const waypoints: { x: number; y: number; z: number }[] = [];
  const mats: THREE.Material[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const batch = new BoxBatch();

  const barkTex = loadSummitTex("red-bark", 2.2, 3.6);
  const canopyTex = loadSummitTex("red-canopy", 3.6, 3.6);
  const makeRock = (tiles: number) => {
    const m = new THREE.MeshStandardMaterial({
      map: loadTex("/textures/summit-basalt-moss.jpg", tiles, Math.max(1, Math.round(tiles * 0.45))),
      color: 0xffffff,
      roughness: 0.92,
      metalness: 0.04,
    });
    mats.push(m);
    return m;
  };
  const rockTiers = new Map<number, THREE.Material>();
  // Un material por tramo de tamaño: BatchedMesh deja las UV en 0–1 por cara.
  const rockFor = (size: number) => {
    const tiles = Math.max(1, Math.round(size / 2.6));
    let m = rockTiers.get(tiles);
    if (!m) {
      m = makeRock(tiles);
      rockTiers.set(tiles, m);
    }
    return m;
  };
  const grassMat = new THREE.MeshLambertMaterial({
    map: loadArenaSurface("cumbre"),
    color: 0xffffff,
    emissive: 0x1e3a12,
    emissiveIntensity: 0.12,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  mats.push(grassMat);
  const decks: Array<{ x: number; y: number; z: number; w: number; d: number }> = [];
  const rock = makeRock(3);
  const trunkMat = new THREE.MeshLambertMaterial({
    map: barkTex,
    color: 0xffffff,
    emissive: 0x4a0810,
    emissiveMap: barkTex,
    emissiveIntensity: 0.2,
    toneMapped: false,
  });
  const leafMat = new THREE.MeshLambertMaterial({
    map: canopyTex,
    color: 0xffffff,
    emissive: 0x5a0814,
    emissiveMap: canopyTex,
    emissiveIntensity: 0.26,
    toneMapped: false,
  });
  const leafTipMat = new THREE.MeshLambertMaterial({
    map: canopyTex,
    color: 0xffd4da,
    emissive: 0x8a1428,
    emissiveMap: canopyTex,
    emissiveIntensity: 0.38,
    toneMapped: false,
  });
  const padMat = new THREE.MeshLambertMaterial({
    color: 0x7ee8ff,
    emissive: 0x2ee0c8,
    emissiveIntensity: 0.7,
  });
  const gateMat = new THREE.MeshBasicMaterial({ color: 0xb07cff, transparent: true, opacity: 0.9, toneMapped: false });
  const gateBaseMat = new THREE.MeshLambertMaterial({ color: 0x2a1848, emissive: 0x7a3cff, emissiveIntensity: 0.72 });
  const portalMap = portalTex();
  const gateCoreMat = new THREE.MeshBasicMaterial({
    map: portalMap,
    color: 0xffffff,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });
  const gatePillarMat = new THREE.MeshLambertMaterial({ color: 0x234e42, emissive: 0x2bbf72, emissiveIntensity: 0.9 });
  const treeCoreMat = new THREE.MeshBasicMaterial({ color: 0xffc0c8, transparent: true, opacity: 0.94, toneMapped: false });
  mats.push(trunkMat, leafMat, leafTipMat, padMat, gateMat, gateBaseMat, gateCoreMat, gatePillarMat, treeCoreMat);

  const pulse = (color: number) => {
    const m = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.2 });
    mats.push(m);
    return m;
  };

  const lights = createArenaLights(
    scene,
    {
      floor: pulse(0x8aa0b4),
      rune: pulse(0x2ee0c8),
      console: pulse(0x6a90b0),
      ruin: pulse(0x8a8074),
      skull: pulse(0xc8c2b8),
      pad: padMat,
      ion: pulse(0x5aa8ff),
      ember: pulse(0xff7a32),
    },
    renderer,
    "summit-cycle",
  );

  slab(batch, solids, rockFor, decks, 0, 0, 0, 20, 20);
  slab(batch, solids, rockFor, decks, 0, 4.4, 0, 11, 11);
  slab(batch, solids, rockFor, decks, 0, 8, 0, 6.4, 6.4);
  slab(batch, solids, rockFor, decks, 0, 11.2, 0, 3.8, 3.8);

  stairRun(batch, solids, rock, decks, 8.2, 6.2, 0, 4.4, 4.6, 4.4, 2.4);
  stairRun(batch, solids, rock, decks, -3.6, -4.6, 4.4, -3.6, -2.2, 8, 2.2);
  stairRun(batch, solids, rock, decks, 1.4, 2.2, 8, 1.4, 1.1, 11.2, 2);

  slab(batch, solids, rockFor, decks, -16, 2.2, -13, 7.2, 6);
  stairRun(batch, solids, rock, decks, -8.2, -7.4, 0, -13.4, -11.6, 2.2, 2.2);

  slab(batch, solids, rockFor, decks, 12, 3.4, -14, 6.4, 5.6);
  slab(batch, solids, rockFor, decks, -12, 5.2, 12, 6.4, 6.2);
  stairRun(batch, solids, rock, decks, -4.2, 4.2, 4.4, -10, 10.2, 5.2, 2.2);
  slab(batch, solids, rockFor, decks, 0, 6.2, 14, 6, 5.2);
  slab(batch, solids, rockFor, decks, -16, 1.6, 4, 5.2, 5);

  // Archipiélago aéreo: plataformas más amplias para combatir y aterrizar sin caídas injustas.
  slab(batch, solids, rockFor, decks, 25, 8, -18, 9.2, 8.2);
  slab(batch, solids, rockFor, decks, 27, 11.2, 7, 8.8, 8);
  slab(batch, solids, rockFor, decks, 9, 14.2, 25, 9, 8.2);
  slab(batch, solids, rockFor, decks, -15, 12.2, 25, 8.8, 8);
  slab(batch, solids, rockFor, decks, -29, 9.2, 4, 9, 8.2);
  slab(batch, solids, rockFor, decks, -24, 13.4, -21, 8.8, 8);

  const isle = (x: number, top: number, z: number, w: number, d: number) => {
    slab(batch, solids, rockFor, decks, x, top, z, w, d);
    slab(batch, solids, rockFor, decks, x + w * 0.38, top, z + d * 0.22, w * 0.52, d * 0.58);
    slab(batch, solids, rockFor, decks, x - w * 0.3, top, z - d * 0.32, w * 0.46, d * 0.5);
    addBox(batch, solids, rockFor((w + d) / 2), x, top - 1.45, z, w + 1.6, 0.5, d + 1.6, false);
  };
  isle(18, 6.8, -2, 8.2, 6.6);
  isle(6, 7.2, -26, 7.6, 6.4);
  isle(-6, 10.4, -26, 7.2, 6.2);
  isle(18, 5.2, 16, 7.6, 6.4);
  isle(-36, 7.4, -12, 7.2, 6.2);
  isle(0, 9.8, 34, 8.4, 6.6);

  const mark = (x: number, y: number, z: number) => waypoints.push({ x, y, z });
  mark(0, 0, 0);
  mark(7, 0, 6);
  mark(-7, 0, 6);
  mark(6, 0, -6);
  mark(-7, 0, -6);
  mark(6.2, 2.2, 5.4);
  mark(0, 4.4, 0);
  mark(-3.6, 6.2, -3.4);
  mark(0, 8, 0);
  mark(1.4, 9.6, 1.6);
  mark(0, 11.2, 0);
  mark(-16, 2.2, -13);
  mark(12, 3.4, -14);
  mark(-12, 5.2, 12);
  mark(0, 6.2, 14);
  mark(-16, 1.6, 4);
  mark(25, 8, -18);
  mark(27, 11.2, 7);
  mark(9, 14.2, 25);
  mark(-15, 12.2, 25);
  mark(-29, 9.2, 4);
  mark(-24, 13.4, -21);
  mark(18, 6.8, -2);
  mark(6, 7.2, -26);
  mark(-6, 10.4, -26);
  mark(18, 5.2, 16);
  mark(-36, 7.4, -12);
  mark(0, 9.8, 34);

  const launch = (x: number, y: number, z: number, vx: number, vy: number, vz: number) => {
    pads.push({ aabb: boxAt(x, y - 0.05, z, 2.2, 1.15, 2.2), vx, vy, vz });
  };
  launch(5.6, 0, -5.6, 7.2, 16, -9.2);
  launch(12, 3.4, -14, -6.4, 13, 6.6);
  launch(-7.2, 0, 2.2, -9.4, 14, 2.1);
  launch(-16, 1.6, 4, 8.2, 12, -1.6);
  launch(0, 8, 2.2, 0, 8, 14);
  launch(0, 6.2, 14, 0, 12, -11);
  lights.addPad(group, 5.6, -5.6, 0.7);
  lights.addPad(group, 12, -14, 4.1);
  lights.addPad(group, 0, 2.2, 8.7);
  lights.addPad(group, 0, 14, 6.9);

  const padSpots = pads.map((p) => ({
    x: (p.aabb.minX + p.aabb.maxX) / 2,
    y: p.aabb.minY + 0.14,
    z: (p.aabb.minZ + p.aabb.maxZ) / 2,
  }));
  const padMesh = instanceCylinders(group, padMat, padSpots, 1.05, 1.15, 0.16);
  geos.push(padMesh.geo);
  stampJumpPads(group, mats, geos, padSpots.map((p) => ({ ...p, y: p.y + 0.1 })), 1.08);

  const buttonMat = new THREE.MeshLambertMaterial({
    color: 0xd8ff9a,
    emissive: 0x4dff93,
    emissiveIntensity: 1.15,
  });
  mats.push(buttonMat);
  const buttonSpots: Array<{ x: number; y: number; z: number }> = [];
  const press = (x: number, top: number, z: number, vx: number, vy: number, vz: number) => {
    pads.push({ aabb: boxAt(x, top - 0.02, z, 1.7, 0.9, 1.7), vx, vy, vz, chute: true });
    buttonSpots.push({ x, y: top + 0.05, z });
  };
  press(6.4, 0, 6.4, 14, 28, -4);
  press(-5.5, 0, -7.5, -2, 28, -16);
  press(-8.2, 0, 1.6, -16, 28, 2);
  press(18, 6.8, -2, -2, 26, 16);
  press(6, 7.2, -26, -8, 26, 12);
  press(0, 9.8, 34, -8, 24, -14);
  const buttonMesh = instanceCylinders(group, buttonMat, buttonSpots, 0.72, 0.86, 0.1, 14);
  geos.push(buttonMesh.geo);
  stampJumpPads(group, mats, geos, buttonSpots.map((p) => ({ ...p, y: p.y + 0.08 })), 0.78);

  const gateRingGeo = new THREE.TorusGeometry(0.92, 0.1, 10, 28);
  const gateArchGeo = new THREE.TorusGeometry(0.73, 0.025, 6, 24);
  const gateBaseGeo = new THREE.CylinderGeometry(0.94, 1.12, 0.18, 16);
  const gateCoreGeo = new THREE.CircleGeometry(0.7, 28);
  const gatePillarGeo = new THREE.CylinderGeometry(0.08, 0.13, 0.92, 8);
  geos.push(gateRingGeo, gateArchGeo, gateBaseGeo, gateCoreGeo, gatePillarGeo);
  const gateRings: THREE.Mesh[] = [];
  const gateCores: THREE.Mesh[] = [];
  const gate = (
    x: number, top: number, z: number,
    targetX: number, targetY: number, targetZ: number,
  ) => {
    teleports.push({
      aabb: boxAt(x, top + 0.55, z, 1.65, 1.3, 1.65),
      target: { x: targetX, y: targetY + 0.04, z: targetZ },
    });
    const base = new THREE.Mesh(gateBaseGeo, gateBaseMat);
    base.position.set(x, top + 0.09, z);
    const ring = new THREE.Mesh(gateRingGeo, gateMat);
    ring.position.set(x, top + 1.04, z);
    const archA = new THREE.Mesh(gateArchGeo, gateMat);
    archA.position.set(x, top + 1.04, z + 0.015);
    archA.rotation.y = 0.42;
    const archB = new THREE.Mesh(gateArchGeo, gateMat);
    archB.position.set(x, top + 1.04, z - 0.015);
    archB.rotation.y = -0.42;
    const core = new THREE.Mesh(gateCoreGeo, gateCoreMat);
    core.position.set(x, top + 1.04, z - 0.035);
    for (const dx of [-0.76, 0.76]) {
      const pylon = new THREE.Mesh(gatePillarGeo, gatePillarMat);
      pylon.position.set(x + dx, top + 0.46, z);
      group.add(pylon);
    }
    group.add(base, ring, archA, archB, core);
    gateRings.push(archA, archB);
    gateCores.push(core);
  };
  // Enlaces dobles: la salida cae siempre fuera de otra puerta, evitando teletransportes en bucle.
  gate(7.2, 0, -7.2, 25, 8, -19.6);
  gate(23.2, 8, -18, 4.8, 0, -6.4);
  gate(28.8, 11.2, 8.8, 9, 14.2, 26.8);
  gate(9, 14.2, 23.2, 27.2, 11.2, 5.2);
  gate(-30.8, 9.2, 2.2, -24, 13.4, -20.1);
  gate(-24, 13.4, -19.2, -29, 9.2, 5.9);

  const trunks: Array<{ x: number; y: number; z: number }> = [];
  const lowerCrowns: Array<{ x: number; y: number; z: number }> = [];
  const middleCrowns: Array<{ x: number; y: number; z: number }> = [];
  const upperCrowns: Array<{ x: number; y: number; z: number }> = [];
  const crownTips: Array<{ x: number; y: number; z: number }> = [];
  const crownBranches: Array<{ x: number; y: number; z: number }> = [];
  const treeCores: Array<{ x: number; y: number; z: number }> = [];
  const treeLights: Array<{ x: number; y: number; z: number }> = [];
  const treeHalos: THREE.Mesh[] = [];
  const plant = (x: number, z: number, walk: number) => {
    const h = 1.85;
    trunks.push({ x, y: walk + h / 2, z });
    lowerCrowns.push({ x, y: walk + h + 0.58, z });
    middleCrowns.push({ x, y: walk + h + 1.34, z });
    upperCrowns.push({ x, y: walk + h + 2.02, z });
    crownTips.push({ x, y: walk + h + 2.78, z });
    for (const [dx, dz] of [[0.72, 0.18], [-0.62, 0.42], [0.18, -0.74]] as const) {
      crownBranches.push({ x: x + dx, y: walk + h + 1.42, z: z + dz });
    }
    treeCores.push({ x, y: walk + h + 0.82, z });
    treeLights.push({ x, y: walk + h + 1.1, z });
    solids.push(boxAt(x, walk, z, 0.52, h, 0.52));
  };
  plant(-6.2, 3.4, 0);
  plant(4.8, -3.2, 0);
  plant(-2.4, -6.6, 0);
  const trunkMesh = instanceCylinders(group, trunkMat, trunks, 0.18, 0.28, 1.85, 18);
  const lowerCrownMesh = instanceCones(group, leafMat, lowerCrowns, 1.34, 1.7, 14);
  const middleCrownMesh = instanceCones(group, leafMat, middleCrowns, 1.08, 1.58, 14);
  const upperCrownMesh = instanceCones(group, leafTipMat, upperCrowns, 0.78, 1.42, 12);
  const tipMesh = instanceCones(group, leafTipMat, crownTips, 0.46, 1.3, 12);
  const branchMesh = instanceCones(group, leafTipMat, crownBranches, 0.36, 0.92, 10);
  const coreMesh = instanceCylinders(group, treeCoreMat, treeCores, 0.09, 0.16, 1.2);
  const treeHaloGeo = new THREE.TorusGeometry(0.68, 0.025, 6, 16);
  geos.push(trunkMesh.geo, lowerCrownMesh.geo, middleCrownMesh.geo, upperCrownMesh.geo, tipMesh.geo, branchMesh.geo, coreMesh.geo, treeHaloGeo);
  for (const tree of treeCores) {
    const halo = new THREE.Mesh(treeHaloGeo, leafTipMat);
    halo.position.set(tree.x, tree.y - 0.78, tree.z);
    halo.rotation.x = Math.PI / 2;
    group.add(halo);
    treeHalos.push(halo);
  }
  // Los árboles se iluminan con puntuales sin sombra. En móvil bajan a dos: cada puntual
  // encarece el fragment shader de toda la escena.
  const every = isLoDevice() ? 5 : 3;
  for (const light of treeLights.filter((_, i) => i % every === 0)) {
    lights.addFill(group, light.x, light.y, light.z, 0xff2745, 2.8, 10);
    lights.addGlint(group, light.x, light.y + 1.25, light.z);
  }

  const drop = (id: string, kind: ItemPad["kind"], x: number, y: number, z: number, respawn = 12) => {
    items.push({ id, kind, x, y, z, respawn });
  };
  drop("c-health-a", "health", -6, 0, -2);
  drop("c-health-b", "health", -12, 5.2, 13, 12);
  drop("c-health-c", "health", 0, 9.8, 34, 12);
  drop("c-mega", "mega", 0, 11.2, 0, 28);
  drop("c-armor", "armor", 12, 3.4, -14, 18);
  drop("c-ammo", "ammo", -16, 2.2, -14, 10);
  drop("c-scatter", "scatter", 3.2, 4.4, -2.4, 16);
  drop("c-torpedo", "torpedo", -12, 5.2, 11, 18);
  drop("c-lance", "lance", 0, 6.2, 14, 18);
  drop("c-ion", "ion", -16, 1.6, 5.2, 20);
  drop("c-fauces", "fauces", 8, 4.4, 6, 22);
  drop("c-bate", "bate", -8, 0, 8, 18);
  drop("c-martillo", "martillo", 14, 6.2, -6, 24);
  drop("c-rush", "rush", 2.2, 8, -1.2, 22);
  drop("c-blink", "blink", 12, 3.4, -12.4, 22);
  drop("c-volt", "volt", -2.2, 4.4, 2.6, 22);
  drop("c-leap", "leap", 18, 6.2, 8, 24);
  drop("c-air-armor", "armor", 25, 8, -18, 20);
  drop("c-air-ion", "ion", 27, 11.2, 7, 22);
  drop("c-air-lance", "lance", -15, 12.2, 25, 22);
  drop("c-air-rush", "rush", -29, 9.2, 4, 24);
  drop("c-air-blink", "blink", -24, 13.4, -21, 26);

  const yawTo = (x: number, z: number) => Math.atan2(-x, -z);
  const spawnAt = (x: number, y: number, z: number) => spawns.push({ x, y, z, yaw: yawTo(x, z) });
  spawnAt(8, 0, 8);
  spawnAt(-8, 0, 8);
  spawnAt(8, 0, -2);
  spawnAt(-6, 0, -6);
  spawnAt(2.4, 4.4, -2.4);
  spawnAt(-16, 2.2, -14.4);
  spawnAt(12, 3.4, -12.6);
  spawnAt(-12, 5.2, 10.6);
  spawnAt(25, 8, -19.8);
  spawnAt(9, 14.2, 23.4);
  spawnAt(18, 6.8, 0.4);
  spawnAt(0, 9.8, 32.2);

  const skyPaths = [
    "/textures/space/cumbre-cycle-start-v1.webp",
    "/textures/space/cumbre-cycle-end-v1.webp",
  ];
  const skyTextures = skyPaths.map((path) => loadSkyTex(path, false));
  const skyGeo = skySphereGeo();
  const skyMaterials = skyTextures.map((map, index) => new THREE.MeshBasicMaterial({
    map,
    side: THREE.BackSide,
    fog: false,
    transparent: true,
    opacity: index === 0 ? 1 : 0,
    depthWrite: false,
    toneMapped: false,
  }));
  const skyLayers = skyMaterials.map((material, index) => {
    const mesh = new THREE.Mesh(skyGeo, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = -20 + index;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.visible = index === 0;
    scene.add(mesh);
    return mesh;
  });
  mats.push(...skyMaterials);
  geos.push(skyGeo);

  const skyLo = isLoDevice();
  let cycleStartedAt: number | null = null;
  const startCycle = (epochMs: number) => {
    const elapsed = Math.max(0, (Date.now() - epochMs) / 1000);
    cycleStartedAt = performance.now() / 1000 - elapsed;
  };
  const updateSky = (now: number) => {
    const elapsed = cycleStartedAt === null ? 0 : Math.max(0, now - cycleStartedAt);
    const progress = Math.min(1, elapsed / ROUND_SECONDS);
    let base = 0;
    let overlay = 0;
    let blend = 0;
    if (progress >= 0.4 && progress < 0.62) {
      overlay = 1;
      blend = THREE.MathUtils.smoothstep(progress, 0.4, 0.62);
    } else if (progress >= 0.62) {
      base = overlay = 1;
    }
    if (skyLo && overlay !== base) {
      if (blend >= 0.5) base = overlay;
      overlay = base;
      blend = 0;
    }
    for (let i = 0; i < skyLayers.length; i++) {
      const isBase = i === base;
      const isOverlay = i === overlay && overlay !== base;
      skyLayers[i]!.visible = isBase || isOverlay;
      skyMaterials[i]!.opacity = isBase ? 1 : isOverlay ? blend : 0;
    }
    lights.setTimeOfDay(progress);
  };

  geos.push(stampDecks(group, grassMat, decks, 2.4).geo);
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
    lights,
    update: (now) => {
      leafMat.emissiveIntensity = 0.24 + Math.sin(now * 1.6) * 0.05;
      leafTipMat.emissiveIntensity = 0.36 + Math.sin(now * 2.2 + 0.8) * 0.07;
      treeCoreMat.opacity = 0.86 + Math.sin(now * 2.6) * 0.08;
      for (let i = 0; i < gateRings.length; i++) gateRings[i]!.rotation.z = now * (i % 2 ? -0.45 : 0.45);
      for (let i = 0; i < gateCores.length; i++) {
        gateCores[i]!.rotation.z = now * (i % 2 ? 0.35 : -0.35);
        gateCores[i]!.scale.setScalar(0.94 + Math.sin(now * 2.1 + i) * 0.06);
      }
      for (let i = 0; i < treeHalos.length; i++) treeHalos[i]!.rotation.z = now * 0.42 + i;
      updateSky(now);
    },
    startCycle,
    dispose: () => {
      scene.remove(group);
      for (const layer of skyLayers) scene.remove(layer);
      lights.dispose();
      batch.dispose();
      group.traverse((obj) => {
        if (obj instanceof THREE.BatchedMesh || obj instanceof THREE.InstancedMesh) obj.dispose();
      });
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      for (let i = 0; i < skyTextures.length; i++) {
        skyTextures[i]!.dispose();
        THREE.Cache.remove(skyPaths[i]!);
      }
    },
  };
}

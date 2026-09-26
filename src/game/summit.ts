import * as THREE from "three";
import { boxAt } from "./collision";
import type { AABB, ItemPad, JumpPad, Spawn, TeleportGate } from "./types";
import { createArenaLights } from "./lighting";
import { BoxBatch, instanceCones, instanceCylinders } from "./instancing";
import { loadSkyTex, loadTex } from "./textures";
import type { ArenaData } from "./arena";

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
 * El musgo es la tapa de la isla: la superficie de caminado queda exactamente en `top`.
 * `rockFor`/`grassFor` eligen el material según el ancho porque BatchedMesh normaliza las UV
 * por cara: sin eso, una isla de 20 m y una de 4 m mostrarían la piedra al mismo tamaño.
 */
function slab(
  batch: BoxBatch,
  solids: AABB[],
  rockFor: (size: number) => THREE.Material,
  grassFor: (size: number) => THREE.Material,
  x: number,
  top: number,
  z: number,
  w: number,
  d: number,
) {
  const thick = 1.15;
  const cap = 0.16;
  const size = (w + d) / 2;
  solids.push(boxAt(x, top - thick, z, w, thick, d));
  addBox(batch, solids, rockFor(size), x, top - thick, z, w, thick - cap, d, false);
  addBox(batch, solids, grassFor(size), x, top - cap, z, w, cap, d, false);
}

function stairRun(
  batch: BoxBatch,
  solids: AABB[],
  mat: THREE.Material,
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
    addBox(
      batch,
      solids,
      mat,
      x0 + (x1 - x0) * t,
      top - h,
      z0 + (z1 - z0) * t,
      alongX ? span : width,
      h,
      alongX ? width : span,
    );
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

  const barkTex = loadTex("/textures/summit-bark.jpg", 1.4, 2.8);
  const canopyTex = loadTex("/textures/summit-canopy.jpg", 2.2, 2.2);
  const makeRock = (tiles: number) => {
    const m = new THREE.MeshStandardMaterial({
      map: loadTex("/textures/summit-basalt-moss.jpg", tiles, Math.max(1, Math.round(tiles * 0.45))),
      color: 0xd8dce0,
      roughness: 0.92,
      metalness: 0.04,
    });
    mats.push(m);
    return m;
  };
  const makeGrass = (tiles: number) => {
    const m = new THREE.MeshLambertMaterial({
      map: loadTex("/textures/summit-moss-ground.jpg", tiles, tiles),
      color: 0xe6eed8,
    });
    mats.push(m);
    return m;
  };
  const rockTiers = new Map<number, THREE.Material>();
  const grassTiers = new Map<number, THREE.Material>();
  // Un material por tramo de tamaño: la piedra mide ~2.6 m por baldosa y el musgo ~2 m.
  const rockFor = (size: number) => {
    const tiles = Math.max(1, Math.round(size / 2.6));
    let m = rockTiers.get(tiles);
    if (!m) {
      m = makeRock(tiles);
      rockTiers.set(tiles, m);
    }
    return m;
  };
  const grassFor = (size: number) => {
    const tiles = Math.max(2, Math.round(size / 2));
    let m = grassTiers.get(tiles);
    if (!m) {
      m = makeGrass(tiles);
      grassTiers.set(tiles, m);
    }
    return m;
  };
  const rock = makeRock(3);
  const trunkMat = new THREE.MeshLambertMaterial({
    map: barkTex,
    color: 0xc4a078,
  });
  const leafMat = new THREE.MeshStandardMaterial({
    map: canopyTex,
    color: 0xff6478,
    emissive: 0x8f1128,
    emissiveMap: canopyTex,
    emissiveIntensity: 0.82,
    roughness: 0.28,
    metalness: 0.32,
    envMapIntensity: 0.5,
  });
  const leafTipMat = new THREE.MeshStandardMaterial({
    map: canopyTex,
    color: 0xffb7c2,
    emissive: 0xe83052,
    emissiveMap: canopyTex,
    emissiveIntensity: 1.08,
    roughness: 0.2,
    metalness: 0.46,
    envMapIntensity: 0.7,
  });
  const padMat = new THREE.MeshLambertMaterial({
    color: 0x7ee8ff,
    emissive: 0x2ee0c8,
    emissiveIntensity: 0.7,
  });
  const gateMat = new THREE.MeshBasicMaterial({ color: 0x9aff72, transparent: true, opacity: 0.9, toneMapped: false });
  const gateBaseMat = new THREE.MeshLambertMaterial({ color: 0x183d2d, emissive: 0x4dff93, emissiveIntensity: 0.72 });
  const gateCoreMat = new THREE.MeshBasicMaterial({
    color: 0xb9ff9b,
    transparent: true,
    opacity: 0.34,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
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
    "summit",
  );

  slab(batch, solids, rockFor, grassFor, 0, 0, 0, 20, 20);
  slab(batch, solids, rockFor, grassFor, 0, 4.4, 0, 11, 11);
  slab(batch, solids, rockFor, grassFor, 0, 8, 0, 6.4, 6.4);
  slab(batch, solids, rockFor, grassFor, 0, 11.2, 0, 3.8, 3.8);

  stairRun(batch, solids, rock, 8.2, 6.2, 0, 4.4, 4.6, 4.4, 2.4);
  stairRun(batch, solids, rock, -3.6, -4.6, 4.4, -3.6, -2.2, 8, 2.2);
  stairRun(batch, solids, rock, 1.4, 2.2, 8, 1.4, 1.1, 11.2, 2);

  slab(batch, solids, rockFor, grassFor, -16, 2.2, -13, 7.2, 6);
  stairRun(batch, solids, rock, -8.2, -7.4, 0, -13.4, -11.6, 2.2, 2.2);

  slab(batch, solids, rockFor, grassFor, 12, 3.4, -14, 6.4, 5.6);
  slab(batch, solids, rockFor, grassFor, -12, 5.2, 12, 6.4, 6.2);
  stairRun(batch, solids, rock, -4.2, 4.2, 4.4, -10, 10.2, 5.2, 2.2);
  slab(batch, solids, rockFor, grassFor, 0, 6.2, 14, 6, 5.2);
  slab(batch, solids, rockFor, grassFor, -16, 1.6, 4, 5.2, 5);

  // Archipiélago aéreo: plataformas más amplias para combatir y aterrizar sin caídas injustas.
  slab(batch, solids, rockFor, grassFor, 25, 8, -18, 9.2, 8.2);
  slab(batch, solids, rockFor, grassFor, 27, 11.2, 7, 8.8, 8);
  slab(batch, solids, rockFor, grassFor, 9, 14.2, 25, 9, 8.2);
  slab(batch, solids, rockFor, grassFor, -15, 12.2, 25, 8.8, 8);
  slab(batch, solids, rockFor, grassFor, -29, 9.2, 4, 9, 8.2);
  slab(batch, solids, rockFor, grassFor, -24, 13.4, -21, 8.8, 8);

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

  const gateRingGeo = new THREE.TorusGeometry(0.72, 0.09, 8, 16);
  const gateArchGeo = new THREE.TorusGeometry(0.94, 0.055, 8, 18);
  const gateBaseGeo = new THREE.CylinderGeometry(0.92, 1.08, 0.16, 12);
  const gateCoreGeo = new THREE.CircleGeometry(0.66, 18);
  const gatePillarGeo = new THREE.CylinderGeometry(0.07, 0.11, 0.76, 6);
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
    base.position.set(x, top + 0.08, z);
    const ring = new THREE.Mesh(gateRingGeo, gateMat);
    ring.position.set(x, top + 0.86, z);
    ring.rotation.x = Math.PI / 2;
    const archA = new THREE.Mesh(gateArchGeo, gateMat);
    archA.position.set(x, top + 0.94, z);
    const archB = new THREE.Mesh(gateArchGeo, gateMat);
    archB.position.set(x, top + 0.94, z);
    archB.rotation.y = Math.PI / 2;
    const core = new THREE.Mesh(gateCoreGeo, gateCoreMat);
    core.position.set(x, top + 0.94, z);
    for (const [dx, dz] of [[-0.76, -0.76], [0.76, -0.76], [0.76, 0.76], [-0.76, 0.76]] as const) {
      const pylon = new THREE.Mesh(gatePillarGeo, gatePillarMat);
      pylon.position.set(x + dx, top + 0.42, z + dz);
      group.add(pylon);
    }
    group.add(base, ring, archA, archB, core);
    gateRings.push(ring, archA, archB);
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
    lowerCrowns.push({ x, y: walk + h + 0.7, z });
    middleCrowns.push({ x, y: walk + h + 1.5, z });
    upperCrowns.push({ x, y: walk + h + 2.22, z });
    crownTips.push({ x, y: walk + h + 2.92, z });
    for (const [dx, dz] of [[0.65, 0.18], [-0.58, 0.38], [0.16, -0.68]] as const) {
      crownBranches.push({ x: x + dx, y: walk + h + 1.8, z: z + dz });
    }
    treeCores.push({ x, y: walk + h + 0.82, z });
    treeLights.push({ x, y: walk + h + 1.1, z });
    solids.push(boxAt(x, walk, z, 0.52, h, 0.52));
  };
  plant(-6.2, 3.4, 0);
  plant(4.8, -3.2, 0);
  plant(-2.4, -6.6, 0);
  const trunkMesh = instanceCylinders(group, trunkMat, trunks, 0.18, 0.28, 1.85, 18);
  const lowerCrownMesh = instanceCones(group, leafMat, lowerCrowns, 1.3, 2.2, 16);
  const middleCrownMesh = instanceCones(group, leafMat, middleCrowns, 1.02, 1.94, 16);
  const upperCrownMesh = instanceCones(group, leafMat, upperCrowns, 0.74, 1.64, 16);
  const tipMesh = instanceCones(group, leafTipMat, crownTips, 0.38, 1.18, 12);
  const branchMesh = instanceCones(group, leafTipMat, crownBranches, 0.44, 1.04, 10);
  const coreMesh = instanceCylinders(group, treeCoreMat, treeCores, 0.09, 0.16, 1.2);
  const treeHaloGeo = new THREE.TorusGeometry(1.2, 0.025, 6, 16);
  geos.push(trunkMesh.geo, lowerCrownMesh.geo, middleCrownMesh.geo, upperCrownMesh.geo, tipMesh.geo, branchMesh.geo, coreMesh.geo, treeHaloGeo);
  for (const tree of treeCores) {
    const halo = new THREE.Mesh(treeHaloGeo, leafTipMat);
    halo.position.set(tree.x, tree.y + 0.22, tree.z);
    halo.rotation.x = Math.PI / 2;
    group.add(halo);
    treeHalos.push(halo);
  }
  // Los árboles se iluminan con puntuales sin sombra. En móvil bajan a dos: cada puntual
  // encarece el fragment shader de toda la escena.
  const lowPower =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(pointer: coarse)").matches || window.innerWidth < 720);
  const every = lowPower ? 4 : 2;
  for (const light of treeLights.filter((_, i) => i % every === 0)) {
    lights.addFill(group, light.x, light.y, light.z, 0xff2745, 2.8, 10);
    lights.addGlint(group, light.x, light.y + 1.25, light.z);
  }

  const drop = (id: string, kind: ItemPad["kind"], x: number, y: number, z: number, respawn = 12) => {
    items.push({ id, kind, x, y, z, respawn });
  };
  drop("c-health-a", "health", -6, 0, -2);
  drop("c-health-b", "health", -12, 5.2, 13, 12);
  drop("c-mega", "mega", 0, 11.2, 0, 28);
  drop("c-armor", "armor", 12, 3.4, -14, 18);
  drop("c-ammo", "ammo", -16, 2.2, -14, 10);
  drop("c-scatter", "scatter", 3.2, 4.4, -2.4, 16);
  drop("c-torpedo", "torpedo", -12, 5.2, 11, 18);
  drop("c-lance", "lance", 0, 6.2, 14, 18);
  drop("c-ion", "ion", -16, 1.6, 5.2, 20);
  drop("c-rush", "rush", 2.2, 8, -1.2, 22);
  drop("c-blink", "blink", 12, 3.4, -12.4, 22);
  drop("c-volt", "volt", -2.2, 4.4, 2.6, 22);
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
  geos.push(skyGeo);

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
      leafMat.emissiveIntensity = 0.78 + Math.sin(now * 1.6) * 0.11;
      leafTipMat.emissiveIntensity = 1.02 + Math.sin(now * 2.2 + 0.8) * 0.16;
      treeCoreMat.opacity = 0.86 + Math.sin(now * 2.6) * 0.08;
      gateCoreMat.opacity = 0.24 + 0.15 * (0.5 + 0.5 * Math.sin(now * 2.4));
      for (let i = 0; i < gateRings.length; i++) gateRings[i]!.rotation.z = now * (i % 2 ? -0.45 : 0.45);
      for (let i = 0; i < gateCores.length; i++) gateCores[i]!.scale.setScalar(0.9 + Math.sin(now * 2.1 + i) * 0.08);
      for (let i = 0; i < treeHalos.length; i++) treeHalos[i]!.rotation.z = now * 0.42 + i;
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

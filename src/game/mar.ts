import * as THREE from "three";
import { boxAt } from "./collision";
import type { AABB, ItemPad, JumpPad, Spawn } from "./types";
import { BoxBatch, stampDecks } from "./instancing";
import { createArenaLights } from "./lighting";
import { isLoDevice, loadSkyTex, loadTex, skySphereGeo } from "./textures";
import { stampJumpPads, type ArenaData } from "./arena";
import { ROUND_SECONDS } from "./constants";

/** Plataforma de combate abierta sobre el mar; el océano y el cielo forman el skybox. */
export function buildMar(scene: THREE.Scene, renderer?: THREE.WebGLRenderer): ArenaData {
  const group = new THREE.Group();
  const batch = new BoxBatch();
  const solids: AABB[] = [];
  const pads: JumpPad[] = [];
  const items: ItemPad[] = [];
  const spawns: Spawn[] = [];
  const waypoints: { x: number; y: number; z: number }[] = [];
  const mats: THREE.Material[] = [];
  const geos: THREE.BufferGeometry[] = [];

  const floorTex = loadTex("/textures/surfaces/mar-deck-plomo.webp", 1, 1);
  const floorMat = new THREE.MeshLambertMaterial({ map: floorTex, color: 0xffffff });
  const hullMat = new THREE.MeshLambertMaterial({ color: 0x8e969e });
  const edgeMat = new THREE.MeshLambertMaterial({ color: 0x3a4248 });
  const glowMat = new THREE.MeshLambertMaterial({
    color: 0x64eaff,
    emissive: 0x24d6ff,
    emissiveIntensity: 1.2,
  });
  mats.push(floorMat, hullMat, edgeMat, glowMat);

  const addBox = (
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    solid = true,
  ) => {
    batch.add(mat, x, y, z, w, h, d);
    if (solid) solids.push(boxAt(x, y, z, w, h, d));
  };

  // Gran cubierta central y cuatro islas menores: se puede saltar entre ellas.
  const decks: Array<{ x: number; y: number; z: number; w: number; d: number }> = [];
  addBox(hullMat, 0, -0.62, 0, 34, 1.24, 30);
  decks.push({ x: 0, y: 0.64, z: 0, w: 34, d: 30 });
  addBox(edgeMat, 0, -1.28, 0, 35, 0.18, 31, false);
  const islands = [
    { x: -23, y: 1.55, z: 0, w: 11, d: 11 },
    { x: 23, y: 1.55, z: 0, w: 11, d: 11 },
    { x: 0, y: 1.55, z: -22, w: 12, d: 10 },
    { x: 0, y: 1.55, z: 22, w: 12, d: 10 },
  ];
  for (const island of islands) {
    addBox(hullMat, island.x, island.y - 0.62, island.z, island.w, 1.24, island.d);
    decks.push({ x: island.x, y: island.y + 0.64, z: island.z, w: island.w, d: island.d });
    addBox(
      edgeMat,
      island.x,
      island.y - 1.28,
      island.z,
      island.w + 0.8,
      0.18,
      island.d + 0.8,
      false,
    );
    // Soportes visuales bajo el agua, sin colisión ni sombras.
    for (const dx of [-1, 1])
      for (const dz of [-1, 1]) {
        addBox(
          edgeMat,
          island.x + dx * (island.w * 0.34),
          -3.8,
          island.z + dz * (island.d * 0.34),
          0.48,
          5.5,
          0.48,
          false,
        );
      }
    waypoints.push({ x: island.x, y: island.y, z: island.z });
  }
  for (const [x, z, w, d] of [
    [-15, 0, 0.24, 8],
    [15, 0, 0.24, 8],
    [0, -13, 8, 0.24],
    [0, 13, 8, 0.24],
  ] as const) {
    addBox(glowMat, x, 0.025, z, w, 0.035, d, false);
  }

  const padSpots = [
    { x: -14, y: 0.035, z: 0 },
    { x: 14, y: 0.035, z: 0 },
    { x: 0, y: 0.035, z: -12 },
    { x: 0, y: 0.035, z: 12 },
  ];
  stampJumpPads(group, mats, geos, padSpots, 0.95);
  const jumpTargets = [
    { x: -14, z: 0, vx: -12, vz: 0 },
    { x: 14, z: 0, vx: 12, vz: 0 },
    { x: 0, z: -12, vx: 0, vz: -12 },
    { x: 0, z: 12, vx: 0, vz: 12 },
  ];
  for (const p of jumpTargets)
    pads.push({ aabb: boxAt(p.x, 0.18, p.z, 2.1, 0.5, 2.1), vx: p.vx, vy: 12.6, vz: p.vz });

  const yawTo = (x: number, z: number) => Math.atan2(-x, -z);
  for (const [x, z] of [
    [-9, -8],
    [9, -8],
    [-9, 8],
    [9, 8],
    [0, 0],
    [-23, 0],
    [23, 0],
    [0, -22],
    [0, 22],
  ]) {
    const y = Math.abs(x) + Math.abs(z) > 20 ? 1.55 : 0;
    spawns.push({ x, y, z, yaw: yawTo(x, z) });
  }
  const drops: Array<[string, ItemPad["kind"], number, number, number, number]> = [
    ["sea-health", "health", -7, 0.45, 0, 16],
    ["sea-armor", "armor", 7, 0.45, 0, 20],
    ["sea-mega", "mega", 0, 0.45, 0, 32],
    ["sea-scatter", "scatter", -23, 2, 0, 18],
    ["sea-lance", "lance", 23, 2, 0, 20],
    ["sea-rush", "rush", 0, 2, -22, 22],
    ["sea-ion", "ion", 0, 2, 22, 20],
    ["sea-fauces", "fauces", 0, 0.45, 12, 22],
    ["sea-bate", "bate", -12, 0.45, 6, 18],
    ["sea-martillo", "martillo", 12, 0.45, -6, 24],
  ];
  for (const [id, kind, x, y, z, respawn] of drops) items.push({ id, kind, x, y, z, respawn });
  waypoints.push({ x: 0, y: 0, z: 0 }, { x: -9, y: 0, z: 0 }, { x: 9, y: 0, z: 0 });

  const pulse = (color: number) => {
    const mat = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.22 });
    mats.push(mat);
    return mat;
  };
  const lights = createArenaLights(
    scene,
    {
      floor: pulse(0x8aa0b4),
      rune: pulse(0x39dff5),
      console: pulse(0x5bbde0),
      ruin: pulse(0x617c86),
      skull: pulse(0xd6eaf0),
      pad: glowMat,
      ion: pulse(0x5aa8ff),
      ember: pulse(0xff8b52),
    },
    renderer,
    "mar",
  );

  const deck = stampDecks(group, floorMat, decks, 4);
  geos.push(deck.geo);

  const skyPaths = [
    "/textures/space/mar-ocean-day-v1.webp",
    "/textures/space/mar-ocean-sunset-v1.webp",
    "/textures/space/mar-ocean-night-v1.webp",
  ];
  const skyTextures = skyPaths.map((path) => loadSkyTex(path, false));
  const skyGeo = skySphereGeo();
  const skyMaterials = skyTextures.map(
    (map, index) =>
      new THREE.MeshBasicMaterial({
        map,
        side: THREE.BackSide,
        fog: false,
        transparent: true,
        opacity: index === 0 ? 1 : 0,
        depthWrite: false,
        toneMapped: false,
      }),
  );
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
  const update = (now: number) => {
    const elapsed = cycleStartedAt === null ? 0 : Math.max(0, now - cycleStartedAt);
    const progress = Math.min(1, elapsed / ROUND_SECONDS);
    let base = 0;
    let overlay = 0;
    let blend = 0;
    if (progress >= 0.42 && progress < 0.56) {
      base = 0;
      overlay = 1;
      blend = THREE.MathUtils.smoothstep(progress, 0.42, 0.56);
    } else if (progress >= 0.56 && progress < 0.66) {
      base = 1;
      overlay = 1;
    } else if (progress >= 0.66 && progress < 0.84) {
      base = 1;
      overlay = 2;
      blend = THREE.MathUtils.smoothstep(progress, 0.66, 0.84);
    } else if (progress >= 0.84) {
      base = 2;
      overlay = 2;
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

  batch.build(group);
  scene.add(group);
  return {
    group,
    solids,
    pads,
    items,
    spawns,
    waypoints,
    lights,
    update,
    startCycle,
    killY: -12,
    dispose: () => {
      scene.remove(group);
      for (const layer of skyLayers) scene.remove(layer);
      lights.dispose();
      batch.dispose();
      group.traverse((obj) => {
        if (obj instanceof THREE.BatchedMesh || obj instanceof THREE.InstancedMesh) obj.dispose();
      });
      for (const geo of geos) geo.dispose();
      for (const mat of mats) mat.dispose();
      for (let i = 0; i < skyTextures.length; i++) {
        skyTextures[i]!.dispose();
        THREE.Cache.remove(skyPaths[i]!);
      }
    },
  };
}

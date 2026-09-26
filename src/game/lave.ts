import * as THREE from "three";
import { boxAt } from "./collision";
import type { ArenaData } from "./arena";
import { BoxBatch, instanceCylinders } from "./instancing";
import { createArenaLights } from "./lighting";
import { laveCrackTex, loadSkyTex, loadTex } from "./textures";
import type { AABB, ItemPad, JumpPad, Spawn } from "./types";

const WIDTH = 96;
const DEPTH = 72;
const SLOPE = 0.07;

function floorY(z: number) {
  return z * SLOPE;
}

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

export function buildLave(scene: THREE.Scene, renderer?: THREE.WebGLRenderer): ArenaData {
  const group = new THREE.Group();
  const solids: AABB[] = [];
  const pads: JumpPad[] = [];
  const hazards: Array<{ x: number; y: number; z: number; radius: number; damage: number; color: number }> = [];
  const items: ItemPad[] = [];
  const spawns: Spawn[] = [];
  const waypoints: { x: number; y: number; z: number }[] = [];
  const mats: THREE.Material[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const batch = new BoxBatch();

  const earthTex = loadTex("/textures/lave-earth.jpg", 22, 16);
  const lavaTex = laveCrackTex(12, 9);
  const earthMat = new THREE.MeshStandardMaterial({
    map: earthTex,
    color: 0xf0d2b0,
    emissive: 0x3a1208,
    emissiveMap: earthTex,
    emissiveIntensity: 0.12,
    roughness: 0.9,
    metalness: 0.03,
  });
  const rockTiers = new Map<number, THREE.MeshStandardMaterial>();
  const rockFor = (size: number) => {
    const tiles = Math.max(1, Math.round(size / 2.2));
    let m = rockTiers.get(tiles);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        map: loadTex("/textures/lave-rock.jpg", tiles, Math.max(1, Math.round(tiles * 0.7))),
        color: 0xe8c8b0,
        roughness: 0.86,
        metalness: 0.06,
      });
      rockTiers.set(tiles, m);
      mats.push(m);
    }
    return m;
  };
  const rockMat = rockFor(5);
  const padMat = new THREE.MeshLambertMaterial({
    color: 0xffaa55,
    emissive: 0xff4a18,
    emissiveIntensity: 0.82,
  });
  const lavaMat = new THREE.MeshBasicMaterial({
    map: lavaTex,
    transparent: true,
    opacity: 0.82,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const ventMat = new THREE.MeshBasicMaterial({
    color: 0xffa04a,
    transparent: true,
    opacity: 0.86,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  mats.push(earthMat, rockMat, padMat, lavaMat, ventMat);

  const pulse = (color: number) => {
    const mat = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.2 });
    mats.push(mat);
    return mat;
  };
  const lights = createArenaLights(
    scene,
    {
      floor: earthMat,
      rune: pulse(0xff6a2a),
      console: pulse(0xd28a55),
      ruin: rockMat,
      skull: pulse(0xe0c2a4),
      pad: padMat,
      ion: pulse(0x5aa8ff),
      ember: pulse(0xff4a18),
    },
    renderer,
    "lave",
  );

  // La colisión aproxima los cuatro grados de inclinación con peldaños de 14 cm.
  // El jugador los sube con suavidad; la superficie visible sigue siendo un plano continuo.
  const strips = 36;
  const stripDepth = DEPTH / strips;
  for (let i = 0; i < strips; i++) {
    const z = -DEPTH / 2 + stripDepth * (i + 0.5);
    const top = floorY(z);
    solids.push(boxAt(0, top - 2.2, z, WIDTH, 2.2, stripDepth + 0.04));
  }

  const groundGeo = new THREE.PlaneGeometry(WIDTH, DEPTH, 24, 18);
  const pos = groundGeo.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, -pos.getY(i) * SLOPE);
  pos.needsUpdate = true;
  groundGeo.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeo, earthMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  const lavaSurface = new THREE.Mesh(groundGeo, lavaMat);
  lavaSurface.rotation.x = -Math.PI / 2;
  lavaSurface.position.y = 0.035;
  lavaSurface.renderOrder = 1;
  lavaSurface.frustumCulled = false;
  group.add(lavaSurface);
  geos.push(groundGeo);

  const rocks: Array<[number, number, number, number, number]> = [
    [-34, -24, 5.2, 2.8, 5],
    [-18, 18, 4, 2.2, 3.6],
    [0, -18, 6, 2.6, 4],
    [19, 10, 5, 3.2, 4.4],
    [34, -12, 4.4, 2.4, 3.8],
    [-36, 24, 4.8, 2.8, 4],
    [35, 25, 5.4, 3, 4.6],
    [8, 24, 3.8, 2.2, 3.2],
    [-8, 2, 3.2, 1.8, 2.8],
  ];
  for (const [x, z, w, h, d] of rocks) {
    addBox(batch, solids, rockFor((w + d) / 2), x, floorY(z), z, w, h, d);
  }

  const wall = (x: number, z: number, d: number) => {
    addBox(batch, solids, rockFor(3), x, floorY(z), z, 1.6, 2.6, d);
  };
  wall(-14, -18, 16);
  wall(-14, 16, 14);
  wall(14, -18, 16);
  wall(14, 16, 14);
  addBox(batch, solids, rockFor(4), 0, floorY(-8), -8, 5.2, 1.7, 4);
  const nest = (x: number, z: number) => {
    addBox(batch, solids, rockFor(5), x, floorY(z), z, 6.2, 2.5, 5.2);
  };
  nest(-22, 6);
  nest(22, 6);

  const launch = (x: number, z: number, vx: number, vy: number, vz: number) => {
    const y = floorY(z);
    pads.push({ aabb: boxAt(x, y - 0.05, z, 2.4, 1.1, 2.4), vx, vy, vz });
  };
  launch(-28, -22, 4, 12, 9);
  launch(28, -22, -4, 12, 9);
  launch(-36, 8, 8, 9, 1.5);
  launch(36, 8, -8, 9, 1.5);
  const padSpots = pads.map((p) => ({
    x: (p.aabb.minX + p.aabb.maxX) / 2,
    y: p.aabb.minY + 0.14,
    z: (p.aabb.minZ + p.aabb.maxZ) / 2,
  }));
  const padMesh = instanceCylinders(group, padMat, padSpots, 1.12, 1.22, 0.16);
  geos.push(padMesh.geo);
  lights.addPad(group, -28, -22, floorY(-22) + 0.6);
  lights.addPad(group, 28, -22, floorY(-22) + 0.6);
  lights.addPad(group, -36, 8, floorY(8) + 0.6);
  lights.addPad(group, 36, 8, floorY(8) + 0.6);

  // Fisuras termales: zona de riesgo legible, no una trampa instantánea.
  const ventSpots = [
    { x: -8, z: -4, radius: 1.35 },
    { x: 10, z: 8, radius: 1.45 },
    { x: -22, z: 17, radius: 1.25 },
  ];
  const ventMeshes: THREE.Mesh[] = [];
  for (const vent of ventSpots) {
    const y = floorY(vent.z) + 0.045;
    hazards.push({ x: vent.x, y, z: vent.z, radius: vent.radius, damage: 9, color: 0xff5a1f });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(vent.radius, 0.075, 6, 18), ventMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(vent.x, y, vent.z);
    ring.renderOrder = 3;
    group.add(ring);
    ventMeshes.push(ring);
  }

  for (const z of [-28, -14, 0, 14, 28]) {
    for (const x of [-38, -19, 0, 19, 38]) waypoints.push({ x, y: floorY(z), z });
  }

  const yawToCenter = (x: number, z: number) => Math.atan2(-x, -z);
  const spawnAt = (x: number, z: number) =>
    spawns.push({ x, y: floorY(z), z, yaw: yawToCenter(x, z) });
  spawnAt(-38, -28);
  spawnAt(0, -29);
  spawnAt(38, -27);
  spawnAt(-39, 0);
  spawnAt(39, 0);
  spawnAt(-37, 27);
  spawnAt(0, 29);
  spawnAt(37, 27);

  const drop = (id: string, kind: ItemPad["kind"], x: number, z: number, respawn = 14) =>
    items.push({ id, kind, x, y: floorY(z), z, respawn });
  drop("lave-health-a", "health", -24, -8, 10);
  drop("lave-health-b", "health", 24, 12, 10);
  drop("lave-mega", "mega", 0, 28, 30);
  drop("lave-armor", "armor", 0, -27, 20);
  drop("lave-ammo", "ammo", -30, 18, 10);
  drop("lave-scatter", "scatter", -18, -20, 16);
  drop("lave-torpedo", "torpedo", 0, 10, 18);
  items.push({ id: "lave-lance", kind: "lance", x: -22, y: floorY(6) + 2.5, z: 6, respawn: 18 });
  items.push({ id: "lave-nest-health", kind: "health", x: 22, y: floorY(6) + 2.5, z: 6, respawn: 12 });
  drop("lave-ion", "ion", 0, 2, 20);
  drop("lave-rush", "rush", 8, -15, 22);
  drop("lave-blink", "blink", -8, 16, 22);
  drop("lave-volt", "volt", 0, 0, 22);

  const skyTex = loadSkyTex("/textures/lave-sky.jpg");
  const skyGeo = new THREE.SphereGeometry(240, 32, 20);
  const skyMat = new THREE.MeshBasicMaterial({
    map: skyTex,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
    toneMapped: false,
  });
  mats.push(skyMat);
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -20;
  scene.add(sky);
  geos.push(skyGeo);

  batch.build(group);
  scene.add(group);

  return {
    group,
    solids,
    pads,
    hazards,
    items,
    spawns,
    waypoints,
    lights,
    update: (now) => {
      lavaTex.offset.x = (now * 0.014) % 1;
      lavaTex.offset.y = (now * -0.021) % 1;
      lavaMat.opacity = 0.68 + 0.14 * (0.5 + 0.5 * Math.sin(now * 1.15));
      earthMat.emissiveIntensity = 0.1 + 0.035 * (0.5 + 0.5 * Math.sin(now * 0.8));
      for (let i = 0; i < ventMeshes.length; i++) {
        const p = 0.86 + Math.sin(now * 3.2 + i * 1.7) * 0.14;
        ventMeshes[i]!.scale.setScalar(p);
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
      for (const geo of geos) geo.dispose();
      for (const mat of mats) mat.dispose();
    },
  };
}

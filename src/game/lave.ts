import * as THREE from "three";
import { boxAt } from "./collision";
import { stampJumpPads, type ArenaData } from "./arena";
import { BoxBatch, instanceCylinders } from "./instancing";
import { createArenaLights } from "./lighting";
import { isLoDevice, laveCrackTex, loadArenaSurface, loadSpaceSky, loadTex, skySphereGeo } from "./textures";
import type { AABB, HazardZone, ItemPad, JumpPad, Spawn } from "./types";

const WIDTH = 96;
const DEPTH = 72;
const SLOPE = 0.07;

function floorY(z: number) {
  return z * SLOPE;
}

function laveSmokeTex() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, "rgba(255, 210, 160, 0.55)");
  g.addColorStop(0.28, "rgba(90, 70, 60, 0.42)");
  g.addColorStop(0.62, "rgba(28, 22, 20, 0.22)");
  g.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
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

function makeFissureGeometry(length: number, width: number, seed: number, segments = 14) {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = -length * 0.5 + length * t;
    const bend = Math.sin(seed * 1.73 + i * 1.31) * width * 0.14
      + Math.sin(seed * 0.47 + i * 2.83) * width * 0.055;
    const jagged = 0.72 + (0.5 + 0.5 * Math.sin(seed * 2.11 + i * 4.17)) * 0.28;
    const half = width * 0.5 * jagged;
    positions.push(x, 0, bend - half, x, 0, bend + half);
    normals.push(0, 1, 0, 0, 1, 0);
    uvs.push(t * Math.max(1, length / 3.5), 0, t * Math.max(1, length / 3.5), 1);
    if (i < segments) {
      const a = i * 2;
      indices.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

export function buildLave(scene: THREE.Scene, renderer?: THREE.WebGLRenderer): ArenaData {
  const group = new THREE.Group();
  const solids: AABB[] = [];
  const pads: JumpPad[] = [];
  const hazards: HazardZone[] = [];
  const items: ItemPad[] = [];
  const spawns: Spawn[] = [];
  const waypoints: { x: number; y: number; z: number }[] = [];
  const mats: THREE.Material[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const batch = new BoxBatch();

  const floorTex = loadArenaSurface("lave");
  const earthMat = new THREE.MeshLambertMaterial({
    map: floorTex,
    color: 0xffffff,
    emissive: 0xff5a18,
    emissiveMap: floorTex,
    emissiveIntensity: 0.42,
  });
  const lavaTex = laveCrackTex(4.2, 1.4);
  const rockTiers = new Map<number, THREE.MeshStandardMaterial>();
  const rockFor = (size: number) => {
    const tiles = Math.max(1, Math.round(size / 2.2));
    let m = rockTiers.get(tiles);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        map: loadTex("/textures/lave-rock.jpg", tiles, Math.max(1, Math.round(tiles * 0.7))),
        color: 0xffffff,
        emissive: 0x4a0808,
        roughness: 0.78,
        metalness: 0.12,
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
  const lavaMat = new THREE.MeshStandardMaterial({
    map: lavaTex,
    color: 0xffd27a,
    emissive: 0xff5a14,
    emissiveMap: lavaTex,
    emissiveIntensity: 1.55,
    roughness: 0.32,
    metalness: 0.08,
    toneMapped: false,
  });
  const fissureRimMat = new THREE.MeshStandardMaterial({
    color: 0x260403,
    emissive: 0x7a1205,
    emissiveIntensity: 0.72,
    roughness: 0.9,
    metalness: 0.02,
  });
  mats.push(earthMat, rockMat, padMat, lavaMat, fissureRimMat);

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
  const uv = groundGeo.getAttribute("uv") as THREE.BufferAttribute;
  const tile = 7;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, pos.getX(i) / tile, pos.getY(i) / tile);
    pos.setZ(i, -pos.getY(i) * SLOPE);
  }
  pos.needsUpdate = true;
  uv.needsUpdate = true;
  groundGeo.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeo, earthMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  geos.push(groundGeo);

  const floorLamps: THREE.PointLight[] = [];
  const lampSpots: Array<[number, number]> = isLoDevice()
    ? [
        [0, -18],
        [0, 0],
        [0, 16],
      ]
    : [
        [0, -18],
        [-22, 4],
        [22, 8],
        [0, 16],
        [-32, -8],
        [32, -10],
        [0, 0],
      ];
  for (const [x, z] of lampSpots) {
    const lamp = new THREE.PointLight(0xff5a1c, 2.1, 18, 1.55);
    lamp.castShadow = false;
    lamp.position.set(x, floorY(z) + 0.55, z);
    group.add(lamp);
    floorLamps.push(lamp);
  }

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
    const y = floorY(z);
    addBox(batch, solids, rockFor(5), x, y, z, 6.2, 1.62, 5.2);
    addBox(batch, solids, rockFor(3), x + (x < 0 ? 3.4 : -3.4), y, z, 2.6, 0.82, 3.2);
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
  stampJumpPads(group, mats, geos, padSpots.map((p) => ({ ...p, y: p.y + 0.1 })), 1.14);
  lights.addPad(group, -28, -22, floorY(-22) + 0.6);
  lights.addPad(group, 28, -22, floorY(-22) + 0.6);
  lights.addPad(group, -36, 8, floorY(8) + 0.6);
  lights.addPad(group, 36, 8, floorY(8) + 0.6);

  // Fisuras térmicas: grietas de lava que queman al pisarlas. El atajo vale si no te quedas.
  const cracks: Array<{ x: number; z: number; along: "x" | "z"; len: number; wid: number }> = [
    { x: 0, z: -12, along: "x", len: 18, wid: 2.25 },
    { x: -12, z: 10, along: "z", len: 16, wid: 2.1 },
    { x: 26, z: -6, along: "z", len: 12.5, wid: 2.05 },
    { x: -28, z: 14, along: "x", len: 12, wid: 2.05 },
  ];
  for (let crackIndex = 0; crackIndex < cracks.length; crackIndex++) {
    const crack = cracks[crackIndex]!;
    const y = floorY(crack.z);
    const alongX = crack.along === "x";
    hazards.push({
      x: crack.x,
      y,
      z: crack.z,
      radius: Math.max(crack.len, crack.wid) * 0.55,
      hx: (alongX ? crack.len : crack.wid) * 0.42,
      hz: (alongX ? crack.wid : crack.len) * 0.42,
      damage: 16,
      color: 0xff5a14,
    });
    const rimGeo = makeFissureGeometry(crack.len, crack.wid * 1.16, crackIndex + 2.3);
    const coreGeo = makeFissureGeometry(crack.len * 0.97, crack.wid * 0.68, crackIndex + 7.1);
    geos.push(rimGeo, coreGeo);
    const rim = new THREE.Mesh(rimGeo, fissureRimMat);
    const core = new THREE.Mesh(coreGeo, lavaMat);
    rim.name = `lave-fissure-rim-${crackIndex}`;
    core.name = `lave-fissure-core-${crackIndex}`;
    rim.position.set(crack.x, y + 0.018, crack.z);
    core.position.set(crack.x, y + 0.036, crack.z);
    if (!alongX) {
      rim.rotation.y = Math.PI / 2;
      core.rotation.y = Math.PI / 2;
    }
    rim.renderOrder = 1;
    core.renderOrder = 2;
    group.add(rim, core);
    if (!isLoDevice()) {
      const glow = new THREE.PointLight(0xff6418, 2.2, 11, 1.55);
      glow.castShadow = false;
      glow.position.set(crack.x, y + 0.45, crack.z);
      group.add(glow);
    }
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
  items.push({ id: "lave-lance", kind: "lance", x: -22, y: floorY(6) + 1.62, z: 6, respawn: 18 });
  items.push({ id: "lave-nest-health", kind: "health", x: 22, y: floorY(6) + 1.62, z: 6, respawn: 12 });
  drop("lave-ion", "ion", 0, 2, 20);
  drop("lave-fauces", "fauces", 18, -12, 22);
  drop("lave-bate", "bate", -8, 8, 18);
  drop("lave-martillo", "martillo", 8, 16, 24);
  drop("lave-rush", "rush", 8, -15, 22);
  drop("lave-blink", "blink", -8, 16, 22);
  drop("lave-volt", "volt", 0, 0, 22);
  drop("lave-leap", "leap", 20, -8, 24);

  const vents = [
    ...cracks.map((c) => ({ x: c.x, z: c.z, spread: Math.max(c.len, c.wid) * 0.35 })),
    { x: -8, z: -6, spread: 3.2 },
    { x: 10, z: 6, spread: 3.6 },
    { x: 0, z: 22, spread: 4.2 },
    { x: -24, z: 2, spread: 2.8 },
    { x: 24, z: -14, spread: 3 },
  ];
  const smokeN = isLoDevice() ? 18 : 28;
  const smokePos = new Float32Array(smokeN * 3);
  const smokeCol = new Float32Array(smokeN * 3);
  type Puff = { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; heat: number };
  const puffs: Puff[] = [];
  const seedPuff = (p: Puff, i: number) => {
    const v = vents[i % vents.length]!;
    p.x = v.x + (Math.random() - 0.5) * v.spread;
    p.z = v.z + (Math.random() - 0.5) * v.spread;
    p.y = floorY(p.z) + 0.15 + Math.random() * 0.4;
    p.vx = (Math.random() - 0.5) * 0.55;
    p.vy = 0.7 + Math.random() * 1.35;
    p.vz = (Math.random() - 0.5) * 0.55;
    p.max = 2.1 + Math.random() * 2.4;
    p.life = Math.random() * p.max;
    p.heat = Math.random();
  };
  for (let i = 0; i < smokeN; i++) {
    const p: Puff = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, heat: 0 };
    seedPuff(p, i);
    puffs.push(p);
  }
  const smokeGeo = new THREE.BufferGeometry();
  const smokePosAttr = new THREE.BufferAttribute(smokePos, 3).setUsage(THREE.DynamicDrawUsage);
  const smokeColAttr = new THREE.BufferAttribute(smokeCol, 3).setUsage(THREE.DynamicDrawUsage);
  smokeGeo.setAttribute("position", smokePosAttr);
  smokeGeo.setAttribute("color", smokeColAttr);
  smokeGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 4, 0), 80);
  const smokeMap = laveSmokeTex();
  const smokeMat = new THREE.PointsMaterial({
    map: smokeMap,
    color: 0xffffff,
    vertexColors: true,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    blending: THREE.NormalBlending,
    size: 3.6,
    sizeAttenuation: true,
    fog: true,
  });
  mats.push(smokeMat);
  geos.push(smokeGeo);
  const smoke = new THREE.Points(smokeGeo, smokeMat);
  smoke.frustumCulled = false;
  smoke.renderOrder = 6;
  group.add(smoke);

  const skyTex = loadSpaceSky("lave");
  const skyGeo = skySphereGeo();
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
    update: (now, dt = 1 / 60) => {
      lavaTex.offset.x = (now * 0.08) % 1;
      lavaTex.offset.y = (now * -0.045) % 1;
      lavaMat.emissiveIntensity = 1.25 + 0.55 * (0.5 + 0.5 * Math.sin(now * 3.4));
      earthMat.emissiveIntensity = 1.02 + 0.28 * (0.5 + 0.5 * Math.sin(now * 1.15));
      const pulse = 0.5 + 0.5 * Math.sin(now * 2.2);
      for (let i = 0; i < floorLamps.length; i++) {
        floorLamps[i]!.intensity = 1.7 + 0.7 * Math.sin(now * 1.8 + i * 0.9);
      }
      for (let i = 0; i < puffs.length; i++) {
        const p = puffs[i]!;
        p.life += dt;
        if (p.life >= p.max) seedPuff(p, i);
        const t = p.life / p.max;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vx += Math.sin(now * 0.7 + i) * 0.12 * dt;
        p.vz += Math.cos(now * 0.55 + i) * 0.12 * dt;
        const fade = t < 0.18 ? t / 0.18 : 1 - (t - 0.18) / 0.82;
        const a = Math.max(0, fade);
        smokePos[i * 3] = p.x;
        smokePos[i * 3 + 1] = p.y;
        smokePos[i * 3 + 2] = p.z;
        smokeCol[i * 3] = (0.22 + p.heat * 0.55) * a;
        smokeCol[i * 3 + 1] = (0.16 + p.heat * 0.18) * a;
        smokeCol[i * 3 + 2] = 0.12 * a;
      }
      smokePosAttr.needsUpdate = true;
      smokeColAttr.needsUpdate = true;
      smokeMat.opacity = 0.58 + 0.12 * pulse;
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
      smokeMap.dispose();
    },
  };
}

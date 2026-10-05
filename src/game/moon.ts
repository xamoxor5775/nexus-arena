import * as THREE from "three";
import { boxAt } from "./collision";
import type { ArenaData } from "./arena";
import { stampJumpPads } from "./arena";
import { BoxBatch, instanceCylinders, stampDecks } from "./instancing";
import { createArenaLights } from "./lighting";
import { loadArenaSurface, loadSpaceSky, loadTex, portalTex, skySphereGeo } from "./textures";
import type { AABB, FlagPad, ItemPad, JumpPad, Spawn, TeleportGate } from "./types";

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

/** Superficie a y=8. Núcleo interior a y=-20. Portales unen ambos. */
export function buildMoon(scene: THREE.Scene, renderer?: THREE.WebGLRenderer): ArenaData {
  const group = new THREE.Group();
  const solids: AABB[] = [];
  const pads: JumpPad[] = [];
  const teleports: TeleportGate[] = [];
  const items: ItemPad[] = [];
  const spawns: Spawn[] = [];
  const waypoints: { x: number; y: number; z: number }[] = [];
  const flags: FlagPad[] = [];
  const mats: THREE.Material[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const batch = new BoxBatch();

  const dust = loadArenaSurface("luna");
  const crater = loadTex("/textures/moon/crateres.webp", 1, 1);
  const oxide = loadTex("/textures/moon/oxido.webp", 1, 1);
  const brick = loadTex("/textures/crypt-brick.jpg", 3.2, 2.2);
  const plate = loadTex("/textures/armor.jpg", 2.8, 2.8);
  const pipes = loadTex("/textures/pipes.jpg", 2.2, 1.6);
  const rune = loadTex("/textures/rune.jpg", 1.4, 1.4);

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
    emissive: 0x2a241c,
    emissiveIntensity: 0.08,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
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
    emissiveIntensity: 0.16,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const brickMat = new THREE.MeshStandardMaterial({
    map: brick,
    color: 0xb8c0c8,
    roughness: 0.82,
    metalness: 0.18,
  });
  const coreMat = new THREE.MeshStandardMaterial({
    map: plate,
    color: 0x9aa8b8,
    roughness: 0.58,
    metalness: 0.42,
    emissive: 0x1a3048,
    emissiveIntensity: 0.28,
  });
  const pipeMat = new THREE.MeshStandardMaterial({
    map: pipes,
    color: 0x8a9aaa,
    roughness: 0.48,
    metalness: 0.52,
  });
  const ionMat = new THREE.MeshLambertMaterial({
    map: rune,
    color: 0xffffff,
    emissive: 0x2ee0c8,
    emissiveMap: rune,
    emissiveIntensity: 0.62,
  });
  const padMat = new THREE.MeshLambertMaterial({ color: 0x7ee8ff, emissive: 0x2ee0c8, emissiveIntensity: 0.7 });
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
  mats.push(dustMat, craterMat, oxideMat, brickMat, coreMat, pipeMat, ionMat, padMat, gateMat, gateBaseMat, gateCoreMat);

  const pulse = (color: number) => {
    const m = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.2 });
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

  const SURF = 8;
  const CORE = -20;

  addBox(batch, solids, rockFor(72), 0, SURF - 1.35, 0, 72, 1.32, 72);
  addBox(batch, solids, rockFor(24), 0, SURF, -37, 74, 4.2, 3.2);
  addBox(batch, solids, rockFor(24), 0, SURF, 37, 74, 4.2, 3.2);
  addBox(batch, solids, rockFor(24), -37, SURF, 0, 3.2, 4.2, 74);
  addBox(batch, solids, rockFor(24), 37, SURF, 0, 3.2, 4.2, 74);

  addBox(batch, solids, rockFor(16), -22, SURF, 0, 16, 1.12, 16);
  addBox(batch, solids, ionMat, -22, SURF + 1.15, 0, 10, 0.12, 10, false);
  addBox(batch, solids, rockFor(12), 18, SURF, 18, 14, 2.4, 10);
  addBox(batch, solids, rockFor(12), 18, SURF, -18, 14, 2.4, 10);
  addBox(batch, solids, rockFor(9), 0, SURF, 0, 9, 0.55, 9, false);

  addBox(batch, solids, brickMat, 0, CORE - 1.2, 0, 56, 1.18, 32);
  addBox(batch, solids, brickMat, 0, CORE, -17, 56, 7.2, 2.4);
  addBox(batch, solids, brickMat, 0, CORE, 17, 56, 7.2, 2.4);
  addBox(batch, solids, pipeMat, -29, CORE, 0, 2.4, 7.2, 32);
  addBox(batch, solids, pipeMat, 29, CORE, 0, 2.4, 7.2, 32);
  solids.push(boxAt(0, CORE + 7.2, 0, 56, 0.8, 32));
  addBox(batch, solids, coreMat, -16, CORE, 0, 14, 1.1, 14);

  const glassMat = new THREE.MeshBasicMaterial({
    color: 0x9ad8ff,
    transparent: true,
    opacity: 0.14,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });
  mats.push(glassMat);
  const skyLight = new THREE.Mesh(new THREE.PlaneGeometry(54, 30), glassMat);
  skyLight.rotation.x = -Math.PI / 2;
  skyLight.position.set(0, CORE + 7.55, 0);
  skyLight.renderOrder = 3;
  group.add(skyLight);
  geos.push(skyLight.geometry);

  const coreLamp = new THREE.PointLight(0xb8e8ff, 4.2, 56, 1.35);
  coreLamp.position.set(0, CORE + 5.4, 0);
  coreLamp.castShadow = false;
  group.add(coreLamp);
  lights.addFill(group, -18, CORE + 4.2, 0, 0x7ae0ff, 3.2, 22);
  lights.addFill(group, 18, CORE + 4.2, 0, 0xff8a4a, 2.8, 20);
  lights.addFill(group, 0, SURF + 6.5, 0, 0xd8f0ff, 2.4, 28);
  lights.addFill(group, -22, SURF + 4.2, 0, 0x7ff5e4, 2.1, 16);
  lights.addFill(group, 16, SURF + 4.2, 16, 0xc8e8ff, 1.8, 14);

  const moonR = 70;
  const moonGeo = new THREE.SphereGeometry(moonR, 48, 32);
  const moonMat = new THREE.MeshLambertMaterial({
    map: loadArenaSurface("luna", 8, 5),
    color: 0xffffff,
    emissive: 0x1c1814,
    emissiveIntensity: 0.08,
    toneMapped: false,
  });
  mats.push(moonMat);
  geos.push(moonGeo);
  const moon = new THREE.Mesh(moonGeo, moonMat);
  moon.position.set(0, CORE - 1.6 - moonR - 10, 0);
  moon.receiveShadow = true;
  moon.castShadow = false;
  group.add(moon);

  const domeGeo = new THREE.SphereGeometry(92, 40, 18, 0, Math.PI * 2, 0, Math.PI / 2);
  const domeMat = new THREE.MeshBasicMaterial({
    color: 0xa8dcff,
    transparent: true,
    opacity: 0.08,
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });
  mats.push(domeMat);
  geos.push(domeGeo);
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.position.set(0, SURF + 4.2, 0);
  dome.frustumCulled = false;
  dome.renderOrder = -8;
  dome.castShadow = false;
  dome.receiveShadow = false;
  group.add(dome);

  const mark = (x: number, y: number, z: number) => waypoints.push({ x, y, z });
  mark(-22, SURF + 1.2, 0);
  mark(0, SURF, 18);
  mark(0, SURF, -18);
  mark(22, SURF, 0);
  mark(16, SURF, 16);
  mark(-16, SURF, -16);
  mark(16, CORE, 0);
  mark(-16, CORE, 0);
  mark(0, CORE, 8);
  mark(0, CORE, -8);
  mark(20, CORE, 8);
  mark(-20, CORE, -8);
  mark(0, SURF, 24);
  mark(0, SURF, -24);
  mark(0, CORE, 12);
  mark(0, CORE, -12);

  flags.push({ team: "ion", x: -22, y: SURF + 1.15, z: 0 });
  flags.push({ team: "ember", x: 16, y: CORE, z: 0 });

  const yawTo = (x: number, z: number) => Math.atan2(-x, -z);
  spawns.push({ x: -26, y: SURF + 1.2, z: -4, yaw: yawTo(-26, -4), team: "ion" });
  spawns.push({ x: -26, y: SURF + 1.2, z: 4, yaw: yawTo(-26, 4), team: "ion" });
  spawns.push({ x: -18, y: SURF + 1.2, z: 0, yaw: 0, team: "ion" });
  spawns.push({ x: 20, y: CORE, z: -5, yaw: Math.PI, team: "ember" });
  spawns.push({ x: 20, y: CORE, z: 5, yaw: Math.PI, team: "ember" });
  spawns.push({ x: 12, y: CORE, z: 0, yaw: Math.PI, team: "ember" });
  spawns.push({ x: 0, y: SURF, z: 20, yaw: Math.PI });
  spawns.push({ x: 0, y: SURF, z: -20, yaw: 0 });
  spawns.push({ x: -8, y: CORE, z: 8, yaw: 0 });
  spawns.push({ x: 8, y: CORE, z: -8, yaw: Math.PI });

  const drop = (id: string, kind: ItemPad["kind"], x: number, y: number, z: number, respawn = 16) =>
    items.push({ id, kind, x, y, z, respawn });
  drop("luna-health-s", "health", -8, SURF, 12, 10);
  drop("luna-health-c", "health", 8, CORE, 8, 10);
  drop("luna-mega", "mega", 0, SURF, 0, 28);
  drop("luna-armor", "armor", -16, CORE, 0, 18);
  drop("luna-torpedo", "torpedo", 22, SURF, 0, 18);
  drop("luna-lance", "lance", 0, CORE, -10, 18);
  drop("luna-ion", "ion", 12, SURF, -12, 20);
  drop("luna-scatter", "scatter", -12, SURF, 12, 16);
  drop("luna-fauces", "fauces", -22, SURF, 8, 22);
  drop("luna-bate", "bate", 8, SURF, 14, 18);
  drop("luna-martillo", "martillo", -8, CORE, 0, 24);
  drop("luna-rush", "rush", -22, SURF + 1.2, 8, 22);
  drop("luna-blink", "blink", 16, CORE, 8, 22);

  pads.push({ aabb: boxAt(0, SURF - 0.04, -22, 2.2, 1.1, 2.2), vx: 0, vy: 14, vz: 10 });
  pads.push({ aabb: boxAt(8, CORE, 0, 2.2, 1.1, 2.2), vx: -8, vy: 11, vz: 0 });
  const padSpots = pads.map((p) => ({
    x: (p.aabb.minX + p.aabb.maxX) / 2,
    y: p.aabb.minY + 0.14,
    z: (p.aabb.minZ + p.aabb.maxZ) / 2,
  }));
  geos.push(instanceCylinders(group, padMat, padSpots, 1.05, 1.15, 0.16).geo);
  stampJumpPads(group, mats, geos, padSpots.map((p) => ({ ...p, y: p.y + 0.1 })), 1.08);

  const gateRingGeo = new THREE.TorusGeometry(0.78, 0.1, 8, 18);
  const gateBaseGeo = new THREE.CylinderGeometry(0.96, 1.12, 0.16, 12);
  const gateCoreGeo = new THREE.CircleGeometry(0.7, 18);
  geos.push(gateRingGeo, gateBaseGeo, gateCoreGeo);
  const gateRings: THREE.Mesh[] = [];
  const gateCores: THREE.Mesh[] = [];
  const gate = (x: number, top: number, z: number, tx: number, ty: number, tz: number, yaw?: number) => {
    teleports.push({ aabb: boxAt(x, top + 0.55, z, 1.7, 1.35, 1.7), target: { x: tx, y: ty + 0.04, z: tz, yaw } });
    const base = new THREE.Mesh(gateBaseGeo, gateBaseMat);
    base.position.set(x, top + 0.08, z);
    const ring = new THREE.Mesh(gateRingGeo, gateMat);
    ring.position.set(x, top + 1.15, z);
    const core = new THREE.Mesh(gateCoreGeo, gateCoreMat);
    core.position.set(x, top + 1.15, z);
    group.add(base, ring, core);
    gateRings.push(ring);
    gateCores.push(core);
  };
  gate(0, SURF, 24, 0, CORE, 12, Math.PI);
  gate(0, SURF, -24, 0, CORE, -12, 0);
  gate(0, CORE, 12, 0, SURF, 20, Math.PI);
  gate(0, CORE, -12, 0, SURF, -20, 0);

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
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -20;
  scene.add(sky);
  geos.push(stampDecks(group, dustMat, [{ x: 0, y: SURF + 0.02, z: 0, w: 71.4, d: 71.4 }], 3.6).geo);
  geos.push(stampDecks(group, craterMat, [{ x: -22, y: SURF + 1.18, z: 0, w: 15.6, d: 15.6 }], 3.2).geo);
  geos.push(stampDecks(group, craterMat, [{ x: 0, y: SURF + 0.58, z: 0, w: 9, d: 9 }], 2.8).geo);
  geos.push(stampDecks(group, oxideMat, [{ x: 16, y: CORE + 0.04, z: 0, w: 12.2, d: 12.2 }], 2.8).geo);
  geos.push(stampDecks(group, coreMat, [{ x: 0, y: CORE + 0.02, z: 0, w: 55.2, d: 31.2 }], 5.6).geo);
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
    flags,
    killY: -55,
    lights,
    update: (now) => {
      for (let i = 0; i < gateRings.length; i++) gateRings[i]!.rotation.z = now * (i % 2 ? -0.45 : 0.45);
      for (let i = 0; i < gateCores.length; i++) {
        gateCores[i]!.rotation.z = now * (i % 2 ? 0.35 : -0.35);
        gateCores[i]!.scale.setScalar(0.94 + Math.sin(now * 2.1 + i) * 0.06);
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

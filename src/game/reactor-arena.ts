import * as THREE from "three";
import { aabb } from "./collision";
import { addArenaSky, type ArenaData } from "./arena";
import { createArenaLights } from "./lighting";
import type { ItemKind, ItemPad, JumpPad, Spawn } from "./types";
import reactorMap from "./reactor-map.json";

type MeshBucket = { positions: number[]; normals: number[]; uvs: number[] };

const TRANSPARENT = new Set(["glass", "beam", "coolant"]);
const EMISSIVE: Record<string, { color: number; intensity: number }> = {
  red: { color: 0xff3a32, intensity: 0.9 },
  cyan: { color: 0x7ff5e4, intensity: 0.85 },
  core: { color: 0xff4a3a, intensity: 0.7 },
  jumppad: { color: 0x7ff5e4, intensity: 0.8 },
  screen: { color: 0x7ec8ff, intensity: 0.45 },
  beam: { color: 0xff5a3a, intensity: 1.2 },
  floor: { color: 0x2ee0c8, intensity: 0.16 },
};

function materialFor(name: string, map: THREE.Texture): THREE.MeshStandardMaterial {
  const glow = EMISSIVE[name];
  const transparent = TRANSPARENT.has(name);
  return new THREE.MeshStandardMaterial({
    map,
    color: 0xffffff,
    roughness: name === "rock" ? 0.82 : name === "floor" ? 0.62 : 0.55,
    metalness: name === "rock" || name === "coolant" ? 0.08 : name === "floor" ? 0.2 : 0.42,
    emissive: glow ? glow.color : 0x000000,
    emissiveMap: glow ? map : null,
    emissiveIntensity: glow?.intensity ?? 0,
    transparent,
    opacity: name === "glass" ? 0.42 : name === "beam" ? 0.55 : name === "coolant" ? 0.72 : 1,
    depthWrite: name !== "beam",
    side: transparent ? THREE.DoubleSide : THREE.FrontSide,
    blending: name === "beam" ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

export function buildReactorArena(scene: THREE.Scene): ArenaData {
  const group = new THREE.Group();
  const mats: THREE.Material[] = [];
  const texs: THREE.Texture[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const loader = new THREE.TextureLoader();

  const buckets = reactorMap.meshes as Record<string, MeshBucket>;
  const byName = new Map<string, THREE.MeshStandardMaterial>();
  for (const [name, bucket] of Object.entries(buckets)) {
    if (!bucket.positions.length) continue;
    const tex = loader.load(`/textures/reactor/${name}.png`);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    texs.push(tex);
    const mat = materialFor(name, tex);
    mats.push(mat);
    byName.set(name, mat);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(bucket.positions, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(bucket.normals, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(bucket.uvs, 2));
    geos.push(geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    if (TRANSPARENT.has(name)) mesh.renderOrder = name === "beam" ? 3 : 2;
    group.add(mesh);
  }

  const blank = () =>
    new THREE.MeshStandardMaterial({
      color: 0x111111,
      emissive: 0x111111,
      emissiveIntensity: 0.2,
    });
  const floor = byName.get("floor") ?? blank();
  const core = byName.get("core") ?? blank();
  const screen = byName.get("screen") ?? blank();
  const rock = byName.get("rock") ?? blank();
  const red = byName.get("red") ?? blank();
  const pad = byName.get("jumppad") ?? blank();
  const cyan = byName.get("cyan") ?? blank();
  const beam = byName.get("beam") ?? blank();
  for (const extra of [floor, core, screen, rock, red, pad, cyan, beam]) {
    if (!mats.includes(extra)) mats.push(extra);
  }

  const lights = createArenaLights(scene, {
    floor,
    rune: core,
    console: screen,
    ruin: rock,
    skull: red,
    pad,
    ion: cyan,
    ember: beam,
  });

  const solids = reactorMap.solids.map((s) => aabb(s[0]!, s[1]!, s[2]!, s[3]!, s[4]!, s[5]!));
  const pads: JumpPad[] = reactorMap.pads.map((p) => ({
    aabb: aabb(p.min[0]!, p.min[1]!, p.min[2]!, p.max[0]!, p.max[1]!, p.max[2]!),
    vx: p.vx,
    vy: p.vy,
    vz: p.vz,
  }));
  for (const p of pads) lights.addPad(group, (p.aabb.minX + p.aabb.maxX) / 2, (p.aabb.minZ + p.aabb.maxZ) / 2);

  const items = reactorMap.items as ItemPad[];
  const spawns = reactorMap.spawns as Spawn[];
  const waypoints = reactorMap.waypoints;

  const { sky, city } = addArenaSky(scene, mats, texs, geos);
  scene.add(group);

  return {
    group,
    solids,
    pads,
    items: items.map((it) => ({ ...it, kind: it.kind as ItemKind })),
    spawns,
    waypoints,
    lights,
    menuRadius: 46,
    dispose: () => {
      scene.remove(group);
      scene.remove(sky);
      scene.remove(city);
      lights.dispose();
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      for (const t of texs) t.dispose();
    },
  };
}

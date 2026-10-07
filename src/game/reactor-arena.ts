import * as THREE from "three";
import { aabb } from "./collision";
import { createArenaLights } from "./lighting";
import { isLoDevice, loadSpaceSky, loadTex, skySphereGeo } from "./textures";
import { SETTINGS_KEY } from "./constants";
import type { ArenaData } from "./arena";
import type { ItemKind, ItemPad, JumpPad, Spawn } from "./types";
import reactorMap from "./reactor-map.json";

/**
 * Arena "Reactor": mapa original de Nexus Arena (Quake III .map propio, assets/quake/nexus_arena.map)
 * importado con scripts/import-reactor-map.mjs (rama cursor/reactor-arena-ce63) y adaptado a la
 * arquitectura actual de arenas (texturas WebP, cielo space-ruby, detalle según calidad gráfica).
 */
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
/** Surfaces with a 1K "hi" albedo (+ normal map on Alto/Ultra). */
const HI_SURFACES = new Set(["floor", "armor", "metal", "dark", "rock"]);
const HI_AUTO = new Set(["floor", "armor"]);
/** Large-scale variation (macro texture) per surface, breaks visible tiling. */
const MACRO_AMOUNT: Record<string, number> = { floor: 0.16, armor: 0.2, metal: 0.22, dark: 0.24, rock: 0.3 };

type Detail = "bajo" | "medio" | "auto" | "alto";

function detailLevel(): Detail {
  let q = "auto";
  try {
    q = String(JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}").quality || "auto");
  } catch {
    /* ignore */
  }
  if (q === "alto" || q === "ultra") return "alto";
  if (q === "bajo" || q === "medio") return q;
  return isLoDevice() ? "bajo" : "auto";
}

function wantsHiTexture(name: string, detail: Detail) {
  if (!HI_SURFACES.has(name)) return false;
  if (detail === "alto") return true;
  if (detail === "auto") return HI_AUTO.has(name);
  return detail === "medio" && name === "floor";
}

/** Some brushes come out of the .map importer with clockwise winding: flip them to match their normal. */
function fixWinding(bucket: MeshBucket): MeshBucket {
  const p = bucket.positions.slice();
  const n = bucket.normals.slice();
  const uv = bucket.uvs.slice();
  for (let i = 0; i + 8 < p.length; i += 9) {
    const ax = p[i + 3]! - p[i]!, ay = p[i + 4]! - p[i + 1]!, az = p[i + 5]! - p[i + 2]!;
    const bx = p[i + 6]! - p[i]!, by = p[i + 7]! - p[i + 1]!, bz = p[i + 8]! - p[i + 2]!;
    const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
    if (cx * n[i]! + cy * n[i + 1]! + cz * n[i + 2]! >= 0) continue;
    for (let k = 0; k < 3; k++) {
      const t = p[i + 3 + k]!;
      p[i + 3 + k] = p[i + 6 + k]!;
      p[i + 6 + k] = t;
    }
    const tri = i / 9;
    for (const [arr, size] of [[n, 3], [uv, 2]] as const) {
      const base = tri * 3 * size;
      for (let k = 0; k < size; k++) {
        const t = arr[base + size + k]!;
        arr[base + size + k] = arr[base + 2 * size + k]!;
        arr[base + 2 * size + k] = t;
      }
    }
  }
  return { positions: p, normals: n, uvs: uv };
}

function dataTex(url: string) {
  const tex = loadTex(url, 1, 1);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

function withMacro(mat: THREE.MeshStandardMaterial, macro: THREE.Texture, amount: number, alphaRoughness: boolean, keepOpacity: boolean) {
  mat.userData.macroTex = macro;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uMacro = { value: macro };
    shader.uniforms.uMacroAmt = { value: amount };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vMacroPos;\nvarying vec3 vMacroN;")
      .replace(
        "#include <project_vertex>",
        "#include <project_vertex>\nvMacroPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvMacroN = mat3(modelMatrix) * objectNormal;",
      );
    let frag = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform sampler2D uMacro;\nuniform float uMacroAmt;\nvarying vec3 vMacroPos;\nvarying vec3 vMacroN;")
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
{
  vec3 an = abs(vMacroN);
  vec2 mp = an.y > max(an.x, an.z) ? vMacroPos.xz : (an.x > an.z ? vMacroPos.zy : vMacroPos.xy);
  float mv = texture2D(uMacro, mp * 0.031).r * 0.62 + texture2D(uMacro, mp * 0.113 + 0.37).g * 0.38;
  diffuseColor.rgb *= 1.0 + uMacroAmt * (mv - 0.5) * 2.0;
  ${keepOpacity ? "diffuseColor.a = opacity;" : ""}
}`,
      );
    if (alphaRoughness) {
      frag = frag.replace("#include <roughnessmap_fragment>", "float roughnessFactor = roughness * texture2D( map, vMapUv ).a;");
    }
    shader.fragmentShader = frag;
  };
  mat.customProgramCacheKey = () => `reactor-tex:${alphaRoughness ? 1 : 0}:${keepOpacity ? 1 : 0}`;
}

function materialFor(name: string, map: THREE.Texture, pbr = false): THREE.MeshStandardMaterial {
  const glow = EMISSIVE[name];
  const transparent = TRANSPARENT.has(name);
  return new THREE.MeshStandardMaterial({
    map,
    color: 0xffffff,
    roughness: pbr ? (name === "rock" ? 1 : 1.05) : name === "rock" ? 0.82 : name === "floor" ? 0.62 : 0.55,
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

export function buildReactorArena(scene: THREE.Scene, renderer?: THREE.WebGLRenderer): ArenaData {
  const group = new THREE.Group();
  const mats: THREE.Material[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const byName = new Map<string, THREE.MeshStandardMaterial>();
  const detail = detailLevel();
  const macro = dataTex("/textures/reactor/macro.webp");
  const timers: number[] = [];

  for (const [name, raw] of Object.entries(reactorMap.meshes as Record<string, MeshBucket>)) {
    if (!raw.positions.length) continue;
    const hi = wantsHiTexture(name, detail);
    const pbr = detail === "alto" && HI_SURFACES.has(name);
    const mat = materialFor(name, loadTex(`/textures/reactor/${hi ? `hi/${name}` : name}.webp`, 1, 1), pbr);
    if (MACRO_AMOUNT[name] !== undefined) withMacro(mat, macro, MACRO_AMOUNT[name]!, pbr, hi);
    if (pbr) {
      const normal = dataTex(`/textures/reactor/hi/${name}_n.webp`);
      const attach = () => {
        if (normal.userData.loadState === "ready") {
          mat.normalMap = normal;
          mat.normalScale.set(1, 1);
          mat.needsUpdate = true;
          return true;
        }
        return normal.userData.loadState === "error";
      };
      if (!attach()) {
        const id = window.setInterval(() => {
          if (attach()) window.clearInterval(id);
        }, 150);
        timers.push(id);
      }
    }
    mats.push(mat);
    byName.set(name, mat);
    const bucket = fixWinding(raw);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(bucket.positions, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(bucket.normals, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(bucket.uvs, 2));
    geo.computeBoundingSphere();
    geos.push(geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `reactor-${name}`;
    if (TRANSPARENT.has(name)) {
      mesh.renderOrder = name === "beam" ? 3 : 2;
    } else {
      mesh.castShadow = name !== "red" && name !== "cyan";
      mesh.receiveShadow = true;
    }
    group.add(mesh);
  }

  const blank = () => {
    const m = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x111111, emissiveIntensity: 0.2 });
    mats.push(m);
    return m;
  };
  const pick = (name: string) => byName.get(name) ?? blank();
  const lights = createArenaLights(
    scene,
    {
      floor: pick("floor"),
      rune: pick("core"),
      console: pick("screen"),
      ruin: pick("rock"),
      skull: pick("red"),
      pad: pick("jumppad"),
      ion: pick("cyan"),
      ember: pick("beam"),
    },
    renderer,
    "crucible",
  );

  const solids = reactorMap.solids.map((s) => aabb(s[0]!, s[1]!, s[2]!, s[3]!, s[4]!, s[5]!));
  const pads: JumpPad[] = reactorMap.pads.map((p) => ({
    aabb: aabb(p.min[0]!, p.min[1]!, p.min[2]!, p.max[0]!, p.max[1]!, p.max[2]!),
    vx: p.vx,
    vy: p.vy,
    vz: p.vz,
  }));
  for (const p of pads) lights.addPad(group, (p.aabb.minX + p.aabb.maxX) / 2, (p.aabb.minZ + p.aabb.maxZ) / 2, p.aabb.maxY);
  lights.addFill(group, 0, 3.2, 0, 0xff4a3a, 1.6, 18);
  lights.addFill(group, 0, -9, 0, 0x2ee0c8, 1.1, 30);

  const items: ItemPad[] = (reactorMap.items as Array<ItemPad & { kind: string }>).map((it) => ({ ...it, kind: it.kind as ItemKind }));
  const spawns: Spawn[] = (reactorMap.spawns as Spawn[]).map((s) => ({ ...s }));
  const waypoints = reactorMap.waypoints.map((w) => ({ ...w }));

  const skyGeo = skySphereGeo();
  const skyMat = new THREE.MeshBasicMaterial({
    map: loadSpaceSky("lave"),
    color: 0xb8c4ff,
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
  scene.add(group);

  return {
    group,
    solids,
    pads,
    items,
    spawns,
    waypoints,
    lights,
    killY: -8,
    botLedgeGuard: true,
    menuOrbit: { radius: 46, height: 24, lookY: 2.2 },
    dispose: () => {
      for (const id of timers) window.clearInterval(id);
      scene.remove(group);
      scene.remove(sky);
      lights.dispose();
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
    },
  };
}

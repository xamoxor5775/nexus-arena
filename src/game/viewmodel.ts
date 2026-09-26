import * as THREE from "three";
import type { WeaponId } from "./types";
import { WEAPON_META } from "./constants";
import { gunMetalTex, pixelWeaponTex } from "./textures";

const LAYER = 1;

type PackMaps = {
  steel: THREE.Texture;
  rough: THREE.Texture;
  grip: THREE.Texture;
  heat: THREE.Texture;
  ceramic: THREE.Texture;
};

let packMaps: PackMaps | null = null;

function pack(): PackMaps {
  if (!packMaps) {
    const rough = gunMetalTex(2.6, 1.5);
    rough.colorSpace = THREE.NoColorSpace;
    packMaps = {
      steel: pixelWeaponTex("steel", 2.2, 1.4),
      rough,
      grip: pixelWeaponTex("grip", 2.6, 2.6),
      heat: pixelWeaponTex("heat", 1.8, 3.2),
      ceramic: pixelWeaponTex("steel", 2.1, 2.1),
    };
    packMaps.steel.anisotropy = 8;
    packMaps.steel.colorSpace = THREE.SRGBColorSpace;
  }
  return packMaps;
}

function steel(color: number, metal = 0.92, rough = 0.16, map = true) {
  const tex = pack();
  return new THREE.MeshStandardMaterial({
    color,
    map: map ? tex.steel : null,
    roughnessMap: map ? tex.rough : null,
    metalness: metal,
    roughness: rough,
    envMapIntensity: 1.48,
  });
}

function polymer(color = 0x2a3036) {
  return new THREE.MeshStandardMaterial({
    color,
    map: pack().grip,
    metalness: 0.14,
    roughness: 0.72,
    envMapIntensity: 0.28,
  });
}

function lamp(color: number, em = 1.55) {
  const heat = pack().heat;
  return new THREE.MeshStandardMaterial({
    color,
    map: heat,
    emissive: color,
    emissiveMap: heat,
    emissiveIntensity: em,
    metalness: 0.22,
    roughness: 0.22,
    toneMapped: true,
  });
}

function tag(obj: THREE.Object3D) {
  obj.layers.set(LAYER);
  obj.castShadow = false;
  obj.receiveShadow = false;
  obj.traverse((c) => c.layers.set(LAYER));
  return obj;
}

function box(mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  return tag(m);
}

function cyl(
  mat: THREE.Material,
  rTop: number,
  rBot: number,
  h: number,
  x: number,
  y: number,
  z: number,
  segs = 12,
  rx = Math.PI / 2,
) {
  const geo = new THREE.CylinderGeometry(rTop, rBot, h, segs);
  if (rx) geo.rotateX(rx);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return tag(m);
}

function ring(mat: THREE.Material, r: number, t: number, x: number, y: number, z: number, rx = Math.PI / 2) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, t, 7, 16), mat);
  m.position.set(x, y, z);
  m.rotation.x = rx;
  return tag(m);
}

function cone(mat: THREE.Material, r: number, h: number, x: number, y: number, z: number) {
  const geo = new THREE.ConeGeometry(r, h, 12);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return tag(m);
}

function sphere(mat: THREE.Material, r: number, x: number, y: number, z: number, seg = 14) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg), mat);
  m.position.set(x, y, z);
  return tag(m);
}

function cap(
  mat: THREE.Material,
  r: number,
  len: number,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
  segs = 14,
) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, segs), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  return tag(m);
}

type Kit = {
  body: THREE.Material;
  dark: THREE.Material;
  chrome: THREE.Material;
  grip: THREE.Material;
  glove: THREE.Material;
  accent: THREE.Material;
};

function picatinny(mat: THREE.Material, len: number, y: number, z: number) {
  const g = new THREE.Group();
  g.add(box(mat, 0.034, 0.01, len, 0, y, z));
  const n = Math.max(4, Math.round(len / 0.028));
  for (let i = 0; i < n; i++) {
    g.add(box(mat, 0.042, 0.01, 0.01, 0, y + 0.009, z - len * 0.45 + i * (len / (n - 1))));
  }
  return tag(g);
}

function trigger(k: Kit) {
  const g = new THREE.Group();
  g.add(box(k.dark, 0.072, 0.016, 0.09, 0, -0.038, 0.05));
  g.add(box(k.chrome, 0.01, 0.028, 0.018, 0, -0.058, 0.078, 0.35));
  g.add(box(k.dark, 0.008, 0.046, 0.07, 0.028, -0.062, 0.06));
  g.add(box(k.dark, 0.008, 0.046, 0.07, -0.028, -0.062, 0.06));
  g.add(box(k.dark, 0.06, 0.008, 0.02, 0, -0.086, 0.088));
  return tag(g);
}

function pistolGrip(k: Kit) {
  const g = new THREE.Group();
  g.add(box(k.grip, 0.05, 0.16, 0.066, 0, -0.125, 0.078, 0.42));
  g.add(box(k.grip, 0.046, 0.04, 0.058, 0, -0.2, 0.108, 0.15));
  g.add(box(k.dark, 0.054, 0.018, 0.04, 0, -0.155, 0.05, 0.42));
  g.add(box(k.chrome, 0.02, 0.012, 0.02, 0.028, -0.1, 0.09));
  return tag(g);
}

function stock(k: Kit, z = 0.28) {
  const g = new THREE.Group();
  g.add(box(k.dark, 0.04, 0.04, 0.16, 0, 0.02, z));
  g.add(box(k.grip, 0.05, 0.09, 0.04, 0, -0.01, z + 0.09));
  g.add(box(k.dark, 0.062, 0.11, 0.022, 0, -0.01, z + 0.112));
  return tag(g);
}

function irons(k: Kit, frontZ: number, rearZ: number, y = 0.09) {
  const g = new THREE.Group();
  g.add(box(k.dark, 0.028, 0.028, 0.028, 0, y, rearZ));
  g.add(box(k.chrome, 0.006, 0.02, 0.006, 0, y + 0.02, rearZ));
  g.add(box(k.dark, 0.018, 0.034, 0.018, 0, y + 0.008, frontZ));
  g.add(box(k.accent, 0.006, 0.01, 0.006, 0, y + 0.028, frontZ));
  return tag(g);
}

function optic(k: Kit, z = 0.02) {
  const g = new THREE.Group();
  g.add(box(k.dark, 0.028, 0.022, 0.07, 0, 0.092, z));
  g.add(cyl(k.dark, 0.012, 0.012, 0.055, 0, 0.104, z - 0.01, 10));
  g.add(cyl(k.accent, 0.008, 0.008, 0.01, 0, 0.104, z - 0.04, 10));
  return tag(g);
}

function glove(k: Kit, side: 1 | -1 = 1) {
  const g = new THREE.Group();
  const s = side;
  g.add(box(k.glove, 0.086, 0.052, 0.11, 0.068 * s, -0.118, 0.086, 0.32));
  g.add(box(k.glove, 0.054, 0.042, 0.074, 0.06 * s, -0.168, 0.118, 0.18));
  g.add(box(k.dark, 0.09, 0.018, 0.04, 0.068 * s, -0.1, 0.07));
  for (let i = 0; i < 4; i++) {
    const fy = -0.086 - i * 0.02;
    g.add(box(k.glove, 0.02, 0.016, 0.056, 0.04 * s, fy, 0.036, 0.12, 0, 0.38 * s));
    g.add(box(k.chrome, 0.012, 0.01, 0.014, 0.05 * s, fy, 0.01));
  }
  g.add(box(k.glove, 0.022, 0.02, 0.05, 0.014 * s, -0.072, 0.118, 0.08, 0.42 * s, 0.18));
  g.add(box(k.accent, 0.016, 0.01, 0.03, 0.078 * s, -0.108, 0.1));
  return tag(g);
}

function sleeve(k: Kit, side: 1 | -1 = 1) {
  const g = new THREE.Group();
  g.name = "vm-sleeve";
  const s = side;
  g.add(cyl(k.glove, 0.038, 0.048, 0.16, 0.078 * s, -0.2, 0.16, 10, 1.05));
  g.add(box(k.dark, 0.08, 0.036, 0.07, 0.078 * s, -0.14, 0.132, 0.35));
  g.add(box(k.accent, 0.012, 0.04, 0.05, 0.11 * s, -0.16, 0.14));
  g.add(glove(k, side));
  return tag(g);
}

function flashMat() {
  return new THREE.MeshBasicMaterial({
    color: 0xfff3d0,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
}

function flash(id: WeaponId) {
  const g = new THREE.Group();
  g.name = "muzzle";
  const s = id === "scatter" ? 0.11 : id === "torpedo" ? 0.13 : id === "lance" ? 0.07 : id === "ion" ? 0.08 : 0.12;
  const core = new THREE.Mesh(new THREE.SphereGeometry(s * 0.55, 10, 8), flashMat());
  const blade = new THREE.Mesh(new THREE.PlaneGeometry(s * 3.4, s * 1.15), flashMat());
  const blade2 = new THREE.Mesh(new THREE.PlaneGeometry(s * 1.2, s * 3.1), flashMat());
  blade.rotation.y = Math.PI / 2;
  g.add(core, blade, blade2);
  const z = id === "lance" ? -0.82 : id === "torpedo" ? -0.56 : id === "ion" ? -0.42 : id === "scatter" ? -0.52 : -0.42;
  const y = id === "torpedo" ? 0.06 : id === "ion" || id === "scatter" || id === "lance" ? 0.036 : 0.052;
  g.position.set(0, y, z);
  return tag(g);
}

function buildPulse(k: Kit) {
  const g = new THREE.Group();
  g.add(cap(k.body, 0.03, 0.26, 0, 0.078, -0.02, Math.PI / 2, 0, 0, 18));
  g.add(cyl(k.body, 0.036, 0.036, 0.24, 0, 0.078, -0.02, 22));
  g.add(sphere(k.body, 0.032, 0, 0.076, 0.128, 16));
  g.add(sphere(k.body, 0.03, 0, 0.076, -0.16, 16));
  g.add(cyl(k.chrome, 0.015, 0.017, 0.3, 0, 0.05, -0.2, 20));
  g.add(cyl(k.dark, 0.021, 0.018, 0.038, 0, 0.05, -0.35, 16));
  g.add(ring(k.chrome, 0.022, 0.0042, 0, 0.05, -0.332));
  g.add(ring(k.chrome, 0.02, 0.0034, 0, 0.05, -0.312));
  g.add(cap(k.dark, 0.02, 0.16, 0, 0.03, 0.02, Math.PI / 2, 0, 0, 14));
  g.add(sphere(k.dark, 0.022, 0, 0.028, 0.118, 12));
  g.add(cap(k.grip, 0.026, 0.11, 0, -0.118, 0.1, 0.55, 0, 0, 16));
  g.add(sphere(k.grip, 0.028, 0, -0.198, 0.142, 14));
  g.add(cyl(k.chrome, 0.024, 0.024, 0.012, 0, -0.204, 0.146, 14, 0.2));
  g.add(cyl(k.dark, 0.022, 0.022, 0.01, 0, -0.132, 0.082, 12, 0.55));
  g.add(cyl(k.dark, 0.022, 0.022, 0.01, 0, -0.162, 0.1, 12, 0.55));
  const guard = ring(k.chrome, 0.04, 0.0055, 0, -0.008, 0.018, 0);
  guard.rotation.y = Math.PI / 2;
  guard.scale.set(1, 1.22, 0.72);
  g.add(guard);
  g.add(cap(k.chrome, 0.0045, 0.026, 0, -0.02, 0.014, 0.28, 0, 0, 8));
  g.add(cyl(k.dark, 0.007, 0.007, 0.02, 0, 0.116, 0.118, 10, 0));
  g.add(cyl(k.dark, 0.0045, 0.0045, 0.026, 0, 0.122, -0.155, 10, 0));
  g.add(sphere(k.accent, 0.0042, 0, 0.138, -0.155, 8));
  g.add(cyl(k.chrome, 0.008, 0.008, 0.05, 0.034, 0.062, 0.02, 10, 0));
  g.add(cyl(k.chrome, 0.008, 0.008, 0.05, -0.034, 0.062, 0.02, 10, 0));
  const pins: [number, number][] = [
    [0.02, 0.042],
    [0.02, -0.012],
    [-0.04, 0.048],
    [0.1, 0.028],
  ];
  for (const [z, y] of pins) {
    const p = cyl(k.chrome, 0.0042, 0.0042, 0.078, 0, y, z, 10, 0);
    p.rotation.z = Math.PI / 2;
    g.add(p);
  }
  g.add(cyl(k.dark, 0.005, 0.005, 0.018, 0, 0.05, -0.368, 8));
  return g;
}

function buildScatter(k: Kit) {
  const g = new THREE.Group();
  g.add(box(k.body, 0.14, 0.11, 0.32, 0, 0.034, 0.04));
  g.add(box(k.dark, 0.13, 0.045, 0.26, 0, -0.022, 0.0));
  g.add(cyl(k.chrome, 0.028, 0.032, 0.4, 0.036, 0.042, -0.26, 12));
  g.add(cyl(k.chrome, 0.028, 0.032, 0.4, -0.036, 0.042, -0.26, 12));
  g.add(cyl(k.dark, 0.036, 0.036, 0.08, 0.036, 0.042, -0.48, 10));
  g.add(cyl(k.dark, 0.036, 0.036, 0.08, -0.036, 0.042, -0.48, 10));
  g.add(box(k.dark, 0.12, 0.05, 0.08, 0, 0.04, -0.08));
  g.add(box(k.dark, 0.128, 0.032, 0.24, 0, 0.09, -0.04));
  g.add(picatinny(k.chrome, 0.2, 0.11, 0.0));
  g.add(box(k.grip, 0.11, 0.04, 0.14, 0, -0.058, -0.12));
  g.add(box(k.chrome, 0.12, 0.014, 0.09, 0, -0.08, -0.12));
  g.add(box(k.accent, 0.1, 0.016, 0.055, 0, 0.108, 0.1));
  g.add(box(k.dark, 0.045, 0.055, 0.055, 0.074, 0.02, 0.14));
  g.add(irons(k, -0.34, 0.14, 0.108));
  g.add(trigger(k));
  g.add(pistolGrip(k));
  g.add(stock(k, 0.26));
  g.add(sleeve(k, 1));
  g.add(sleeve(k, -1));
  return g;
}

function buildTorpedo(k: Kit) {
  const g = new THREE.Group();
  g.add(cyl(k.body, 0.062, 0.066, 0.6, 0, 0.062, -0.08, 14));
  g.add(cyl(k.dark, 0.07, 0.07, 0.11, 0, 0.062, 0.2, 14));
  g.add(cyl(k.chrome, 0.052, 0.046, 0.1, 0, 0.062, -0.4, 14));
  g.add(cone(k.dark, 0.082, 0.11, 0, 0.062, -0.5));
  g.add(ring(k.chrome, 0.07, 0.009, 0, 0.062, -0.16));
  g.add(ring(k.accent, 0.064, 0.008, 0, 0.062, -0.02));
  g.add(box(k.body, 0.13, 0.095, 0.22, 0, 0.012, 0.22));
  g.add(box(k.dark, 0.085, 0.075, 0.13, 0.095, 0.085, 0.04));
  g.add(box(k.accent, 0.055, 0.032, 0.065, 0.11, 0.128, 0.04));
  g.add(cyl(k.dark, 0.016, 0.016, 0.09, 0.11, 0.128, -0.04, 8));
  g.add(box(k.accent, 0.02, 0.045, 0.3, 0.068, 0.062, -0.08));
  g.add(box(k.dark, 0.04, 0.05, 0.16, 0, 0.12, 0.04));
  g.add(trigger(k));
  g.add(pistolGrip(k));
  g.add(box(k.grip, 0.05, 0.085, 0.055, 0.095, -0.02, 0.14));
  g.add(stock(k, 0.34));
  g.add(sleeve(k, 1));
  g.add(sleeve(k, -1));
  return g;
}

function buildLance(k: Kit) {
  const g = new THREE.Group();
  g.add(box(k.body, 0.066, 0.074, 0.3, 0, 0.032, 0.06));
  g.add(cyl(k.chrome, 0.013, 0.016, 0.92, 0, 0.04, -0.38, 12));
  g.add(cyl(k.dark, 0.022, 0.024, 0.22, 0, 0.04, -0.1, 12));
  g.add(ring(k.accent, 0.032, 0.006, 0, 0.04, -0.2));
  g.add(ring(k.accent, 0.028, 0.006, 0, 0.04, -0.4));
  g.add(ring(k.accent, 0.024, 0.005, 0, 0.04, -0.58));
  g.add(cyl(k.chrome, 0.02, 0.015, 0.055, 0, 0.04, -0.82, 10));
  g.add(box(k.accent, 0.01, 0.01, 0.7, 0.02, 0.052, -0.28));
  g.add(picatinny(k.chrome, 0.22, 0.076, 0.02));
  g.add(optic(k, 0.04));
  g.add(box(k.dark, 0.074, 0.058, 0.13, 0, 0.0, 0.2));
  g.add(box(k.accent, 0.04, 0.044, 0.075, 0, 0.02, 0.22));
  g.add(box(k.dark, 0.052, 0.085, 0.11, 0, -0.02, 0.16));
  g.add(irons(k, -0.52, 0.14, 0.082));
  g.add(trigger(k));
  g.add(pistolGrip(k));
  g.add(stock(k, 0.32));
  g.add(sleeve(k, 1));
  g.add(sleeve(k, -1));
  return g;
}

function buildIon(k: Kit) {
  const g = new THREE.Group();
  g.add(box(k.body, 0.1, 0.086, 0.24, 0, 0.022, 0.1));
  g.add(sphere(k.accent, 0.062, 0, 0.054, -0.02, 16));
  g.add(ring(k.chrome, 0.076, 0.009, 0, 0.054, -0.02, 0));
  g.add(ring(k.chrome, 0.076, 0.009, 0, 0.054, -0.02, Math.PI / 2));
  g.add(cyl(k.dark, 0.032, 0.038, 0.26, 0, 0.042, -0.22, 12));
  g.add(ring(k.accent, 0.04, 0.007, 0, 0.042, -0.16));
  g.add(ring(k.accent, 0.036, 0.007, 0, 0.042, -0.3));
  g.add(cone(k.chrome, 0.034, 0.06, 0, 0.042, -0.38));
  g.add(box(k.dark, 0.085, 0.022, 0.15, 0, 0.082, 0.08));
  g.add(box(k.accent, 0.05, 0.014, 0.055, 0, 0.098, 0.1));
  g.add(picatinny(k.chrome, 0.13, 0.096, 0.1));
  g.add(box(k.chrome, 0.04, 0.03, 0.04, 0.06, 0.04, 0.16));
  g.add(trigger(k));
  g.add(pistolGrip(k));
  g.add(stock(k, 0.26));
  g.add(sleeve(k));
  return g;
}

/** Placas, disipadores y guía de energía comunes: elevan la lectura sin aumentar polígonos de forma apreciable. */
function pixelProSkin(g: THREE.Group, k: Kit, id: WeaponId) {
  const spec = id === "lance"
    ? { width: 0.078, length: 0.58, z: -0.22 }
    : id === "torpedo"
      ? { width: 0.11, length: 0.42, z: -0.13 }
      : id === "scatter"
        ? { width: 0.145, length: 0.34, z: -0.06 }
        : id === "ion"
          ? { width: 0.105, length: 0.3, z: -0.08 }
          : { width: 0.062, length: 0.24, z: -0.04 };
  const side = spec.width * 0.56;
  const skin = new THREE.Group();
  skin.name = "pixel-pro-skin";
  for (const s of [-1, 1] as const) {
    skin.add(box(k.dark, 0.012, 0.05, spec.length, side * s, 0.057, spec.z));
    skin.add(box(k.accent, 0.007, 0.012, spec.length * 0.72, side * 1.16 * s, 0.072, spec.z - 0.008));
  }
  for (let i = 0; i < 5; i++) {
    const z = spec.z + spec.length * 0.36 - i * (spec.length * 0.15);
    skin.add(box(k.chrome, spec.width * 0.72, 0.008, 0.012, 0, 0.098, z));
  }
  skin.add(box(k.accent, spec.width * 0.5, 0.015, 0.034, 0, 0.085, spec.z + spec.length * 0.28));
  skin.add(box(k.chrome, 0.018, 0.02, 0.025, 0, 0.11, spec.z - spec.length * 0.34));
  g.add(skin);
  return g;
}

export function buildViewmodel(id: WeaponId): THREE.Group {
  const col = WEAPON_META[id].color;
  const k: Kit = {
    dark: new THREE.MeshStandardMaterial({
      color: 0x4a545e,
      map: pack().steel,
      roughnessMap: pack().rough,
      metalness: 0.62,
      roughness: 0.34,
      envMapIntensity: 0.95,
    }),
    body: steel(0xd0d8e0, 0.94, 0.14),
    chrome: steel(0xeef3f8, 0.98, 0.055),
    grip: polymer(0x2c3238),
    glove: polymer(0x3a3330),
    accent: lamp(col, id === "ion" || id === "lance" ? 1.85 : 1.4),
  };
  const g = new THREE.Group();
  if (id === "pulse") {
    const gun = buildPulse(k);
    gun.scale.setScalar(0.56);
    g.add(gun, sleeve(k));
  } else {
    g.add(id === "scatter" ? buildScatter(k) : id === "torpedo" ? buildTorpedo(k) : id === "lance" ? buildLance(k) : buildIon(k));
  }
  const weaponBody = g.children[0] as THREE.Group | undefined;
  if (weaponBody) pixelProSkin(weaponBody, k, id);
  const muzzle = flash(id);
  if (id === "pulse") {
    muzzle.scale.setScalar(0.56);
    muzzle.position.multiplyScalar(0.56);
  }
  g.add(muzzle);
  g.layers.set(LAYER);
  g.rotation.y = 0.02;
  g.rotation.z = -0.018;
  return g;
}

export function restPose(id: WeaponId): THREE.Vector3 {
  if (id === "lance") return new THREE.Vector3(0.248, -0.172, -0.52);
  if (id === "torpedo") return new THREE.Vector3(0.255, -0.2, -0.48);
  if (id === "scatter") return new THREE.Vector3(0.25, -0.18, -0.46);
  if (id === "ion") return new THREE.Vector3(0.236, -0.158, -0.42);
  return new THREE.Vector3(0.22, -0.16, -0.46);
}

export function adsPose(id: WeaponId): THREE.Vector3 {
  if (id === "lance") return new THREE.Vector3(0.02, -0.255, -0.64);
  if (id === "torpedo") return new THREE.Vector3(0.028, -0.275, -0.6);
  if (id === "scatter") return new THREE.Vector3(0.022, -0.26, -0.58);
  if (id === "ion") return new THREE.Vector3(0.02, -0.24, -0.6);
  return new THREE.Vector3(0.01, -0.09, -0.5);
}

export function buildWorldGun(
  gunMat: THREE.Material,
  dark: THREE.Material,
  glowMat: THREE.Material,
  style: WeaponId = "pulse",
): THREE.Group {
  const g = new THREE.Group();
  if (style === "scatter") {
    const rec = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.22), gunMat);
    rec.position.set(0, 0.02, 0.08);
    const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.32, 8), gunMat);
    b1.rotation.x = Math.PI / 2;
    b1.position.set(0.028, 0.025, -0.12);
    const b2 = b1.clone();
    b2.position.x = -0.028;
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.1), dark);
    mag.position.set(0, -0.05, 0.02);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.045), dark);
    grip.position.set(0, -0.07, 0.12);
    grip.rotation.x = 0.35;
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.035, 0.06), glowMat);
    sight.position.set(0, 0.065, 0.02);
    g.add(rec, b1, b2, mag, grip, sight);
    return g;
  }
  if (style === "torpedo") {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.38, 10), gunMat);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, 0.04, -0.02);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.1, 8), dark);
    nose.rotation.x = -Math.PI / 2;
    nose.position.set(0, 0.04, -0.24);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.11, 0.05), dark);
    grip.position.set(0, -0.05, 0.12);
    grip.rotation.x = 0.3;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.01, 6, 12), glowMat);
    ring.position.set(0, 0.04, -0.08);
    g.add(tube, nose, grip, ring);
    return g;
  }
  if (style === "lance") {
    const rec = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, 0.16), gunMat);
    rec.position.set(0, 0.02, 0.1);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.55, 8), gunMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.025, -0.16);
    const rings = [ -0.04, -0.16, -0.28 ].map((z) => {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 5, 10), glowMat);
      r.position.set(0, 0.025, z);
      return r;
    });
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.1, 0.04), dark);
    grip.position.set(0, -0.06, 0.12);
    grip.rotation.x = 0.35;
    g.add(rec, barrel, grip, ...rings);
    return g;
  }
  if (style === "pulse") {
    const slide = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.16, 4, 10), gunMat);
    slide.rotation.x = Math.PI / 2;
    slide.position.set(0, 0.048, 0.02);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.012, 0.22, 12), gunMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.03, -0.1);
    const frame = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.1, 3, 8), dark);
    frame.rotation.x = Math.PI / 2;
    frame.position.set(0, 0.016, 0.04);
    const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.07, 3, 8), dark);
    grip.position.set(0, -0.055, 0.1);
    grip.rotation.x = 0.5;
    const sight = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), glowMat);
    sight.position.set(0, 0.072, -0.05);
    g.add(slide, barrel, frame, grip, sight);
    g.scale.setScalar(0.72);
    return g;
  }
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.44, 8), gunMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.025, -0.1);
  const rec = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.07, 0.2), gunMat);
  rec.position.set(0, 0.022, 0.12);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.14, 0.055), dark);
  mag.position.set(0, -0.08, 0.08);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.05, 0.13), dark);
  stock.position.set(0, 0.012, 0.25);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.038, 0.07), glowMat);
  sight.position.set(0, 0.068, 0.04);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.1, 0.042), dark);
  grip.position.set(0, -0.07, 0.14);
  grip.rotation.x = 0.35;
  const brake = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.02, 0.04, 8), dark);
  brake.rotation.x = Math.PI / 2;
  brake.position.set(0, 0.025, -0.32);
  g.add(barrel, rec, mag, stock, sight, grip, brake);
  return g;
}

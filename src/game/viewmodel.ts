import * as THREE from "three";
import type { WeaponId } from "./types";
import { WEAPON_META } from "./constants";
import { gunMetalTex, loadTex, pixelWeaponTex, weaponPlateFile } from "./textures";
import { hasViewPack, hasWeaponPack, mountPackView, mountPackWorld, packPose, packRotation } from "./weaponPack";

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
    packMaps.steel.anisotropy = 2;
    packMaps.steel.colorSpace = THREE.SRGBColorSpace;
  }
  return packMaps;
}

function plate(file: string, metal: number, rough: number, repeat = 2.35, tint = 0x8a9098, emit = 0.1) {
  const map = loadTex(`/textures/weapons/${file}`, repeat, repeat);
  map.anisotropy = 2;
  return new THREE.MeshStandardMaterial({
    color: tint,
    map,
    emissive: tint,
    emissiveMap: map,
    emissiveIntensity: emit,
    metalness: metal,
    roughness: rough,
    envMapIntensity: 0.48,
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
  const x = 0.068 * s;
  g.add(box(k.dark, 0.08, 0.046, 0.098, x, -0.116, 0.088, 0.3));
  g.add(box(k.chrome, 0.07, 0.01, 0.08, x, -0.09, 0.082, 0.3));
  g.add(box(k.dark, 0.074, 0.02, 0.028, x, -0.098, 0.046, 0.12));
  g.add(cyl(k.chrome, 0.026, 0.026, 0.016, x, -0.128, 0.122, 8, 0.45));
  g.add(box(k.accent, 0.022, 0.008, 0.032, x + 0.012 * s, -0.094, 0.092));
  for (let i = 0; i < 4; i++) {
    const fy = -0.084 - i * 0.019;
    const fx = 0.046 * s;
    g.add(box(k.dark, 0.018, 0.015, 0.034, fx, fy, 0.03, 0.12, 0, 0.34 * s));
    g.add(cyl(k.chrome, 0.0065, 0.0065, 0.012, fx, fy, 0.012, 6, 0));
    g.add(box(k.dark, 0.015, 0.013, 0.026, fx - 0.004 * s, fy - 0.004, 0.0, 0.2, 0, 0.42 * s));
    g.add(box(k.chrome, 0.01, 0.008, 0.01, fx - 0.006 * s, fy - 0.006, -0.014, 0.15, 0, 0.42 * s));
  }
  g.add(box(k.dark, 0.02, 0.018, 0.042, 0.018 * s, -0.074, 0.112, 0.08, 0.48 * s, 0.16));
  g.add(cyl(k.chrome, 0.007, 0.007, 0.012, 0.012 * s, -0.068, 0.128, 6, 0.2));
  g.add(box(k.dark, 0.016, 0.014, 0.028, 0.006 * s, -0.062, 0.142, 0.04, 0.55 * s, 0.1));
  g.add(box(k.accent, 0.01, 0.008, 0.012, 0.004 * s, -0.056, 0.156));
  return tag(g);
}

function sleeve(k: Kit, side: 1 | -1 = 1) {
  const g = new THREE.Group();
  g.name = "vm-sleeve";
  const s = side;
  const x = 0.078 * s;
  g.add(cyl(k.dark, 0.03, 0.042, 0.15, x, -0.198, 0.158, 8, 1.08));
  g.add(box(k.chrome, 0.07, 0.028, 0.062, x, -0.148, 0.128, 0.32));
  g.add(box(k.dark, 0.078, 0.012, 0.08, x, -0.168, 0.142, 0.32));
  g.add(box(k.accent, 0.01, 0.046, 0.055, x + 0.034 * s, -0.162, 0.138));
  g.add(cyl(k.chrome, 0.022, 0.022, 0.014, x, -0.232, 0.182, 8, 1.08));
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
  const s = id === "scatter" ? 0.11 : id === "fauces" ? 0.14 : id === "torpedo" ? 0.13 : id === "lance" ? 0.07 : id === "ion" ? 0.08 : 0.12;
  const core = new THREE.Mesh(new THREE.SphereGeometry(s * 0.55, 10, 8), flashMat());
  const blade = new THREE.Mesh(new THREE.PlaneGeometry(s * 3.4, s * 1.15), flashMat());
  const blade2 = new THREE.Mesh(new THREE.PlaneGeometry(s * 1.2, s * 3.1), flashMat());
  blade.rotation.y = Math.PI / 2;
  g.add(core, blade, blade2);
  const z = id === "lance" ? -0.82 : id === "fauces" ? -0.36 : id === "torpedo" ? -0.4 : id === "ion" ? -0.42 : id === "scatter" ? -0.52 : -0.42;
  const y = id === "fauces" ? 0.05 : id === "torpedo" ? 0.046 : id === "ion" || id === "scatter" || id === "lance" ? 0.036 : 0.052;
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
  g.add(box(k.body, 0.16, 0.11, 0.26, 0, 0.04, 0.04));
  g.add(box(k.dark, 0.15, 0.028, 0.2, 0, 0.102, 0.02));
  g.add(box(k.body, 0.125, 0.1, 0.16, 0, 0.046, -0.16));
  g.add(box(k.dark, 0.078, 0.055, 0.07, 0, 0.042, -0.26));
  g.add(box(k.chrome, 0.1, 0.018, 0.04, 0, 0.078, -0.3));
  g.add(box(k.chrome, 0.1, 0.016, 0.036, 0, 0.012, -0.3));
  for (let i = 0; i < 5; i++) {
    const x = -0.036 + i * 0.018;
    g.add(box(k.chrome, 0.012, 0.02, 0.022, x, 0.07, -0.318, 0.35));
    g.add(box(k.chrome, 0.012, 0.016, 0.02, x, 0.016, -0.312, -0.3));
  }
  const port = cyl(k.dark, 0.028, 0.028, 0.02, 0.09, 0.048, 0.03, 14, 0);
  port.rotation.z = Math.PI / 2;
  g.add(port);
  const bezel = ring(k.chrome, 0.032, 0.005, 0.098, 0.048, 0.03, 0);
  bezel.rotation.y = Math.PI / 2;
  g.add(bezel);
  g.add(box(k.dark, 0.04, 0.07, 0.1, -0.09, 0.05, 0.02));
  g.add(box(k.accent, 0.012, 0.04, 0.06, 0.078, 0.09, -0.08));
  const cableTints = [k.accent, k.chrome, k.dark, k.grip];
  for (let i = 0; i < cableTints.length; i++) {
    g.add(box(cableTints[i]!, 0.008, 0.008, 0.14, -0.028 + i * 0.016, 0.122, 0.06));
  }
  g.add(box(k.dark, 0.05, 0.04, 0.08, 0.07, 0.02, 0.14));
  g.add(trigger(k));
  g.add(pistolGrip(k));
  g.add(stock(k, 0.28));
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

function buildFauces(k: Kit) {
  const g = new THREE.Group();
  g.add(box(k.body, 0.16, 0.13, 0.22, 0, 0.045, 0.04));
  g.add(box(k.dark, 0.018, 0.16, 0.16, 0.088, 0.05, 0.02));
  g.add(box(k.body, 0.13, 0.038, 0.18, 0, 0.095, -0.16));
  g.add(box(k.body, 0.13, 0.032, 0.18, 0, 0.004, -0.16));
  for (let i = 0; i < 4; i++) {
    const x = -0.045 + i * 0.03;
    g.add(box(k.chrome, 0.016, 0.028, 0.02, x, 0.072, -0.25, 0.4));
    g.add(box(k.chrome, 0.016, 0.024, 0.018, x, 0.02, -0.246, -0.35));
  }
  g.add(cyl(k.dark, 0.028, 0.034, 0.08, 0, 0.05, -0.28, 12));
  g.add(sphere(k.accent, 0.016, 0, 0.05, -0.3, 10));
  const port = cyl(k.dark, 0.026, 0.026, 0.018, 0.1, 0.05, 0.02, 12, 0);
  port.rotation.z = Math.PI / 2;
  g.add(port);
  const bezel = ring(k.chrome, 0.03, 0.005, 0.108, 0.05, 0.02, 0);
  bezel.rotation.y = Math.PI / 2;
  g.add(bezel);
  g.add(box(k.accent, 0.008, 0.008, 0.12, 0.02, 0.118, 0.04));
  g.add(box(k.chrome, 0.008, 0.008, 0.12, 0.034, 0.112, 0.05));
  g.add(box(k.grip, 0.008, 0.008, 0.11, 0.048, 0.104, 0.06));
  g.add(box(k.dark, 0.07, 0.05, 0.08, 0.02, 0.02, 0.14));
  g.add(trigger(k));
  g.add(pistolGrip(k));
  g.add(stock(k, 0.26));
  g.add(sleeve(k, 1));
  g.add(sleeve(k, -1));
  return g;
}

function buildKnife(k: Kit) {
  const g = new THREE.Group();
  g.add(box(k.grip, 0.03, 0.034, 0.12, 0, 0.02, 0.1));
  g.add(box(k.chrome, 0.016, 0.09, 0.38, 0, 0.055, -0.12));
  g.add(box(k.chrome, 0.012, 0.045, 0.05, 0, 0.04, -0.32));
  g.add(box(k.dark, 0.028, 0.018, 0.04, 0, 0.04, 0.02));
  g.add(trigger(k));
  return g;
}

function buildBate(k: Kit) {
  const g = new THREE.Group();
  g.add(cyl(k.grip, 0.018, 0.022, 0.28, 0, 0.04, 0.02, 10));
  g.add(cyl(k.body, 0.028, 0.034, 0.34, 0, 0.05, -0.22, 12));
  g.add(sphere(k.body, 0.036, 0, 0.05, -0.4, 12));
  g.add(box(k.dark, 0.02, 0.02, 0.04, 0, 0.03, 0.14));
  return g;
}

function buildMartillo(k: Kit) {
  const g = new THREE.Group();
  g.add(cyl(k.grip, 0.016, 0.02, 0.32, 0, 0.03, -0.02, 10));
  g.add(box(k.chrome, 0.11, 0.07, 0.07, 0, 0.04, -0.2));
  g.add(box(k.dark, 0.07, 0.045, 0.05, 0, 0.04, -0.2));
  g.add(box(k.grip, 0.03, 0.02, 0.04, 0, 0.02, 0.14));
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

const WEAPON_TINT: Record<WeaponId, { body: number; dark: number; chrome: number; grip: number }> = {
  pulse: { body: 0x7a6224, dark: 0x26282c, chrome: 0x1e5c56, grip: 0x5a4416 },
  scatter: { body: 0x6e1410, dark: 0x220c0c, chrome: 0x5c1c14, grip: 0x42100c },
  torpedo: { body: 0x6d6758, dark: 0x2c2a26, chrome: 0x8a8172, grip: 0x3e382c },
  lance: { body: 0x0c3836, dark: 0x120e1c, chrome: 0x105854, grip: 0x102232 },
  ion: { body: 0x0e3250, dark: 0x0a1828, chrome: 0x144860, grip: 0x0e2434 },
  fauces: { body: 0xc4b7a4, dark: 0x6a6458, chrome: 0xd5d8dc, grip: 0x7a7064 },
  knife: { body: 0xbcc8d4, dark: 0x3a4048, chrome: 0xa9d6df, grip: 0x2a2420 },
  bate: { body: 0xa99b88, dark: 0x4a3018, chrome: 0xc0b9ae, grip: 0x8a5a2c },
  martillo: { body: 0x8e969e, dark: 0x2c3138, chrome: 0xd0d6dc, grip: 0x5a4634 },
};

const VM_SCALE: Record<WeaponId, number> = {
  pulse: 0.5,
  scatter: 0.7,
  torpedo: 0.66,
  lance: 0.72,
  ion: 0.68,
  fauces: 0.74,
  knife: 0.86,
  bate: 0.8,
  martillo: 0.78,
};

/** `skinId` previews a specific desktop skin (default: the selected one). */
export function buildViewmodel(id: WeaponId, accent = WEAPON_META[id].color, skinId?: string): THREE.Group {
  const col = accent;
  const tint = WEAPON_TINT[id];
  const k: Kit = {
    dark: plate(weaponPlateFile(id, "dark"), 0.34, 0.56, 2.6, tint.dark, 0.05),
    body: plate(weaponPlateFile(id, "body"), 0.16, 0.48, 2.15, tint.body, 0.16),
    chrome: plate(weaponPlateFile(id, "chrome"), 0.52, 0.34, id === "knife" ? 1.15 : 2.8, tint.chrome, id === "knife" ? 0.12 : 0.22),
    grip: plate(weaponPlateFile(id, "grip"), 0.1, 0.74, 3.1, tint.grip, 0.06),
    glove: plate(weaponPlateFile(id, "dark"), 0.5, 0.38, 2.2, 0x3a424c, 0.06),
    accent: lamp(col, id === "ion" || id === "lance" ? 2.45 : 2.1),
  };
  const g = new THREE.Group();
  const muzzle = flash(id);
  g.add(muzzle);
  const fallback = new THREE.Group();
  fallback.name = "procedural-fallback";
  g.add(fallback);
  {
    const gun = id === "pulse"
      ? buildPulse(k)
      : id === "scatter"
        ? buildScatter(k)
        : id === "torpedo"
          ? buildTorpedo(k)
          : id === "lance"
            ? buildLance(k)
            : id === "fauces"
              ? buildFauces(k)
              : id === "knife"
                ? buildKnife(k)
                : id === "bate"
                  ? buildBate(k)
                  : id === "martillo"
                    ? buildMartillo(k)
                    : buildIon(k);
    fallback.add(gun);
    if (id === "pulse") fallback.add(sleeve(k));
    if (id !== "ion" && id !== "torpedo" && id !== "fauces" && id !== "knife" && id !== "bate" && id !== "martillo") pixelProSkin(gun, k, id);
  }
  g.scale.setScalar(VM_SCALE[id]);
  g.layers.set(LAYER);
  if (hasViewPack(id, skinId)) {
    // Imported models already have individual physical sizes; don't scale twice.
    g.scale.setScalar(1);
    fallback.scale.setScalar(VM_SCALE[id]);
    muzzle.position.multiplyScalar(VM_SCALE[id]);
    const slot = new THREE.Group();
    slot.name = "pack";
    g.add(slot);
    mountPackView(slot, id, muzzle, fallback, skinId);
    g.rotation.copy(packRotation(id, skinId));
  } else {
    g.rotation.y = 0.02;
    g.rotation.z = -0.018;
  }
  return g;
}

export function restPose(id: WeaponId): THREE.Vector3 {
  if (hasViewPack(id)) {
    return packPose(id);
  }
  if (id === "lance") return new THREE.Vector3(0.282, -0.228, -0.58);
  if (id === "torpedo") return new THREE.Vector3(0.29, -0.248, -0.54);
  if (id === "scatter") return new THREE.Vector3(0.286, -0.232, -0.52);
  if (id === "fauces") return new THREE.Vector3(0.3, -0.25, -0.5);
  if (id === "knife") return new THREE.Vector3(0.24, -0.16, -0.36);
  if (id === "bate") return new THREE.Vector3(0.28, -0.18, -0.4);
  if (id === "martillo") return new THREE.Vector3(0.3, -0.2, -0.42);
  if (id === "ion") return new THREE.Vector3(0.27, -0.21, -0.48);
  return new THREE.Vector3(0.258, -0.208, -0.52);
}

export function adsPose(id: WeaponId): THREE.Vector3 {
  if (hasViewPack(id)) {
    return packPose(id, true);
  }
  if (id === "lance") return new THREE.Vector3(0.02, -0.255, -0.64);
  if (id === "torpedo") return new THREE.Vector3(0.028, -0.275, -0.6);
  if (id === "scatter") return new THREE.Vector3(0.022, -0.26, -0.58);
  if (id === "fauces") return new THREE.Vector3(0.03, -0.27, -0.56);
  if (id === "knife") return new THREE.Vector3(0.16, -0.14, -0.32);
  if (id === "bate") return new THREE.Vector3(0.18, -0.16, -0.36);
  if (id === "martillo") return new THREE.Vector3(0.2, -0.18, -0.38);
  if (id === "ion") return new THREE.Vector3(0.02, -0.24, -0.6);
  return new THREE.Vector3(0.01, -0.09, -0.5);
}

export function buildWorldGun(
  _gunMat: THREE.Material,
  _dark: THREE.Material,
  glowMat: THREE.Material,
  style: WeaponId = "pulse",
): THREE.Group {
  if (hasWeaponPack(style)) {
    const g = new THREE.Group();
    const fallback = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.24), _gunMat);
    fallback.position.z = -0.08;
    g.add(fallback);
    const slot = new THREE.Group();
    slot.name = "pack";
    g.add(slot);
    mountPackWorld(slot, style, fallback);
    return g;
  }
  const tint = WEAPON_TINT[style];
  const skin = plate(weaponPlateFile(style, "body"), 0.18, 0.48, 2.2, tint.body, 0.14);
  const dark = plate(weaponPlateFile(style, "dark"), 0.34, 0.56, 2.5, tint.dark, 0.05);
  const gripMat = plate(weaponPlateFile(style, "grip"), 0.1, 0.74, 2.8, tint.grip, 0.06);
  const chrome = plate(weaponPlateFile(style, "chrome"), 0.52, 0.34, 2.6, tint.chrome, 0.18);
  const g = new THREE.Group();
  if (style === "scatter") {
    const rec = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.22), skin);
    rec.position.set(0, 0.02, 0.08);
    const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.32, 8), chrome);
    b1.rotation.x = Math.PI / 2;
    b1.position.set(0.028, 0.025, -0.12);
    const b2 = b1.clone();
    b2.position.x = -0.028;
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.1), dark);
    mag.position.set(0, -0.05, 0.02);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.045), gripMat);
    grip.position.set(0, -0.07, 0.12);
    grip.rotation.x = 0.35;
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.035, 0.06), glowMat);
    sight.position.set(0, 0.065, 0.02);
    g.add(rec, b1, b2, mag, grip, sight);
    return g;
  }
  if (style === "torpedo") {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.2), skin);
    body.position.set(0, 0.03, 0.04);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.1), dark);
    snout.position.set(0, 0.032, -0.1);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.045), gripMat);
    grip.position.set(0, -0.05, 0.12);
    grip.rotation.x = 0.3;
    const port = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.02, 10), glowMat);
    port.rotation.z = Math.PI / 2;
    port.position.set(0.06, 0.034, 0.02);
    const parts = [body, snout, grip, port];
    for (let i = 0; i < 4; i++) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.016, 0.016), chrome);
      tooth.position.set(-0.024 + i * 0.016, 0.058, -0.15);
      parts.push(tooth);
    }
    g.add(...parts);
    return g;
  }
  if (style === "lance") {
    const rec = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, 0.16), skin);
    rec.position.set(0, 0.02, 0.1);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.55, 8), chrome);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.025, -0.16);
    const rings = [ -0.04, -0.16, -0.28 ].map((z) => {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 5, 10), glowMat);
      r.position.set(0, 0.025, z);
      return r;
    });
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.1, 0.04), gripMat);
    grip.position.set(0, -0.06, 0.12);
    grip.rotation.x = 0.35;
    g.add(rec, barrel, grip, ...rings);
    return g;
  }
  if (style === "pulse") {
    const slide = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.16, 4, 10), skin);
    slide.rotation.x = Math.PI / 2;
    slide.position.set(0, 0.048, 0.02);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.012, 0.22, 12), chrome);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.03, -0.1);
    const frame = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.1, 3, 8), dark);
    frame.rotation.x = Math.PI / 2;
    frame.position.set(0, 0.016, 0.04);
    const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.07, 3, 8), gripMat);
    grip.position.set(0, -0.055, 0.1);
    grip.rotation.x = 0.5;
    const sight = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), glowMat);
    sight.position.set(0, 0.072, -0.05);
    g.add(slide, barrel, frame, grip, sight);
    g.scale.setScalar(0.72);
    return g;
  }
  if (style === "fauces") {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.16), skin);
    body.position.set(0, 0.03, 0.04);
    const jawHi = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.028, 0.12), dark);
    jawHi.position.set(0, 0.07, -0.08);
    const jawLo = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.024, 0.12), dark);
    jawLo.position.set(0, 0.0, -0.08);
    const bore = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), glowMat);
    bore.position.set(0, 0.034, -0.12);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.042), gripMat);
    grip.position.set(0, -0.05, 0.12);
    grip.rotation.x = 0.32;
    g.add(body, jawHi, jawLo, bore, grip);
    return g;
  }
  if (style === "knife" || style === "bate" || style === "martillo") {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, style === "bate" ? 0.42 : 0.28, 6), gripMat);
    handle.rotation.x = Math.PI / 2;
    const head = style === "knife"
      ? new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.07, 0.28), chrome)
      : style === "bate"
        ? new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.02, 0.22, 8), skin)
        : new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.06), chrome);
    if (style !== "knife") head.rotation.x = style === "bate" ? Math.PI / 2 : 0;
    head.position.set(0, 0.02, style === "martillo" ? -0.16 : -0.18);
    g.add(handle, head);
    return g;
  }
  if (style === "ion") {
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), glowMat);
    core.position.set(0, 0.045, -0.02);
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.012, 6, 14), glowMat);
    coil.position.copy(core.position);
    const coilB = coil.clone();
    coilB.rotation.y = Math.PI / 2;
    const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.026, 0.2, 8), chrome);
    snout.rotation.x = Math.PI / 2;
    snout.position.set(0, 0.045, -0.16);
    const cell = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.1), skin);
    cell.position.set(0, 0.02, 0.1);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.09, 0.04), gripMat);
    grip.position.set(0, -0.05, 0.12);
    grip.rotation.x = 0.4;
    g.add(core, coil, coilB, snout, cell, grip);
    return g;
  }
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.44, 8), chrome);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.025, -0.1);
  const rec = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.07, 0.2), skin);
  rec.position.set(0, 0.022, 0.12);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.14, 0.055), dark);
  mag.position.set(0, -0.08, 0.08);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.05, 0.13), dark);
  stock.position.set(0, 0.012, 0.25);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.038, 0.07), glowMat);
  sight.position.set(0, 0.068, 0.04);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.1, 0.042), gripMat);
  grip.position.set(0, -0.07, 0.14);
  grip.rotation.x = 0.35;
  const brake = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.02, 0.04, 8), chrome);
  brake.rotation.x = Math.PI / 2;
  brake.position.set(0, 0.025, -0.32);
  g.add(barrel, rec, mag, stock, sight, grip, brake);
  return g;
}

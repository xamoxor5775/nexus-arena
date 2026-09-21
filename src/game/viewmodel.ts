import * as THREE from "three";
import type { WeaponId } from "./types";
import { WEAPON_META } from "./constants";
import { loadTex } from "./textures";

const LAYER = 1;

function gunMap() {
  return loadTex("/textures/gunmetal.jpg", 2.4, 1.6);
}
function polyMap() {
  return loadTex("/textures/polymer.jpg", 1.8, 1.8);
}

function steel(color: number, metal = 0.78, rough = 0.28, map = true) {
  return new THREE.MeshPhysicalMaterial({
    color,
    map: map ? gunMap() : null,
    metalness: metal,
    roughness: rough,
    clearcoat: 0.42,
    clearcoatRoughness: 0.32,
  });
}

function polymer(color = 0x17191d) {
  return new THREE.MeshPhysicalMaterial({
    color,
    map: polyMap(),
    metalness: 0.04,
    roughness: 0.88,
    clearcoat: 0.08,
    clearcoatRoughness: 0.7,
  });
}

function lamp(color: number, em = 1.55) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: em,
    metalness: 0.18,
    roughness: 0.2,
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

function muzzleBrake(chrome: THREE.Material, dark: THREE.Material, x: number, y: number, z: number, scale = 1) {
  const g = new THREE.Group();
  g.add(cyl(dark, 0.016 * scale, 0.018 * scale, 0.055 * scale, x, y, z, 10));
  g.add(cyl(chrome, 0.02 * scale, 0.017 * scale, 0.028 * scale, x, y, z - 0.038 * scale, 10));
  g.add(box(dark, 0.038 * scale, 0.012 * scale, 0.02 * scale, x, y, z - 0.022 * scale));
  return tag(g);
}

function magWell(k: Kit, deep = 0.12) {
  const g = new THREE.Group();
  g.add(box(k.dark, 0.05, deep, 0.07, 0, -0.07 - deep * 0.15, 0.04));
  g.add(box(k.grip, 0.044, deep * 0.82, 0.06, 0, -0.09 - deep * 0.2, 0.04));
  g.add(box(k.chrome, 0.046, 0.01, 0.062, 0, -0.055, 0.04));
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
  g.add(box(k.dark, 0.05, 0.04, 0.1, 0, 0.108, z));
  g.add(cyl(k.dark, 0.02, 0.02, 0.08, 0, 0.122, z - 0.01, 12));
  g.add(cyl(k.accent, 0.014, 0.014, 0.012, 0, 0.122, z - 0.05, 12));
  g.add(box(k.accent, 0.03, 0.008, 0.04, 0, 0.132, z + 0.02));
  return tag(g);
}

function glove(k: Kit) {
  const g = new THREE.Group();
  g.add(box(k.glove, 0.078, 0.048, 0.1, 0.062, -0.125, 0.09, 0.35));
  g.add(box(k.glove, 0.05, 0.04, 0.07, 0.055, -0.17, 0.12, 0.2));
  for (let i = 0; i < 4; i++) {
    const fy = -0.09 - i * 0.022;
    g.add(box(k.glove, 0.022, 0.016, 0.05, 0.038, fy, 0.042, 0.15, 0, 0.4));
  }
  g.add(box(k.glove, 0.02, 0.018, 0.048, 0.012, -0.078, 0.12, 0.1, 0.4, 0.2));
  g.add(box(k.dark, 0.03, 0.012, 0.04, 0.07, -0.11, 0.1));
  return tag(g);
}

function flash(id: WeaponId) {
  const s = id === "scatter" ? 0.08 : id === "torpedo" ? 0.1 : 0.052;
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(s, 10, 8),
    new THREE.MeshBasicMaterial({
      color: 0xfff3d0,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  m.name = "muzzle";
  const z = id === "lance" ? -0.82 : id === "torpedo" ? -0.56 : id === "ion" ? -0.42 : id === "scatter" ? -0.52 : -0.5;
  const y = id === "torpedo" ? 0.06 : 0.036;
  m.position.set(0, y, z);
  return tag(m);
}

function buildPulse(k: Kit) {
  const g = new THREE.Group();
  g.add(box(k.body, 0.082, 0.094, 0.32, 0, 0.028, 0.02));
  g.add(box(k.dark, 0.074, 0.04, 0.26, 0, -0.022, 0.0));
  g.add(box(k.dark, 0.07, 0.05, 0.12, 0, 0.04, 0.16));
  g.add(cyl(k.chrome, 0.016, 0.018, 0.3, 0, 0.032, -0.28, 12));
  g.add(cyl(k.dark, 0.024, 0.026, 0.18, 0, 0.032, -0.2, 12));
  g.add(muzzleBrake(k.chrome, k.dark, 0, 0.032, -0.44, 1));
  g.add(picatinny(k.chrome, 0.22, 0.08, -0.02));
  g.add(optic(k, 0.0));
  g.add(irons(k, -0.28, 0.12, 0.086));
  g.add(magWell(k, 0.14));
  g.add(trigger(k));
  g.add(pistolGrip(k));
  g.add(stock(k, 0.26));
  g.add(box(k.accent, 0.012, 0.01, 0.16, 0.04, 0.05, -0.04));
  g.add(box(k.accent, 0.022, 0.008, 0.04, 0, 0.078, 0.12));
  g.add(cyl(k.dark, 0.012, 0.012, 0.06, 0.05, 0.01, 0.08, 8, 0));
  g.add(glove(k));
  return g;
}

function buildScatter(k: Kit) {
  const g = new THREE.Group();
  g.add(box(k.body, 0.13, 0.1, 0.3, 0, 0.032, 0.04));
  g.add(box(k.dark, 0.12, 0.04, 0.24, 0, -0.02, 0.0));
  g.add(cyl(k.chrome, 0.026, 0.03, 0.38, 0.034, 0.04, -0.24, 12));
  g.add(cyl(k.chrome, 0.026, 0.03, 0.38, -0.034, 0.04, -0.24, 12));
  g.add(cyl(k.dark, 0.032, 0.032, 0.07, 0.034, 0.04, -0.44, 10));
  g.add(cyl(k.dark, 0.032, 0.032, 0.07, -0.034, 0.04, -0.44, 10));
  g.add(box(k.dark, 0.12, 0.03, 0.22, 0, 0.086, -0.04));
  g.add(picatinny(k.chrome, 0.18, 0.104, 0.0));
  g.add(box(k.grip, 0.1, 0.038, 0.12, 0, -0.055, -0.12));
  g.add(box(k.chrome, 0.11, 0.012, 0.08, 0, -0.076, -0.12));
  g.add(box(k.accent, 0.09, 0.014, 0.05, 0, 0.1, 0.1));
  g.add(box(k.dark, 0.04, 0.05, 0.05, 0.07, 0.02, 0.14));
  g.add(irons(k, -0.32, 0.14, 0.1));
  g.add(trigger(k));
  g.add(pistolGrip(k));
  g.add(stock(k, 0.24));
  g.add(glove(k));
  return g;
}

function buildTorpedo(k: Kit) {
  const g = new THREE.Group();
  g.add(cyl(k.body, 0.058, 0.062, 0.56, 0, 0.06, -0.08, 14));
  g.add(cyl(k.dark, 0.066, 0.066, 0.1, 0, 0.06, 0.18, 14));
  g.add(cyl(k.chrome, 0.05, 0.044, 0.09, 0, 0.06, -0.38, 14));
  g.add(cone(k.dark, 0.078, 0.1, 0, 0.06, -0.48));
  g.add(ring(k.chrome, 0.066, 0.008, 0, 0.06, -0.16));
  g.add(ring(k.accent, 0.06, 0.007, 0, 0.06, -0.02));
  g.add(box(k.body, 0.12, 0.09, 0.2, 0, 0.01, 0.2));
  g.add(box(k.dark, 0.08, 0.07, 0.12, 0.09, 0.08, 0.04));
  g.add(box(k.accent, 0.05, 0.03, 0.06, 0.1, 0.12, 0.04));
  g.add(cyl(k.dark, 0.016, 0.016, 0.08, 0.1, 0.12, -0.04, 8));
  g.add(box(k.accent, 0.018, 0.04, 0.28, 0.064, 0.06, -0.08));
  g.add(trigger(k));
  g.add(pistolGrip(k));
  g.add(box(k.grip, 0.045, 0.08, 0.05, 0.09, -0.02, 0.14));
  g.add(stock(k, 0.32));
  g.add(glove(k));
  return g;
}

function buildLance(k: Kit) {
  const g = new THREE.Group();
  g.add(box(k.body, 0.062, 0.07, 0.28, 0, 0.03, 0.06));
  g.add(cyl(k.chrome, 0.012, 0.015, 0.86, 0, 0.038, -0.36, 12));
  g.add(cyl(k.dark, 0.02, 0.022, 0.2, 0, 0.038, -0.1, 12));
  g.add(ring(k.accent, 0.03, 0.006, 0, 0.038, -0.2));
  g.add(ring(k.accent, 0.026, 0.006, 0, 0.038, -0.38));
  g.add(ring(k.accent, 0.022, 0.005, 0, 0.038, -0.56));
  g.add(cyl(k.chrome, 0.018, 0.014, 0.05, 0, 0.038, -0.78, 10));
  g.add(picatinny(k.chrome, 0.2, 0.072, 0.02));
  g.add(optic(k, 0.04));
  g.add(box(k.dark, 0.07, 0.055, 0.12, 0, 0.0, 0.2));
  g.add(box(k.accent, 0.036, 0.04, 0.07, 0, 0.018, 0.22));
  g.add(box(k.dark, 0.05, 0.08, 0.1, 0, -0.02, 0.16));
  g.add(irons(k, -0.5, 0.14, 0.08));
  g.add(trigger(k));
  g.add(pistolGrip(k));
  g.add(stock(k, 0.3));
  g.add(glove(k));
  return g;
}

function buildIon(k: Kit) {
  const g = new THREE.Group();
  g.add(box(k.body, 0.095, 0.08, 0.22, 0, 0.02, 0.1));
  g.add(sphere(k.accent, 0.058, 0, 0.052, -0.02, 16));
  g.add(ring(k.chrome, 0.072, 0.008, 0, 0.052, -0.02, 0));
  g.add(ring(k.chrome, 0.072, 0.008, 0, 0.052, -0.02, Math.PI / 2));
  g.add(cyl(k.dark, 0.03, 0.036, 0.24, 0, 0.04, -0.2, 12));
  g.add(ring(k.accent, 0.038, 0.006, 0, 0.04, -0.16));
  g.add(ring(k.accent, 0.034, 0.006, 0, 0.04, -0.28));
  g.add(cone(k.chrome, 0.032, 0.055, 0, 0.04, -0.36));
  g.add(box(k.dark, 0.08, 0.02, 0.14, 0, 0.078, 0.08));
  g.add(box(k.accent, 0.048, 0.012, 0.05, 0, 0.092, 0.1));
  g.add(picatinny(k.chrome, 0.12, 0.09, 0.1));
  g.add(trigger(k));
  g.add(pistolGrip(k));
  g.add(stock(k, 0.24));
  g.add(glove(k));
  return g;
}

export function buildViewmodel(id: WeaponId): THREE.Group {
  const col = WEAPON_META[id].color;
  const k: Kit = {
    dark: steel(0x2a3140, 0.68, 0.34),
    body: steel(0x8b94a3, 0.58, 0.26),
    chrome: steel(0xd5dce4, 0.95, 0.1),
    grip: polymer(0x1a1d22),
    glove: polymer(0x0f1114),
    accent: lamp(col, id === "ion" || id === "lance" ? 1.85 : 1.4),
  };
  const g =
    id === "pulse"
      ? buildPulse(k)
      : id === "scatter"
        ? buildScatter(k)
        : id === "torpedo"
          ? buildTorpedo(k)
          : id === "lance"
            ? buildLance(k)
            : buildIon(k);
  g.add(flash(id));
  g.layers.set(LAYER);
  g.rotation.y = 0.035;
  g.rotation.z = -0.028;
  return g;
}

export function restPose(id: WeaponId): THREE.Vector3 {
  if (id === "lance") return new THREE.Vector3(0.24, -0.17, -0.52);
  if (id === "torpedo") return new THREE.Vector3(0.255, -0.205, -0.48);
  if (id === "scatter") return new THREE.Vector3(0.245, -0.18, -0.46);
  if (id === "ion") return new THREE.Vector3(0.23, -0.155, -0.42);
  return new THREE.Vector3(0.235, -0.155, -0.42);
}

export function buildWorldGun(gunMat: THREE.Material, dark: THREE.Material, glowMat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.42, 8), gunMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -0.08);
  const rec = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.2), gunMat);
  rec.position.set(0, 0.02, 0.12);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.13, 0.06), dark);
  mag.position.set(0, -0.08, 0.08);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.055, 0.12), dark);
  stock.position.set(0, 0.01, 0.24);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.07), glowMat);
  sight.position.set(0, 0.065, 0.04);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.045), dark);
  grip.position.set(0, -0.07, 0.14);
  grip.rotation.x = 0.35;
  g.add(barrel, rec, mag, stock, sight, grip);
  return g;
}

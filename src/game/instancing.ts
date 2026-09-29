import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const _upAxis = new THREE.Vector3(0, 1, 0);
const _instDir = new THREE.Vector3();

type BoxSpec = { x: number; y: number; z: number; w: number; h: number; d: number };

const _dummy = new THREE.Object3D();
const _p1 = new THREE.Vector3();
const _box = new THREE.Box3();
const _sphere = new THREE.Sphere();

function expandBoxFromDummy(geo: THREE.BufferGeometry, dummy: THREE.Object3D) {
  const local = geo.boundingBox;
  if (!local) return;
  for (let x = 0; x <= 1; x++) {
    for (let y = 0; y <= 1; y++) {
      for (let z = 0; z <= 1; z++) {
        _p1.set(
          x ? local.max.x : local.min.x,
          y ? local.max.y : local.min.y,
          z ? local.max.z : local.min.z,
        );
        _p1.applyMatrix4(dummy.matrix);
        _box.expandByPoint(_p1);
      }
    }
  }
}

function packBatch(
  parent: THREE.Object3D,
  mat: THREE.Material,
  geo: THREE.BufferGeometry,
  n: number,
  write: (i: number, dummy: THREE.Object3D) => void,
): THREE.BatchedMesh {
  if (!geo.boundingBox) geo.computeBoundingBox();
  if (!geo.boundingSphere) geo.computeBoundingSphere();
  const pos = geo.getAttribute("position");
  const idx = geo.index;
  const vcount = pos ? pos.count : 24;
  const icount = idx ? idx.count : 36;
  const mesh = new THREE.BatchedMesh(n, vcount, icount, mat);
  mesh.frustumCulled = true;
  mesh.perObjectFrustumCulled = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const gid = mesh.addGeometry(geo);
  _box.makeEmpty();
  for (let i = 0; i < n; i++) {
    const id = mesh.addInstance(gid);
    _dummy.position.set(0, 0, 0);
    _dummy.rotation.set(0, 0, 0);
    _dummy.scale.set(1, 1, 1);
    write(i, _dummy);
    _dummy.updateMatrix();
    mesh.setMatrixAt(id, _dummy.matrix);
    expandBoxFromDummy(geo, _dummy);
  }
  mesh.boundingBox = _box.clone();
  mesh.boundingSphere = _box.getBoundingSphere(_sphere.clone());
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  parent.add(mesh);
  return mesh;
}

export class BoxBatch {
  private buckets = new Map<THREE.Material, BoxSpec[]>();
  private geo = new THREE.BoxGeometry(1, 1, 1);
  meshes: THREE.BatchedMesh[] = [];

  add(mat: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number) {
    let list = this.buckets.get(mat);
    if (!list) {
      list = [];
      this.buckets.set(mat, list);
    }
    list.push({ x, y: y + h / 2, z, w, h, d });
  }

  build(parent: THREE.Object3D) {
    for (const [mat, items] of this.buckets) {
      const mesh = packBatch(parent, mat, this.geo, items.length, (i, dummy) => {
        const it = items[i]!;
        dummy.position.set(it.x, it.y, it.z);
        dummy.scale.set(it.w, it.h, it.d);
      });
      this.meshes.push(mesh);
    }
  }

  dispose() {
    this.geo.dispose();
  }
}

/** Cubiertas horizontales: UV en metros de mundo, sin merge de Planes (el dispose compartía buffers). */
export function stampDecks(
  parent: THREE.Object3D,
  mat: THREE.Material,
  items: Array<{ x: number; y: number; z: number; w: number; d: number }>,
  metersPerTile = 2.15,
): { mesh: THREE.Mesh; geo: THREE.BufferGeometry } {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let base = 0;
  for (const it of items) {
    const x0 = it.x - it.w * 0.5;
    const x1 = it.x + it.w * 0.5;
    const z0 = it.z - it.d * 0.5;
    const z1 = it.z + it.d * 0.5;
    const y = it.y;
    positions.push(x0, y, z0, x0, y, z1, x1, y, z1, x1, y, z0);
    normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
    uvs.push(x0 / metersPerTile, z0 / metersPerTile, x0 / metersPerTile, z1 / metersPerTile, x1 / metersPerTile, z1 / metersPerTile, x1 / metersPerTile, z0 / metersPerTile);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    base += 4;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  parent.add(mesh);
  return { mesh, geo };
}

export function instancePlanes(
  parent: THREE.Object3D,
  mat: THREE.Material,
  items: Array<{ x: number; y: number; z: number; ry: number; s: number }>,
): { mesh: THREE.BatchedMesh; geo: THREE.BufferGeometry } {
  const geo = new THREE.PlaneGeometry(1, 1);
  const mesh = packBatch(parent, mat, geo, items.length, (i, dummy) => {
    const it = items[i]!;
    dummy.position.set(it.x, it.y, it.z);
    dummy.rotation.set(0, it.ry, 0);
    dummy.scale.set(it.s, it.s, 1);
  });
  return { mesh, geo };
}

export function instanceDiscs(
  parent: THREE.Object3D,
  mat: THREE.Material,
  items: Array<{ x: number; y: number; z: number }>,
  radius: number,
): { mesh: THREE.BatchedMesh; geo: THREE.BufferGeometry } {
  const geo = new THREE.CircleGeometry(radius, 24);
  geo.rotateX(-Math.PI / 2);
  const mesh = packBatch(parent, mat, geo, items.length, (i, dummy) => {
    const it = items[i]!;
    dummy.position.set(it.x, it.y, it.z);
  });
  return { mesh, geo };
}

export function instanceCylinders(
  parent: THREE.Object3D,
  mat: THREE.Material,
  items: Array<{ x: number; y: number; z: number }>,
  rTop: number,
  rBot: number,
  h: number,
  radialSegments = 16,
): { mesh: THREE.BatchedMesh; geo: THREE.BufferGeometry } {
  const geo = new THREE.CylinderGeometry(rTop, rBot, h, radialSegments);
  const mesh = packBatch(parent, mat, geo, items.length, (i, dummy) => {
    const it = items[i]!;
    dummy.position.set(it.x, it.y, it.z);
  });
  return { mesh, geo };
}

export function instanceCones(
  parent: THREE.Object3D,
  mat: THREE.Material,
  items: Array<{ x: number; y: number; z: number }>,
  rBot: number,
  h: number,
  radialSegments = 12,
): { mesh: THREE.BatchedMesh; geo: THREE.BufferGeometry } {
  const geo = new THREE.ConeGeometry(rBot, h, radialSegments);
  const mesh = packBatch(parent, mat, geo, items.length, (i, dummy) => {
    const it = items[i]!;
    dummy.position.set(it.x, it.y, it.z);
  });
  return { mesh, geo };
}

/** Copas de follaje: UV esféricas para que se lea la textura de hojas. */
export function instanceIcosahedrons(
  parent: THREE.Object3D,
  mat: THREE.Material,
  items: Array<{ x: number; y: number; z: number }>,
  radius: number,
  scaleY = 1.18,
): { mesh: THREE.BatchedMesh; geo: THREE.BufferGeometry } {
  const geo = new THREE.IcosahedronGeometry(radius, 1);
  const mesh = packBatch(parent, mat, geo, items.length, (i, dummy) => {
    const it = items[i]!;
    dummy.position.set(it.x, it.y, it.z);
    dummy.scale.set(1, scaleY, 1);
  });
  return { mesh, geo };
}

export function bakeMeshes(group: THREE.Group, mat: THREE.Material): void {
  const geos: THREE.BufferGeometry[] = [];
  const toDrop: THREE.Mesh[] = [];
  group.updateMatrixWorld(true);
  group.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    let g = obj.geometry.clone();
    if (g.index) g = g.toNonIndexed();
    g.applyMatrix4(obj.matrix);
    geos.push(g);
    toDrop.push(obj);
  });
  if (!geos.length) return;
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  if (!merged) return;
  for (const m of toDrop) {
    m.geometry.dispose();
    group.remove(m);
  }
  const baked = new THREE.Mesh(merged, mat);
  baked.castShadow = true;
  baked.receiveShadow = true;
  group.add(baked);
}

export class BeamBatch {
  mesh: THREE.LineSegments;
  private pos: Float32Array;
  private col: Float32Array;
  private base: Float32Array;
  private posAttr: THREE.BufferAttribute;
  private colAttr: THREE.BufferAttribute;
  private life: Float32Array;
  private maxLife: Float32Array;
  private used = 0;
  private readonly cap: number;
  private hex = new THREE.Color();

  constructor(cap = 24) {
    this.cap = cap;
    this.pos = new Float32Array(cap * 6);
    this.col = new Float32Array(cap * 6);
    this.base = new Float32Array(cap * 6);
    this.life = new Float32Array(cap);
    this.maxLife = new Float32Array(cap);
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("position", this.posAttr);
    geo.setAttribute("color", this.colAttr);
    geo.setDrawRange(0, 0);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2, 0), 120);
    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    });
    this.mesh = new THREE.LineSegments(geo, mat);
    this.mesh.frustumCulled = true;
    this.mesh.renderOrder = 6;
  }

  spawn(from: THREE.Vector3, to: THREE.Vector3, color: number, life: number) {
    const i = this.used < this.cap ? this.used++ : this.cap - 1;
    const o = i * 6;
    this.pos[o] = from.x;
    this.pos[o + 1] = from.y;
    this.pos[o + 2] = from.z;
    this.pos[o + 3] = to.x;
    this.pos[o + 4] = to.y;
    this.pos[o + 5] = to.z;
    this.hex.setHex(color);
    const r = this.hex.r;
    const g = this.hex.g;
    const b = this.hex.b;
    this.col[o] = this.base[o] = r;
    this.col[o + 1] = this.base[o + 1] = g;
    this.col[o + 2] = this.base[o + 2] = b;
    this.col[o + 3] = this.base[o + 3] = r;
    this.col[o + 4] = this.base[o + 4] = g;
    this.col[o + 5] = this.base[o + 5] = b;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.mesh.geometry.setDrawRange(0, this.used * 2);
  }

  update(dt: number) {
    let w = 0;
    for (let i = 0; i < this.used; i++) {
      this.life[i] -= dt;
      if (this.life[i]! <= 0) continue;
      if (w !== i) {
        const a = i * 6;
        const b = w * 6;
        for (let k = 0; k < 6; k++) {
          this.pos[b + k] = this.pos[a + k]!;
          this.base[b + k] = this.base[a + k]!;
        }
        this.life[w] = this.life[i]!;
        this.maxLife[w] = this.maxLife[i]!;
      }
      const fade = Math.max(0, this.life[w]! / this.maxLife[w]!);
      const o = w * 6;
      this.col[o] = this.base[o]! * fade;
      this.col[o + 1] = this.base[o + 1]! * fade;
      this.col[o + 2] = this.base[o + 2]! * fade;
      this.col[o + 3] = this.base[o + 3]! * fade;
      this.col[o + 4] = this.base[o + 4]! * fade;
      this.col[o + 5] = this.base[o + 5]! * fade;
      w++;
    }
    this.used = w;
    this.mesh.geometry.setDrawRange(0, w * 2);
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.posAttr.addUpdateRange(0, w * 6);
    this.colAttr.addUpdateRange(0, w * 6);
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

export class InstancePool {
  mesh: THREE.InstancedMesh;
  private free: number[] = [];
  private dummy = new THREE.Object3D();
  private color = new THREE.Color();
  readonly max: number;

  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, max: number) {
    this.max = max;
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = true;
    this.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2, 0), 90);
    this.color.setRGB(1, 1, 1);
    this.mesh.setColorAt(0, this.color);
    this.dummy.scale.set(0, 0, 0);
    this.dummy.position.set(0, -80, 0);
    this.dummy.updateMatrix();
    for (let i = 0; i < max; i++) {
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.free.push(i);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  spawn(x: number, y: number, z: number, color: number, scale = 1): number | null {
    const i = this.free.pop();
    if (i === undefined) return null;
    this.dummy.position.set(x, y, z);
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.scale.setScalar(scale);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(i, this.dummy.matrix);
    this.color.setHex(color);
    this.mesh.setColorAt(i, this.color);
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    return i;
  }

  move(i: number, x: number, y: number, z: number, dx = 0, dy = 1, dz = 0, scale = 1) {
    this.dummy.position.set(x, y, z);
    this.dummy.quaternion.setFromUnitVectors(_upAxis, _instDir.set(dx, dy, dz).normalize());
    this.dummy.scale.setScalar(scale);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(i, this.dummy.matrix);
  }

  hide(i: number) {
    this.dummy.scale.set(0, 0, 0);
    this.dummy.position.set(0, -80, 0);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(i, this.dummy.matrix);
    this.free.push(i);
  }

  flush() {
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}

#!/usr/bin/env node
/**
 * Convert assets/quake/nexus_arena.map into the browser arena:
 *   src/game/reactor-map.json
 *   public/textures/reactor/<material>.png
 *
 * Quake III is Z-up, 32 units = 1 meter, deck at Z=128 → game Y=0.
 * Collision stays axis-aligned: boxes stay boxes, other brushes are sliced
 * into columns and merged so ramps become steps the player can walk.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MAP_PATH = join(ROOT, "assets/quake/nexus_arena.map");
const TEX_DIR = join(ROOT, "assets/quake/textures");
const OUT_JSON = join(ROOT, "src/game/reactor-map.json");
const OUT_TEX = join(ROOT, "public/textures/reactor");

const SCALE = 1 / 32;
const FLOOR_Z = 128;
const NONSOLID = new Set(["red", "cyan", "beam", "coolant", "trigger", "caulk", "clip"]);
const NODRAW = new Set(["trigger", "caulk", "clip"]);
const SKIP_TAG = /shell|hangar/i;

const ITEM_KIND = {
  weapon_rocketlauncher: ["torpedo", 22],
  weapon_plasmagun: ["ion", 20],
  weapon_railgun: ["lance", 28],
  weapon_shotgun: ["scatter", 18],
  weapon_lightning: ["pulse", 18],
  weapon_grenadelauncher: ["torpedo", 22],
  ammo_rockets: ["ammo", 14],
  ammo_cells: ["ammo", 14],
  ammo_slugs: ["ammo", 14],
  ammo_shells: ["ammo", 14],
  ammo_lightning: ["ammo", 14],
  item_health_large: ["health", 12],
  item_health_mega: ["mega", 35],
  item_armor_combat: ["armor", 22],
  item_armor_body: ["armor", 24],
  item_armor_shard: ["armor", 16],
  item_quad: ["volt", 30],
};

function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function mul(a, s) {
  return [a[0] * s, a[1] * s, a[2] * s];
}
function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function len(a) {
  return Math.hypot(a[0], a[1], a[2]);
}

function toGame(p) {
  return [p[0] * SCALE, (p[2] - FLOOR_Z) * SCALE, -p[1] * SCALE];
}
function toGameN(n) {
  const g = [n[0], n[2], -n[1]];
  const l = len(g) || 1;
  return [g[0] / l, g[1] / l, g[2] / l];
}

function parseFace(line) {
  const pts = [...line.matchAll(/\(\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\)/g)].map((m) => [
    Number(m[1]),
    Number(m[2]),
    Number(m[3]),
  ]);
  if (pts.length < 3) return null;
  const rest = line.replace(/\([^)]*\)/g, "").trim().split(/\s+/);
  const material = (rest[0] ?? "dark").split("/").pop();
  return {
    pts,
    material,
    scaleS: Number(rest[4] ?? 0.5) || 0.5,
    scaleT: Number(rest[5] ?? 0.5) || 0.5,
  };
}

function parseMap(text) {
  const entities = [];
  let ent = null;
  let brush = null;
  let depth = 0;
  let comment = "";
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith("//")) {
      comment = t.slice(2).trim();
      continue;
    }
    if (t === "{") {
      depth += 1;
      if (depth === 1) ent = { props: {}, brushes: [] };
      else if (depth === 2) brush = { tag: comment, faces: [] };
      continue;
    }
    if (t === "}") {
      if (depth === 2 && brush && ent) ent.brushes.push(brush);
      if (depth === 1 && ent) entities.push(ent);
      depth -= 1;
      brush = null;
      continue;
    }
    if (depth === 1 && ent) {
      const m = t.match(/^"([^"]*)"\s+"([^"]*)"/);
      if (m) ent.props[m[1]] = m[2];
    } else if (depth === 2 && brush) {
      const face = parseFace(t);
      if (face) brush.faces.push(face);
    }
  }
  return entities;
}

function planeFromFace(face) {
  const a = face.pts[0];
  const b = face.pts[1];
  const c = face.pts[2];
  const n = cross(sub(c, a), sub(b, a));
  const l = len(n);
  if (l < 1e-8) return null;
  const normal = mul(n, 1 / l);
  return { n: normal, d: dot(normal, a), face };
}

function intersect(p1, p2, p3) {
  const n2n3 = cross(p2.n, p3.n);
  const denom = dot(p1.n, n2n3);
  if (Math.abs(denom) < 1e-8) return null;
  const n3n1 = cross(p3.n, p1.n);
  const n1n2 = cross(p1.n, p2.n);
  return mul(add(add(mul(n2n3, p1.d), mul(n3n1, p2.d)), mul(n1n2, p3.d)), 1 / denom);
}

function inside(planes, p, eps = 0.4) {
  for (const plane of planes) {
    if (dot(plane.n, p) > plane.d + eps) return false;
  }
  return true;
}

function unique(points, tol = 0.6) {
  const out = [];
  for (const p of points) {
    if (!out.some((q) => Math.abs(q[0] - p[0]) < tol && Math.abs(q[1] - p[1]) < tol && Math.abs(q[2] - p[2]) < tol)) {
      out.push(p);
    }
  }
  return out;
}

function buildBrush(brush) {
  const planes = brush.faces.map(planeFromFace).filter(Boolean);
  const verts = [];
  for (let i = 0; i < planes.length; i++) {
    for (let j = i + 1; j < planes.length; j++) {
      for (let k = j + 1; k < planes.length; k++) {
        const p = intersect(planes[i], planes[j], planes[k]);
        if (p && inside(planes, p)) verts.push(p);
      }
    }
  }
  return { ...brush, planes, verts: unique(verts) };
}

function boundsOf(verts) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const p of verts) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], p[i]);
      max[i] = Math.max(max[i], p[i]);
    }
  }
  return { min, max };
}

function axisAligned(brush) {
  return brush.planes.every((p) => {
    const a = p.n.map(Math.abs);
    const dominant = Math.max(a[0], a[1], a[2]);
    const others = a.filter((v) => v > 0.04).length;
    return dominant > 0.98 && others === 1;
  });
}

function brushSolid(brush) {
  if (SKIP_TAG.test(brush.tag)) return false;
  if (/trigger|jump volume|fall hazard|reactor beam|coolant/i.test(brush.tag)) return false;
  const mats = new Set(brush.faces.map((f) => f.material));
  for (const mat of mats) {
    if (!NONSOLID.has(mat)) return true;
  }
  return false;
}

function tryMerge(a, b, eps) {
  const axes = [0, 1, 2];
  for (const axis of axes) {
    const same = axes.every((i) => {
      if (i === axis) return true;
      return Math.abs(a.min[i] - b.min[i]) <= eps && Math.abs(a.max[i] - b.max[i]) <= eps;
    });
    if (!same) continue;
    const touch =
      Math.abs(a.max[axis] - b.min[axis]) <= eps || Math.abs(b.max[axis] - a.min[axis]) <= eps;
    const overlap = a.min[axis] <= b.max[axis] + eps && b.min[axis] <= a.max[axis] + eps;
    if (!touch && !overlap) continue;
    return {
      min: a.min.map((v, i) => Math.min(v, b.min[i])),
      max: a.max.map((v, i) => Math.max(v, b.max[i])),
    };
  }
  return null;
}

function mergeBoxes(boxes) {
  let pending = boxes;
  let changed = true;
  while (changed && pending.length > 1) {
    changed = false;
    const next = [];
    const used = new Array(pending.length).fill(false);
    for (let i = 0; i < pending.length; i++) {
      if (used[i]) continue;
      let cur = pending[i];
      for (let j = i + 1; j < pending.length; j++) {
        if (used[j]) continue;
        const merged = tryMerge(cur, pending[j], 0.8);
        if (merged) {
          cur = merged;
          used[j] = true;
          changed = true;
        }
      }
      next.push(cur);
    }
    pending = next;
  }
  return pending;
}

function columnSolids(brush) {
  const b = boundsOf(brush.verts);
  const dx = b.max[0] - b.min[0];
  const dy = b.max[1] - b.min[1];
  const dz = b.max[2] - b.min[2];
  if (dx < 1 || dy < 1 || dz < 1) return [];
  if (Math.min(dx, dy, dz) < 24 || axisAligned(brush)) {
    return [b];
  }
  const slope = dz / Math.max(dx, dy, 1);
  const ramp = /ramp/i.test(brush.tag) || (slope > 0.18 && dz < Math.max(dx, dy) * 1.2);
  const cell = ramp ? 16 : Math.max(dx, dy) > 320 ? 64 : 32;
  const boxes = [];
  for (let x = b.min[0]; x < b.max[0] - 0.2; x += cell) {
    const x1 = Math.min(x + cell, b.max[0]);
    for (let y = b.min[1]; y < b.max[1] - 0.2; y += cell) {
      const y1 = Math.min(y + cell, b.max[1]);
      const cx = (x + x1) / 2;
      const cy = (y + y1) / 2;
      let z0 = null;
      let z1 = null;
      const step = Math.max(8, cell / 2);
      for (let z = b.min[2] + step * 0.5; z < b.max[2]; z += step) {
        if (!inside(brush.planes, [cx, cy, z], 0.8)) continue;
        if (z0 === null) z0 = z - step * 0.5;
        z1 = z + step * 0.5;
      }
      if (z0 === null) continue;
      boxes.push({
        min: [x, y, Math.max(b.min[2], z0)],
        max: [x1, y1, Math.min(b.max[2], z1)],
      });
    }
  }
  const merged = mergeBoxes(boxes);
  if (merged.length > 480) return [b];
  return merged;
}

function textureAxes(normal) {
  const ax = Math.abs(normal[0]);
  const ay = Math.abs(normal[1]);
  const az = Math.abs(normal[2]);
  if (ax >= ay && ax >= az) return [[0, 1, 0], [0, 0, -1]];
  if (ay >= ax && ay >= az) return [[1, 0, 0], [0, 0, -1]];
  return [[1, 0, 0], [0, -1, 0]];
}

function faceTriangles(brush, plane) {
  const on = brush.verts.filter((p) => Math.abs(dot(plane.n, p) - plane.d) < 0.8);
  const pts = unique(on, 0.5);
  if (pts.length < 3) return [];
  const center = pts.reduce((a, p) => add(a, p), [0, 0, 0]).map((v) => v / pts.length);
  const [xu, yu] = textureAxes(plane.n);
  const origin = pts[0];
  pts.sort((a, b) => {
    const aa = Math.atan2(dot(sub(a, center), yu), dot(sub(a, center), xu));
    const bb = Math.atan2(dot(sub(b, center), yu), dot(sub(b, center), xu));
    return aa - bb;
  });
  const tris = [];
  for (let i = 1; i < pts.length - 1; i++) tris.push([pts[0], pts[i], pts[i + 1]]);
  return { tris, origin };
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

function pushTri(bucket, tri, normal, face) {
  const [xu, yu] = textureAxes(normal);
  const gn = toGameN(normal);
  for (const p of tri) {
    const g = toGame(p);
    bucket.positions.push(round3(g[0]), round3(g[1]), round3(g[2]));
    bucket.normals.push(round3(gn[0]), round3(gn[1]), round3(gn[2]));
    const u = dot(p, xu) / (256 * face.scaleS);
    const v = dot(p, yu) / (256 * face.scaleT);
    bucket.uvs.push(round3(u), round3(v));
  }
}

function gameBox(b) {
  const corners = [
    [b.min[0], b.min[1], b.min[2]],
    [b.max[0], b.min[1], b.min[2]],
    [b.min[0], b.max[1], b.min[2]],
    [b.max[0], b.max[1], b.min[2]],
    [b.min[0], b.min[1], b.max[2]],
    [b.max[0], b.min[1], b.max[2]],
    [b.min[0], b.max[1], b.max[2]],
    [b.max[0], b.max[1], b.max[2]],
  ].map(toGame);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const p of corners) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], p[i]);
      max[i] = Math.max(max[i], p[i]);
    }
  }
  return [round3(min[0]), round3(min[1]), round3(min[2]), round3(max[0]), round3(max[1]), round3(max[2])];
}

function launch(from, to) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const horiz = Math.hypot(dx, dz);
  const t = Math.max(0.85, horiz / 16);
  const g = 24.5;
  return {
    vx: round3(dx / t),
    vy: round3(dy / t + 0.5 * g * t),
    vz: round3(dz / t),
  };
}

function q3Origin(text) {
  const [x, y, z] = text.split(/\s+/).map(Number);
  return [x, y, z];
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function convertTga(file) {
  const buf = readFileSync(file);
  const width = buf.readUInt16LE(12);
  const height = buf.readUInt16LE(14);
  const bpp = buf[16];
  const desc = buf[17];
  const topOrigin = (desc & 0x20) !== 0;
  const channels = bpp / 8;
  if (buf[2] !== 2 || (channels !== 3 && channels !== 4)) {
    throw new Error(`Unsupported TGA ${file}`);
  }
  const rgba = Buffer.alloc(width * height * 4);
  const pixels = buf.subarray(18);
  for (let y = 0; y < height; y++) {
    const srcY = topOrigin ? y : height - 1 - y;
    for (let x = 0; x < width; x++) {
      const si = (srcY * width + x) * channels;
      const di = (y * width + x) * 4;
      rgba[di] = pixels[si + 2];
      rgba[di + 1] = pixels[si + 1];
      rgba[di + 2] = pixels[si];
      rgba[di + 3] = channels === 4 ? pixels[si + 3] : 255;
    }
  }
  return encodePng(width, height, rgba);
}

function pointInSolid(solids, x, y, z, hw, h) {
  for (const s of solids) {
    if (x + hw > s[0] && x - hw < s[3] && y + h > s[1] && y < s[4] && z + hw > s[2] && z - hw < s[5]) {
      return true;
    }
  }
  return false;
}

function main() {
  const entities = parseMap(readFileSync(MAP_PATH, "utf8"));
  const world = entities.find((e) => e.props.classname === "worldspawn");
  if (!world) throw new Error("worldspawn missing");

  const meshes = {};
  const solids = [];
  let brushCount = 0;
  let skipped = 0;

  const consider = [];
  for (const brush of world.brushes) consider.push(brush);
  for (const ent of entities) {
    if (ent === world) continue;
    const kind = ent.props.classname ?? "";
    if (kind === "func_bobbing" || kind === "func_button") {
      for (const brush of ent.brushes) consider.push(brush);
    }
  }

  for (const raw of consider) {
    if (SKIP_TAG.test(raw.tag)) {
      skipped += 1;
      continue;
    }
    const brush = buildBrush(raw);
    if (brush.verts.length < 4) continue;
    brushCount += 1;
    if (brushSolid(brush)) {
      for (const box of columnSolids(brush)) solids.push(gameBox(box));
    }
    if (brush.faces.every((f) => NODRAW.has(f.material))) continue;
    for (const plane of brush.planes) {
      const mat = plane.face.material;
      if (NODRAW.has(mat)) continue;
      const built = faceTriangles(brush, plane);
      if (!built) continue;
      const bucket = meshes[mat] ?? (meshes[mat] = { positions: [], normals: [], uvs: [] });
      for (const tri of built.tris) pushTri(bucket, tri, plane.n, plane.face);
    }
  }

  const targets = new Map();
  for (const ent of entities) {
    if (ent.props.classname === "target_position" && ent.props.targetname && ent.props.origin) {
      targets.set(ent.props.targetname, q3Origin(ent.props.origin));
    }
  }

  const pads = [];
  for (const ent of entities) {
    if (ent.props.classname !== "trigger_push") continue;
    const brush = buildBrush(ent.brushes[0] ?? { tag: "", faces: [] });
    if (brush.verts.length < 4) continue;
    const box = gameBox(boundsOf(brush.verts));
    const target = targets.get(ent.props.target ?? "");
    const from = [(box[0] + box[3]) / 2, box[1], (box[2] + box[5]) / 2];
    const to = target ? toGame(target) : [0, 8, 0];
    const vel = launch(from, to);
    pads.push({
      min: box.slice(0, 3),
      max: box.slice(3),
      ...vel,
    });
  }

  const items = [];
  let n = 0;
  for (const ent of entities) {
    const mapped = ITEM_KIND[ent.props.classname ?? ""];
    if (!mapped || !ent.props.origin) continue;
    const [kind, respawn] = mapped;
    const g = toGame(q3Origin(ent.props.origin));
    items.push({
      id: `q${n++}`,
      kind,
      x: round3(g[0]),
      y: round3(g[1]),
      z: round3(g[2]),
      respawn: Number(ent.props.wait) || respawn,
    });
  }
  items.push(
    { id: "q-rush", kind: "rush", x: -19.4, y: 1.2, z: -16.4, respawn: 22 },
    { id: "q-blink", kind: "blink", x: 25.8, y: 1.6, z: 15.6, respawn: 26 },
  );

  const spawns = [];
  for (const ent of entities) {
    if (ent.props.classname !== "info_player_deathmatch" || !ent.props.origin) continue;
    const origin = q3Origin(ent.props.origin);
    const feet = [origin[0], origin[1], origin[2] - 24];
    const g = toGame(feet);
    const angle = (Number(ent.props.angle) || 0) * (Math.PI / 180);
    spawns.push({
      x: round3(g[0]),
      y: round3(Math.max(0, g[1])),
      z: round3(g[2]),
      yaw: round3(angle - Math.PI / 2),
    });
  }

  const waypoints = [
    { x: 0, y: 0.4, z: 0 },
    { x: 0, y: 1.2, z: 0 },
    ...spawns.map((s) => ({ x: s.x, y: s.y, z: s.z })),
    ...items.map((it) => ({ x: it.x, y: Math.max(0, it.y - 0.8), z: it.z })),
  ];

  const stuck = spawns.filter((s) => pointInSolid(solids, s.x, s.y + 0.05, s.z, 0.3, 1.7));
  const floating = spawns.filter((s) => {
    const floor = solids.some((b) => {
      const above = s.y + 0.2 >= b[4] && s.y - 2 < b[4];
      const over = s.x > b[0] && s.x < b[3] && s.z > b[2] && s.z < b[5];
      return above && over;
    });
    return !floor;
  });

  mkdirSync(dirname(OUT_JSON), { recursive: true });
  const doc = { meshes, solids, pads, items, spawns, waypoints };
  writeFileSync(OUT_JSON, JSON.stringify(doc));

  mkdirSync(OUT_TEX, { recursive: true });
  const written = [];
  for (const name of readdirSync(TEX_DIR)) {
    if (!name.endsWith(".tga")) continue;
    const mat = name.replace(/\.tga$/, "");
    if (NODRAW.has(mat)) continue;
    const png = convertTga(join(TEX_DIR, name));
    writeFileSync(join(OUT_TEX, `${mat}.png`), png);
    written.push(mat);
  }

  const tris = Object.values(meshes).reduce((n, m) => n + m.positions.length / 9, 0);
  console.log(
    JSON.stringify(
      {
        brushes: brushCount,
        skipped,
        triangles: tris,
        solids: solids.length,
        pads: pads.length,
        items: items.length,
        spawns: spawns.length,
        stuck: stuck.length,
        floating: floating.length,
        textures: written,
        jsonBytes: readFileSync(OUT_JSON).length,
      },
      null,
      2,
    ),
  );
  if (stuck.length || spawns.length < 8 || solids.length < 20) {
    process.exitCode = 1;
  }
}

main();

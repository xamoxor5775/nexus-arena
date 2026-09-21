import type { AABB } from "./types";

const EPS = 0.002;
const SKIN = 0.003;

export function aabb(
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
): AABB {
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

export function boxAt(
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
): AABB {
  const hw = w / 2;
  const hd = d / 2;
  return aabb(x - hw, y, z - hd, x + hw, y + h, z + hd);
}

export function overlaps(a: AABB, b: AABB): boolean {
  return (
    a.minX < b.maxX &&
    a.maxX > b.minX &&
    a.minY < b.maxY &&
    a.maxY > b.minY &&
    a.minZ < b.maxZ &&
    a.maxZ > b.minZ
  );
}

export function pointIn(b: AABB, x: number, y: number, z: number): boolean {
  return x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY && z >= b.minZ && z <= b.maxZ;
}

export function bodyBox(x: number, y: number, z: number, hw: number, h: number): AABB {
  return aabb(x - hw, y, z - hw, x + hw, y + h, z + hw);
}

export function blockedAt(
  x: number,
  y: number,
  z: number,
  hw: number,
  h: number,
  solids: AABB[],
): boolean {
  const box = bodyBox(x, y, z, hw, h);
  for (let i = 0; i < solids.length; i++) {
    if (overlaps(box, solids[i]!)) return true;
  }
  return false;
}

export function rayAABB(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  b: AABB,
  maxT: number,
): number | null {
  let tmin = 0;
  let tmax = maxT;
  const origin = [ox, oy, oz];
  const dir = [dx, dy, dz];
  const mins = [b.minX, b.minY, b.minZ];
  const maxs = [b.maxX, b.maxY, b.maxZ];

  for (let i = 0; i < 3; i++) {
    const o = origin[i]!;
    const d = dir[i]!;
    const min = mins[i]!;
    const max = maxs[i]!;
    if (Math.abs(d) < 1e-12) {
      if (o < min || o > max) return null;
      continue;
    }
    const inv = 1 / d;
    let t1 = (min - o) * inv;
    let t2 = (max - o) * inv;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin <= maxT ? tmin : null;
}

function expandFoot(s: AABB, hw: number, h: number): AABB {
  return {
    minX: s.minX - hw,
    maxX: s.maxX + hw,
    minY: s.minY - h,
    maxY: s.maxY,
    minZ: s.minZ - hw,
    maxZ: s.maxZ + hw,
  };
}

function yOverlaps(y: number, h: number, s: AABB): boolean {
  return y + 0.05 < s.maxY && y + h - 0.02 > s.minY;
}

function sweepExpanded(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  hw: number,
  h: number,
  solids: AABB[],
  maxT = 1,
): { t: number; hit: AABB } | null {
  if (dx === 0 && dy === 0 && dz === 0) return null;
  let best = maxT;
  let hit: AABB | null = null;
  for (let i = 0; i < solids.length; i++) {
    const s = solids[i]!;
    const e = expandFoot(s, hw, h);
    const t = rayAABB(ox, oy, oz, dx, dy, dz, e, best);
    if (t === null || t < 1e-5 || t > best) continue;
    best = t;
    hit = s;
  }
  return hit ? { t: best, hit } : null;
}

function slideCircle(
  x: number,
  z: number,
  y: number,
  h: number,
  r: number,
  solids: AABB[],
): { x: number; z: number; nx: number; nz: number; wall: boolean } {
  let nx = 0;
  let nz = 0;
  let wall = false;
  const r2 = r * r;
  for (let i = 0; i < solids.length; i++) {
    const s = solids[i]!;
    if (!yOverlaps(y, h, s)) continue;
    const cx = Math.min(Math.max(x, s.minX), s.maxX);
    const cz = Math.min(Math.max(z, s.minZ), s.maxZ);
    let dx = x - cx;
    let dz = z - cz;
    const inside = x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ;
    if (inside) {
      const left = x - s.minX;
      const right = s.maxX - x;
      const near = z - s.minZ;
      const far = s.maxZ - z;
      const m = Math.min(left, right, near, far);
      if (m === left) {
        x = s.minX - r - SKIN;
        nx -= 1;
      } else if (m === right) {
        x = s.maxX + r + SKIN;
        nx += 1;
      } else if (m === near) {
        z = s.minZ - r - SKIN;
        nz -= 1;
      } else {
        z = s.maxZ + r + SKIN;
        nz += 1;
      }
      wall = true;
      continue;
    }
    const d2 = dx * dx + dz * dz;
    if (d2 >= r2 || d2 < 1e-12) continue;
    const d = Math.sqrt(d2);
    const push = r + SKIN - d;
    dx /= d;
    dz /= d;
    x += dx * push;
    z += dz * push;
    nx += dx;
    nz += dz;
    wall = true;
  }
  return { x, z, nx, nz, wall };
}

export function depenetrate(
  x: number,
  y: number,
  z: number,
  hw: number,
  h: number,
  solids: AABB[],
): { x: number; y: number; z: number } {
  const box = bodyBox(x, y, z, hw, h);
  for (let i = 0; i < solids.length; i++) {
    const s = solids[i]!;
    if (!overlaps(box, s)) continue;
    const penX = Math.min(box.maxX - s.minX, s.maxX - box.minX);
    const penY = Math.min(box.maxY - s.minY, s.maxY - box.minY);
    const penZ = Math.min(box.maxZ - s.minZ, s.maxZ - box.minZ);
    if (penY <= penX && penY <= penZ) {
      const above = y + h * 0.5 >= (s.minY + s.maxY) * 0.5;
      y = above ? s.maxY + EPS : s.minY - h - EPS;
    } else if (penX <= penZ) {
      const right = x >= (s.minX + s.maxX) * 0.5;
      x = right ? s.maxX + hw + EPS : s.minX - hw - EPS;
    } else {
      const fwd = z >= (s.minZ + s.maxZ) * 0.5;
      z = fwd ? s.maxZ + hw + EPS : s.minZ - hw - EPS;
    }
    box.minX = x - hw;
    box.maxX = x + hw;
    box.minY = y;
    box.maxY = y + h;
    box.minZ = z - hw;
    box.maxZ = z + hw;
  }
  const slide = slideCircle(x, z, y, h, hw, solids);
  return { x: slide.x, y, z: slide.z };
}

export type MoveResult = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  grounded: boolean;
  hitHead: boolean;
  wall: boolean;
};

export function moveBody(
  x: number,
  y: number,
  z: number,
  vx: number,
  vy: number,
  vz: number,
  hw: number,
  h: number,
  dt: number,
  solids: AABB[],
  stepHeight = 0.5,
  groundSnap = 0.5,
): MoveResult {
  const dist = Math.hypot(vx, vy, vz) * dt;
  const steps = dist > 0.24 ? Math.min(8, Math.ceil(dist / 0.18)) : 1;
  let grounded = false;
  let hitHead = false;
  let wall = false;
  const slice = dt / steps;
  const start = depenetrate(x, y, z, hw, h, solids);
  x = start.x;
  y = start.y;
  z = start.z;
  for (let s = 0; s < steps; s++) {
    const r = moveBodyOnce(x, y, z, vx, vy, vz, hw, h, slice, solids, stepHeight, groundSnap);
    x = r.x;
    y = r.y;
    z = r.z;
    vx = r.vx;
    vy = r.vy;
    vz = r.vz;
    grounded = r.grounded;
    hitHead = r.hitHead || hitHead;
    wall = r.wall || wall;
  }
  return { x, y, z, vx, vy, vz, grounded, hitHead, wall };
}

function moveBodyOnce(
  x: number,
  y: number,
  z: number,
  vx: number,
  vy: number,
  vz: number,
  hw: number,
  h: number,
  dt: number,
  solids: AABB[],
  stepHeight: number,
  groundSnap: number,
): MoveResult {
  let grounded = false;
  let hitHead = false;
  let wall = false;

  const tryHoriz = (axis: "x" | "z") => {
    const delta = (axis === "x" ? vx : vz) * dt;
    if (Math.abs(delta) < 1e-8) return;
    const dx = axis === "x" ? delta : 0;
    const dz = axis === "z" ? delta : 0;
    const hit = sweepExpanded(x, y, z, dx, 0, dz, hw, h, solids);
    if (!hit) {
      if (axis === "x") x += delta;
      else z += delta;
      return;
    }

    if (vy <= 0.2) {
      const rise = hit.hit.maxY - y;
      if (rise > 0.02 && rise <= stepHeight) {
        const up = sweepExpanded(x, y, z, 0, rise + EPS, 0, hw, h, solids);
        const across = sweepExpanded(x, y + rise + EPS, z, dx, 0, dz, hw, h, solids);
        if (!up && !across) {
          y += rise + EPS;
          if (axis === "x") x += delta;
          else z += delta;
          grounded = true;
          return;
        }
      }
    }

    const t = Math.max(0, hit.t - SKIN / Math.max(1e-4, Math.abs(delta)));
    if (axis === "x") x += delta * t;
    else z += delta * t;
    if (axis === "x") vx = 0;
    else vz = 0;
    wall = true;
  };

  tryHoriz("x");
  tryHoriz("z");

  const circled = slideCircle(x, z, y, h, hw, solids);
  x = circled.x;
  z = circled.z;
  if (circled.wall) {
    wall = true;
    const nlen = Math.hypot(circled.nx, circled.nz);
    if (nlen > 1e-6) {
      const nx = circled.nx / nlen;
      const nz = circled.nz / nlen;
      const into = vx * nx + vz * nz;
      if (into < 0) {
        vx -= nx * into;
        vz -= nz * into;
      }
    }
  }

  const dy = vy * dt;
  if (Math.abs(dy) > 1e-8) {
    const hitY = sweepExpanded(x, y, z, 0, dy, 0, hw, h, solids);
    if (!hitY) {
      y += dy;
    } else {
      const t = Math.max(0, hitY.t - SKIN / Math.max(1e-4, Math.abs(dy)));
      y += dy * t;
      if (dy < 0) {
        y = hitY.hit.maxY + EPS;
        vy = 0;
        grounded = true;
      } else {
        y = hitY.hit.minY - h - EPS;
        vy = 0;
        hitHead = true;
      }
    }
  }

  if (!grounded && vy <= 0.28) {
    const down = sweepExpanded(x, y, z, 0, -groundSnap, 0, hw, h, solids);
    if (down && down.t < 1) {
      y = down.hit.maxY + EPS;
      vy = 0;
      grounded = true;
    }
  }

  return { x, y, z, vx, vy, vz, grounded, hitHead, wall };
}

export function closestPointAABB(x: number, y: number, z: number, b: AABB) {
  return {
    x: Math.min(Math.max(x, b.minX), b.maxX),
    y: Math.min(Math.max(y, b.minY), b.maxY),
    z: Math.min(Math.max(z, b.minZ), b.maxZ),
  };
}

export function raycastWorld(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxT: number,
  solids: AABB[],
  radius = 0,
): number | null {
  let best: number | null = null;
  for (let i = 0; i < solids.length; i++) {
    const s = solids[i]!;
    const e =
      radius > 0
        ? aabb(s.minX - radius, s.minY - radius, s.minZ - radius, s.maxX + radius, s.maxY + radius, s.maxZ + radius)
        : s;
    const t = rayAABB(ox, oy, oz, dx, dy, dz, e, best ?? maxT);
    if (t !== null && t > 0 && (best === null || t < best)) best = t;
  }
  return best;
}

import * as THREE from "three";
import { boxAt } from "./collision";
import type { AABB, FlagPad, HazardZone, ItemPad, JumpPad, Spawn, TeleportGate, WaterZone } from "./types";
import { isPower, POWER_META, ROUND_SECONDS } from "./constants";
import { loadArenaMaps, loadArenaSurface, loadPozoSurface, loadSkyTex, loadTex, pickupTexture, jumpPadTex, portalTex, loadIconTex, isLoDevice, smokePuffTex, skySphereGeo } from "./textures";
import { createArenaLights, type ArenaLights } from "./lighting";
import { BoxBatch, bakeMeshes, instanceCylinders, instanceDiscs, instancePlanes, stampDecks } from "./instancing";
import { mountPozoCar } from "./pozoCar";

export type ArenaData = {
  group: THREE.Group;
  solids: AABB[];
  pads: JumpPad[];
  hazards?: HazardZone[];
  teleports?: TeleportGate[];
  items: ItemPad[];
  spawns: Spawn[];
  waypoints: { x: number; y: number; z: number }[];
  lights: ArenaLights;
  flags?: FlagPad[];
  killY?: number;
  gravity?: number;
  jumpVel?: number;
  water?: WaterZone[];
  update?: (now: number, dt: number) => void;
  startCycle?: (epochMs: number) => void;
  dispose: () => void;
};

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

export function stampJumpPads(
  group: THREE.Group,
  mats: THREE.Material[],
  geos: THREE.BufferGeometry[],
  spots: Array<{ x: number; y: number; z: number }>,
  radius = 1.08,
) {
  const map = jumpPadTex();
  const mat = new THREE.MeshStandardMaterial({
    map,
    color: 0xffffff,
    emissive: 0xfff0a8,
    emissiveMap: map,
    emissiveIntensity: 0.82,
    roughness: 0.34,
    metalness: 0.42,
  });
  mats.push(mat);
  geos.push(instanceDiscs(group, mat, spots, radius).geo);
}

export function stampPortals(
  group: THREE.Group,
  mats: THREE.Material[],
  geos: THREE.BufferGeometry[],
  spots: Array<{ x: number; y: number; z: number }>,
  radius = 1.12,
): THREE.Mesh[] {
  const map = portalTex();
  const mat = new THREE.MeshBasicMaterial({
    map,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: false,
    depthWrite: false,
  });
  mats.push(mat);
  const geo = new THREE.CircleGeometry(radius, 28);
  geos.push(geo);
  const discs: THREE.Mesh[] = [];
  for (const spot of spots) {
    const disc = new THREE.Mesh(geo, mat);
    disc.position.set(spot.x, spot.y, spot.z);
    disc.renderOrder = 2;
    group.add(disc);
    discs.push(disc);
  }
  return discs;
}

/** Sur del mapa: magnitud Y = altura de la torre (antes profundidad del pozo). */
const CORE_TUBE = { x: 0, z: -42, y: 15.2, r: 4.05 };

/** UV en metros de mundo para cilindros abiertos (túnel / pozo). */
function scaleOpenCylinderUVs(geo: THREE.BufferGeometry, radius: number, height: number, tileM = 2.15) {
  const uv = geo.getAttribute("uv") as THREE.BufferAttribute;
  const around = (Math.PI * 2 * radius) / tileM;
  const up = height / tileM;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * around, uv.getY(i) * up);
  uv.needsUpdate = true;
}

/** Banda horizontal con hueco. CylinderGeometry rellena el centro y tapa el fuste. */
function annularCylinder(rIn: number, rOut: number, height: number, segments: number) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, Math.max(rOut, rIn + 0.05), 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, rIn, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    curveSegments: Math.max(12, segments),
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -height / 2, 0);
  return geo;
}

function addAnnulus(
  group: THREE.Group,
  geos: THREE.BufferGeometry[],
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  rIn: number,
  rOut: number,
  height: number,
  segments: number,
) {
  const geo = annularCylinder(rIn, rOut, height, segments);
  geos.push(geo);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  group.add(mesh);
}

function punchRectHole(
  fill: (x: number, z: number, w: number, d: number) => void,
  cx: number,
  cz: number,
  holeR: number,
  x: number,
  z: number,
  w: number,
  d: number,
) {
  const x0 = x - w / 2;
  const x1 = x + w / 2;
  const z0 = z - d / 2;
  const z1 = z + d / 2;
  const hx0 = cx - holeR;
  const hx1 = cx + holeR;
  const hz0 = cz - holeR;
  const hz1 = cz + holeR;
  if (hx1 <= x0 || hx0 >= x1 || hz1 <= z0 || hz0 >= z1) {
    fill(x, z, w, d);
    return;
  }
  if (z0 < hz0) fill(x, (z0 + hz0) / 2, w, hz0 - z0);
  if (z1 > hz1) fill(x, (hz1 + z1) / 2, w, z1 - hz1);
  const midZ0 = Math.max(z0, hz0);
  const midZ1 = Math.min(z1, hz1);
  const midD = midZ1 - midZ0;
  if (midD > 0.06) {
    const midZ = (midZ0 + midZ1) / 2;
    if (x0 < hx0) fill((x0 + hx0) / 2, midZ, hx0 - x0, midD);
    if (x1 > hx1) fill((hx1 + x1) / 2, midZ, x1 - hx1, midD);
  }
}

function canvasTex(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, w: number, h: number) {
  if (typeof document === "undefined") return new THREE.Texture();
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = isLoDevice() ? 2 : 4;
  tex.needsUpdate = true;
  return tex;
}

function chimueloWallTex() {
  const mobile = isLoDevice();
  return canvasTex((ctx, w, h) => {
    ctx.fillStyle = "#07151c";
    ctx.fillRect(0, 0, w, h);
    const rim = ctx.createLinearGradient(0, 0, w, 0);
    rim.addColorStop(0, "#1a6f68");
    rim.addColorStop(0.5, "#9ffff2");
    rim.addColorStop(1, "#1a6f68");
    ctx.strokeStyle = rim;
    ctx.lineWidth = 28;
    ctx.strokeRect(22, 22, w - 44, h - 44);
    ctx.strokeStyle = "#3ae8d2";
    ctx.lineWidth = 8;
    ctx.strokeRect(48, 48, w - 96, h - 96);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "#3ae8d2";
    ctx.shadowBlur = 36;
    ctx.fillStyle = "#f7fffc";
    ctx.font = "800 210px Arial, Helvetica, sans-serif";
    ctx.fillText("GRACIAS", w / 2, h * 0.36);
    ctx.font = "800 248px Arial, Helvetica, sans-serif";
    ctx.fillText("CHIMUELO", w / 2, h * 0.68);
  }, mobile ? 1024 : 2048, mobile ? 384 : 768);
}

function respectFlagTex() {
  const mobile = isLoDevice();
  return canvasTex((ctx, w, h) => {
    ctx.fillStyle = "#101114";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#f4f4f1";
    ctx.fillRect(0, h * 0.42, w, h * 0.14);
    ctx.fillStyle = "#3ae8d2";
    ctx.fillRect(0, h * 0.56, w, h * 0.035);
    ctx.fillStyle = "#f4f4f1";
    ctx.beginPath();
    ctx.moveTo(w * 0.5, h * 0.14);
    ctx.lineTo(w * 0.62, h * 0.24);
    ctx.lineTo(w * 0.5, h * 0.34);
    ctx.lineTo(w * 0.38, h * 0.24);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#3ae8d2";
    ctx.lineWidth = 10;
    ctx.strokeRect(8, 8, w - 16, h - 16);
  }, mobile ? 256 : 512, mobile ? 384 : 768);
}

function hangRespectFlag(
  group: THREE.Group,
  geos: THREE.BufferGeometry[],
  mats: THREE.Material[],
  flagMat: THREE.Material,
  x: number,
  y: number,
  z: number,
  side: number,
) {
  const poleGeo = new THREE.CylinderGeometry(0.05, 0.06, 3.2, 8);
  geos.push(poleGeo);
  const poleMat = new THREE.MeshStandardMaterial({
    color: 0xb8c4c2,
    metalness: 0.72,
    roughness: 0.28,
    emissive: 0x1a3c38,
    emissiveIntensity: 0.2,
  });
  mats.push(poleMat);
  const pole = new THREE.Mesh(poleGeo, poleMat);
  pole.position.set(x, y + 1.6, z);
  pole.castShadow = false;
  group.add(pole);
  const armGeo = new THREE.BoxGeometry(1.18, 0.07, 0.07);
  geos.push(armGeo);
  const arm = new THREE.Mesh(armGeo, poleMat);
  arm.position.set(x + side * 0.52, y + 3.12, z + 0.04);
  group.add(arm);
  const clothGeo = new THREE.PlaneGeometry(1.12, 1.78, 1, 6);
  geos.push(clothGeo);
  const cloth = new THREE.Mesh(clothGeo, flagMat);
  cloth.position.set(x + side * 0.58, y + 2.18, z + 0.08);
  cloth.rotation.z = side * 0.06;
  cloth.castShadow = false;
  group.add(cloth);
}

function buildCoreTube(
  batch: BoxBatch,
  solids: AABB[],
  group: THREE.Group,
  geos: THREE.BufferGeometry[],
  mats: THREE.Material[],
  metalMat: THREE.Material,
  mossMat: THREE.Material,
  metalWallMat: THREE.Material,
  items: ItemPad[],
  waypoints: { x: number; y: number; z: number }[],
  hazards: HazardZone[],
): { update: (now: number, dt: number) => void; dispose: () => void } {
  // Trituradora volteada 180° → torre de pizza sobre el suelo.
  // Se mantienen rotores, hazard crush, humo, ítems, luces, cartel y banderas.
  const CX = CORE_TUBE.x;
  const CZ = CORE_TUBE.z;
  const TUBE_R = CORE_TUBE.r;
  const shaftH = Math.abs(CORE_TUBE.y); // 15.2
  const HALL_Y = shaftH; // antes CORE_Y bajo tierra
  const midY = 4.6; // antes crypt
  const PIT_R = 3.15;
  const PIT_Y = HALL_Y + 3.55; // cámara de rotores arriba
  const lite = isLoDevice();

  // --- Piso de vidrio (ventana transparente + colisión: nadie cae) ---
  const glassMat = lite
    ? new THREE.MeshStandardMaterial({
        color: 0xb8fff6,
        transparent: true,
        opacity: 0.42,
        roughness: 0.12,
        metalness: 0.08,
        emissive: 0x1a7068,
        emissiveIntensity: 0.4,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    : new THREE.MeshPhysicalMaterial({
        color: 0xb8fff6,
        transparent: true,
        opacity: 0.38,
        roughness: 0.06,
        metalness: 0.05,
        transmission: 0.72,
        thickness: 0.35,
        ior: 1.45,
        emissive: 0x1a7068,
        emissiveIntensity: 0.35,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
  mats.push(glassMat);
  const glassGeo = new THREE.CircleGeometry(TUBE_R + 0.2, lite ? 24 : 40);
  glassGeo.rotateX(-Math.PI / 2);
  geos.push(glassGeo);
  const glass = new THREE.Mesh(glassGeo, glassMat);
  glass.name = "pozo-tower-glass-floor";
  glass.position.set(CX, 0.05, CZ);
  glass.receiveShadow = true;
  glass.castShadow = false;
  group.add(glass);
  // Colisión sólida del vidrio (caja fina que tapa el hueco).
  solids.push(boxAt(CX, -0.02, CZ, (TUBE_R + 0.35) * 2, 0.16, (TUBE_R + 0.35) * 2));

  // Anillo / base tipo torre de pizza (crema + rojo).
  const creamMat = new THREE.MeshStandardMaterial({
    color: 0xf3e2c4,
    metalness: 0.12,
    roughness: 0.55,
    emissive: 0x4a3020,
    emissiveIntensity: 0.08,
  });
  const tomatoMat = new THREE.MeshStandardMaterial({
    color: 0xc43a28,
    metalness: 0.18,
    roughness: 0.42,
    emissive: 0xff4a20,
    emissiveIntensity: 0.35,
    toneMapped: false,
  });
  mats.push(creamMat, tomatoMat);
  addAnnulus(group, geos, creamMat, CX, 0.12, CZ, TUBE_R + 0.15, TUBE_R + 1.25, 0.22, 36);
  addAnnulus(group, geos, tomatoMat, CX, 0.32, CZ, TUBE_R + 0.05, TUBE_R + 0.55, 0.16, 36);

  // Borde irregular neón (sigue siendo el “rim” de la boca, ahora base de la torre).
  const rimGeo = new THREE.TorusGeometry(TUBE_R + 0.06, 0.11, 12, 64);
  {
    const pos = rimGeo.getAttribute("position") as THREE.BufferAttribute;
    const majorR = TUBE_R + 0.06;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const ang = Math.atan2(y, x);
      const wave = 1 + 0.09 * Math.sin(ang * 5) + 0.055 * Math.sin(ang * 11 + 0.7) + 0.03 * Math.sin(ang * 17 - 1.2);
      const dent = 1 - 0.12 * Math.max(0, Math.sin(ang * 3 + 0.4)) ** 3;
      const s = wave * dent;
      const radial = Math.hypot(x, y) || 1;
      const nx = (x / radial) * (majorR * (s - 1) + radial);
      const ny = (y / radial) * (majorR * (s - 1) + radial);
      pos.setXYZ(i, nx, ny, z + 0.04 * Math.sin(ang * 7) + 0.025 * Math.cos(ang * 13));
    }
    pos.needsUpdate = true;
    rimGeo.computeVertexNormals();
  }
  geos.push(rimGeo);
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0x9ffff2,
    emissive: 0x3ae8d2,
    emissiveIntensity: 1.55,
    metalness: 0.6,
    roughness: 0.14,
    toneMapped: false,
  });
  mats.push(rimMat);
  const rim = new THREE.Mesh(rimGeo, rimMat);
  rim.position.set(CX, 0.42, CZ);
  rim.rotation.x = Math.PI / 2;
  rim.castShadow = false;
  group.add(rim);

  // Daños / escombros en la base (mismo vibe).
  const damageMat = new THREE.MeshStandardMaterial({ color: 0x6a7578, metalness: 0.78, roughness: 0.42 });
  const scorchedMat = new THREE.MeshStandardMaterial({
    color: 0x1a1210, metalness: 0.18, roughness: 0.92, emissive: 0x2a1008, emissiveIntensity: 0.25,
  });
  mats.push(damageMat, scorchedMat);
  const debrisCount = lite ? 12 : 22;
  for (let i = 0; i < debrisCount; i++) {
    const a = (i / debrisCount) * Math.PI * 2 + ((i * 17) % 7) * 0.11;
    const r = TUBE_R + 0.85 + ((i * 13) % 5) * 0.28 + (i % 3) * 0.1;
    const px = CX + Math.cos(a) * r;
    const pz = CZ + Math.sin(a) * r;
    const kind = i % 5;
    if (kind === 0) addBox(batch, solids, damageMat, px, 0.06 + (i % 4) * 0.015, pz, 0.75 + (i % 3) * 0.18, 0.07, 0.38 + (i % 2) * 0.14, false);
    else if (kind === 1) addBox(batch, solids, damageMat, px, 0.12, pz, 0.42, 0.18, 0.26, false);
    else if (kind === 2) addBox(batch, solids, scorchedMat, px, 0.02, pz, 0.95 + (i % 3) * 0.2, 0.03, 0.6 + (i % 2) * 0.25, false);
    else if (kind === 3) addBox(batch, solids, damageMat, px, 0.28, pz, 0.1, 0.5, 0.1, false);
    else addBox(batch, solids, damageMat, px, 0.08, pz, 0.3, 0.14, 0.48, false);
  }

  // Anillos estructurales del fuste (pisos de la torre).
  for (let k = 0; k < (lite ? 4 : 7); k++) {
    const y = 1.1 + (k / (lite ? 3 : 6)) * (shaftH - 2.2);
    const stripe = k % 2 === 0 ? tomatoMat : creamMat;
    addAnnulus(group, geos, stripe, CX, y, CZ, TUBE_R + 0.18, TUBE_R + 0.42, 0.22, lite ? 16 : 28);
  }

  // Fuste interior / exterior (metal wall-v4), hacia ARRIBA.
  // Interior = BackSide: si no, desde dentro se ve a través y aparece el cartel café (Chimuelo).
  const liningMat = (metalWallMat as THREE.Material).clone();
  liningMat.side = THREE.BackSide;
  mats.push(liningMat);
  const liningGeo = new THREE.CylinderGeometry(TUBE_R - 0.16, TUBE_R - 0.16, shaftH, lite ? 20 : 40, 1, true);
  scaleOpenCylinderUVs(liningGeo, TUBE_R - 0.16, shaftH, 2.05);
  geos.push(liningGeo);
  const lining = new THREE.Mesh(liningGeo, liningMat);
  lining.name = "pozo-crusher-lining";
  lining.position.set(CX, shaftH / 2, CZ);
  lining.castShadow = false;
  group.add(lining);

  const hullGeo = new THREE.CylinderGeometry(TUBE_R + 0.28, TUBE_R + 0.42, shaftH, lite ? 20 : 40, 1, true);
  scaleOpenCylinderUVs(hullGeo, TUBE_R + 0.35, shaftH, 2.2);
  geos.push(hullGeo);
  const hull = new THREE.Mesh(hullGeo, metalWallMat);
  hull.name = "pozo-pizza-tower-hull";
  hull.position.set(CX, shaftH / 2, CZ);
  hull.castShadow = !lite;
  group.add(hull);

  // Ventanas iluminadas (aros con huecos visuales + luces cálidas).
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0xffe2a0,
    emissive: 0xffb040,
    emissiveIntensity: 1.4,
    metalness: 0.05,
    roughness: 0.25,
    toneMapped: false,
    transparent: true,
    opacity: 0.92,
  });
  mats.push(windowMat);
  const winGeo = new THREE.BoxGeometry(0.55, 0.85, 0.12);
  geos.push(winGeo);
  const floorCount = lite ? 4 : 6;
  for (let f = 0; f < floorCount; f++) {
    const fy = 2.2 + f * (shaftH - 3.5) / Math.max(1, floorCount - 1);
    const nWin = lite ? 8 : 12;
    for (let i = 0; i < nWin; i++) {
      const a = (i / nWin) * Math.PI * 2 + f * 0.15;
      const wr = TUBE_R + 0.36;
      const pane = new THREE.Mesh(winGeo, windowMat);
      pane.position.set(CX + Math.cos(a) * wr, fy, CZ + Math.sin(a) * wr);
      pane.rotation.y = -a;
      pane.castShadow = false;
      group.add(pane);
    }
  }

  // Corona / embudo arriba (el embudo de caída, ahora remate de torre).
  const funnelH = 3.4;
  const funnelRBot = TUBE_R + 0.2;
  const funnelRTop = TUBE_R + 1.55;
  const funnelGeo = new THREE.CylinderGeometry(funnelRTop, funnelRBot, funnelH, lite ? 20 : 40, 1, true);
  scaleOpenCylinderUVs(funnelGeo, (funnelRTop + funnelRBot) * 0.5, funnelH, 1.85);
  const funnel = new THREE.Mesh(funnelGeo, (metalWallMat as THREE.Material).clone());
  funnel.name = "pozo-crusher-funnel";
  (funnel.material as THREE.Material).side = THREE.DoubleSide;
  mats.push(funnel.material as THREE.Material);
  funnel.position.set(CX, PIT_Y + 1.1 + funnelH * 0.5, CZ);
  geos.push(funnelGeo);
  group.add(funnel);
  // Franja tomate en la corona.
  addAnnulus(group, geos, tomatoMat, CX, PIT_Y + 0.85, CZ, TUBE_R - 0.1, TUBE_R + 1.2, 0.28, 28);

  // Costillas interiores del fuste.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    addBox(
      batch, solids, metalMat,
      CX + Math.cos(a) * (TUBE_R - 0.28), 0.2, CZ + Math.sin(a) * (TUBE_R - 0.28),
      0.12, shaftH - 0.4, 0.12, false,
    );
  }

  // Piso intermedio y paredes del fuste; dejan huecos donde llega la escalera.
  const wallSegs = lite ? 16 : 28;
  const wallR = TUBE_R + 0.12;
  const wallBox = 0.7;
  for (let i = 0; i < wallSegs; i++) {
    const a = (i / wallSegs) * Math.PI * 2;
    const x = CX + Math.cos(a) * wallR;
    const z = CZ + Math.sin(a) * wallR;
    // Hueco de acceso a media altura / cima por el lado de la escalera (sur-este).
    const stairDoor = a > -0.55 && a < 0.85;
    if (!stairDoor) addBox(batch, solids, metalMat, x, midY, z, wallBox, HALL_Y - midY, wallBox);
    const groundDoor = Math.sin(a) > 0.55 || stairDoor;
    if (!groundDoor) addBox(batch, solids, metalMat, x, 0.15, z, wallBox, midY - 0.15, wallBox);
  }
  // Pasarela intermedia SOLO por fuera del fuste (anillo exterior).
  // Evita el “cuadro café” rectangular que tapaba la vista al mirar hacia arriba.
  {
    const ringSegs = lite ? 16 : 24;
    const ringR = TUBE_R + 1.55;
    const ringW = 1.85;
    for (let i = 0; i < ringSegs; i++) {
      const a = (i / ringSegs) * Math.PI * 2;
      addBox(
        batch,
        solids,
        metalMat,
        CX + Math.cos(a) * ringR,
        midY - 0.18,
        CZ + Math.sin(a) * ringR,
        ringW,
        0.18,
        0.95,
      );
    }
  }

  // Escalera de caracol exterior: peldaños ≤ 0.32 m (stepHeight del motor = 0.5).
  // Da ~1.35 vueltas hasta la sala alta (cima), con descansos en midY y HALL_Y.
  const hallR = 6.55;
  const railMat = new THREE.MeshStandardMaterial({
    color: 0x9ffff2, emissive: 0x3ae8d2, emissiveIntensity: 1.15,
    metalness: 0.55, roughness: 0.18, toneMapped: false,
  });
  mats.push(railMat);
  {
    const stepRise = 0.3;
    const stairR = TUBE_R + 2.35;
    const treadW = 1.55;
    const treadD = 0.78;
    const totalRise = HALL_Y;
    const stepN = Math.ceil(totalRise / stepRise);
    const turns = 1.35;
    const railInner: THREE.Vector3[] = [];
    const railOuter: THREE.Vector3[] = [];
    for (let i = 0; i <= stepN; i++) {
      const t = i / stepN;
      const a = -Math.PI * 0.15 + t * turns * Math.PI * 2; // empieza al sur-este
      const y = Math.min(HALL_Y, i * stepRise);
      const x = CX + Math.cos(a) * stairR;
      const z = CZ + Math.sin(a) * stairR;
      if (i < stepN) {
        const y0 = i * stepRise;
        addBox(batch, solids, metalMat, x, y0, z, treadW, stepRise + 0.04, treadD);
        // Peldaño orientado tangencialmente (caja axis-aligned: un poco más ancha radialmente).
        const rx = CX + Math.cos(a) * (stairR + 0.55);
        const rz = CZ + Math.sin(a) * (stairR + 0.55);
        addBox(batch, solids, metalMat, rx, y0, rz, 0.35, stepRise + 0.04, treadD * 0.85, false);
      }
      // Descansos en piso medio y cima.
      const nearMid = Math.abs(y - midY) < stepRise * 0.6;
      const nearTop = Math.abs(y - HALL_Y) < stepRise * 0.6;
      if (nearMid || nearTop || i % 8 === 0) {
        addBox(batch, solids, metalMat, x, Math.max(0, y - 0.08), z, treadW + 0.9, 0.16, treadW + 0.5);
        waypoints.push({ x, y, z });
      }
      railInner.push(new THREE.Vector3(
        CX + Math.cos(a) * (stairR - treadW * 0.35),
        y + 0.85,
        CZ + Math.sin(a) * (stairR - treadW * 0.35),
      ));
      railOuter.push(new THREE.Vector3(
        CX + Math.cos(a) * (stairR + treadW * 0.45),
        y + 0.85,
        CZ + Math.sin(a) * (stairR + treadW * 0.45),
      ));
    }
    // Plataforma de llegada a la cima (conecta con el anillo de la sala).
    const topA = -Math.PI * 0.15 + turns * Math.PI * 2;
    const topX = CX + Math.cos(topA) * (stairR + 0.2);
    const topZ = CZ + Math.sin(topA) * (stairR + 0.2);
    addBox(batch, solids, metalMat, topX, HALL_Y - 0.12, topZ, 3.2, 0.2, 3.2);
    // Pasarela corta hacia el anillo interior de la sala alta.
    addBox(
      batch, solids, metalMat,
      CX + Math.cos(topA) * (hallR * 0.72),
      HALL_Y - 0.12,
      CZ + Math.sin(topA) * (hallR * 0.72),
      2.4, 0.2, 2.4,
    );
    waypoints.push({ x: topX, y: HALL_Y, z: topZ });
    for (const points of [railInner, railOuter]) {
      const railGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), lite ? 40 : 72, 0.05, 5, false);
      geos.push(railGeo);
      const rail = new THREE.Mesh(railGeo, railMat);
      rail.castShadow = false;
      group.add(rail);
    }
  }
  // Piso de la sala alta: RingGeometry (círculo limpio) + colisión fuera del pozo.
  {
    const hallFloorGeo = new THREE.RingGeometry(PIT_R + 0.08, hallR - 0.1, lite ? 28 : 48);
    hallFloorGeo.rotateX(-Math.PI / 2);
    geos.push(hallFloorGeo);
    const hallFloor = new THREE.Mesh(hallFloorGeo, metalMat);
    hallFloor.name = "pozo-tower-hall-floor";
    hallFloor.position.set(CX, HALL_Y, CZ);
    hallFloor.receiveShadow = !lite;
    group.add(hallFloor);
    const hallSegs = lite ? 18 : 28;
    const hallRingR = (PIT_R + hallR) * 0.52;
    const hallRingW = Math.max(0.9, (hallR - PIT_R) * 0.42);
    for (let i = 0; i < hallSegs; i++) {
      const a = (i / hallSegs) * Math.PI * 2;
      addBox(
        batch,
        solids,
        metalMat,
        CX + Math.cos(a) * hallRingR,
        HALL_Y - 0.16,
        CZ + Math.sin(a) * hallRingR,
        hallRingW,
        0.16,
        0.85,
      );
    }
  }

  const pitFloorTex = loadTex("/textures/surfaces/lava-floor.webp", 1, 1);
  const pitFloorMat = new THREE.MeshLambertMaterial({
    map: pitFloorTex, color: 0xffffff, emissive: 0xff4a18, emissiveMap: pitFloorTex, emissiveIntensity: 0.48,
  });
  mats.push(pitFloorMat);
  const pitGeo = new THREE.CircleGeometry(PIT_R - 0.05, lite ? 18 : 24);
  pitGeo.rotateX(-Math.PI / 2);
  const pitUv = pitGeo.getAttribute("uv") as THREE.BufferAttribute;
  const pitTiles = (PIT_R * 2) / 2.2;
  for (let i = 0; i < pitUv.count; i++) pitUv.setXY(i, pitUv.getX(i) * pitTiles, pitUv.getY(i) * pitTiles);
  const pit = new THREE.Mesh(pitGeo, pitFloorMat);
  pit.position.set(CX, PIT_Y + 0.22, CZ);
  pit.castShadow = false;
  pit.receiveShadow = false;
  group.add(pit);
  geos.push(pitGeo);

  const bladeMat = new THREE.MeshLambertMaterial({ color: 0xb7c0c8, emissive: 0xff3a12, emissiveIntensity: 0.34 });
  mats.push(bladeMat);
  const toothN = lite ? 5 : 8;
  const toothGeo = new THREE.BoxGeometry(1.35, 0.16, 0.22);
  const hubGeo = new THREE.CylinderGeometry(0.42, 0.55, 0.28, lite ? 8 : 10);
  geos.push(toothGeo, hubGeo);
  const makeRotor = (y: number, reach: number) => {
    const rotor = new THREE.Group();
    rotor.position.set(CX, y, CZ);
    const hub = new THREE.Mesh(hubGeo, metalMat);
    hub.castShadow = false;
    rotor.add(hub);
    for (let i = 0; i < toothN; i++) {
      const a = (i / toothN) * Math.PI * 2;
      const tooth = new THREE.Mesh(toothGeo, bladeMat);
      tooth.position.set(Math.cos(a) * reach, 0, Math.sin(a) * reach);
      tooth.rotation.y = -a;
      tooth.castShadow = false;
      rotor.add(tooth);
    }
    group.add(rotor);
    return rotor;
  };
  const rotorLo = makeRotor(PIT_Y + 0.55, PIT_R * 0.72);
  const rotorHi = makeRotor(PIT_Y + 1.45, PIT_R * 0.58);

  const wellH = PIT_Y - HALL_Y;
  const wellMat = (metalWallMat as THREE.Material).clone();
  wellMat.side = THREE.BackSide;
  mats.push(wellMat);
  const wellGeo = new THREE.CylinderGeometry(PIT_R, PIT_R, wellH, lite ? 16 : 24, 1, true);
  scaleOpenCylinderUVs(wellGeo, PIT_R, wellH, 1.9);
  geos.push(wellGeo);
  const well = new THREE.Mesh(wellGeo, wellMat);
  well.name = "pozo-crusher-well";
  well.position.set(CX, HALL_Y + wellH / 2, CZ);
  well.castShadow = false;
  group.add(well);

  addAnnulus(group, geos, metalMat, CX, HALL_Y + 3.72, CZ, TUBE_R + 0.2, hallR - 0.35, 0.18, 28);

  // Techo del anillo (sala alta).
  const ceilInner = TUBE_R + 0.18;
  const ceilOuter = hallR - 0.12;
  const ceilY = HALL_Y + 3.58;
  const ceilGeo = new THREE.RingGeometry(ceilInner, ceilOuter, lite ? 28 : 48);
  ceilGeo.rotateX(Math.PI / 2);
  const ceilPos = ceilGeo.getAttribute("position") as THREE.BufferAttribute;
  const ceilUv = ceilGeo.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < ceilUv.count; i++) ceilUv.setXY(i, ceilPos.getX(i) / 2.05, ceilPos.getZ(i) / 2.05);
  ceilUv.needsUpdate = true;
  geos.push(ceilGeo);
  const ceilMat = (metalWallMat as THREE.Material).clone();
  (ceilMat as THREE.Material).side = THREE.DoubleSide;
  mats.push(ceilMat);
  const ceil = new THREE.Mesh(ceilGeo, ceilMat);
  ceil.name = "pozo-crusher-ceiling";
  ceil.position.set(CX, ceilY, CZ);
  ceil.castShadow = false;
  ceil.receiveShadow = false;
  group.add(ceil);

  // Hazard crush: sigue activo en la cámara de rotores (arriba).
  hazards.push({
    x: CX, y: PIT_Y + 0.35, z: CZ,
    radius: PIT_R - 0.15, damage: 999, color: 0xff3a12, crush: true,
  });

  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const pillarX = CX + Math.cos(a) * hallR;
    const pillarZ = CZ + Math.sin(a) * hallR;
    if (pillarX > CX + 4.55 && Math.abs(pillarZ - CZ) < 6.2) continue;
    addBox(batch, solids, metalMat, pillarX, HALL_Y, pillarZ, 1.42, 3.7, 1.42);
    addBox(
      batch, solids, metalMat,
      CX + Math.cos(a) * (hallR - 0.2), HALL_Y + 2.2, CZ + Math.sin(a) * (hallR - 0.2),
      0.18, 0.18, 0.18, false,
    );
  }

  // Muro + cartel Chimuelo en la cara EXTERIOR sur (no mirando al fuste).
  const wallZ = CZ - hallR - 0.2;
  addBox(batch, solids, metalMat, CX, HALL_Y, wallZ, 8.2, 3.5, 0.4);
  const signTex = chimueloWallTex();
  const signMat = new THREE.MeshStandardMaterial({
    map: signTex, emissiveMap: signTex, emissive: 0xffffff, emissiveIntensity: 0.9,
    roughness: 0.3, metalness: 0.16, toneMapped: false,
  });
  mats.push(signMat);
  const signGeo = new THREE.PlaneGeometry(7.2, 2.5);
  geos.push(signGeo);
  const sign = new THREE.Mesh(signGeo, signMat);
  sign.name = "pozo-chimuelo-sign";
  sign.position.set(CX, HALL_Y + 2.02, wallZ - 0.24);
  sign.rotation.y = Math.PI; // mira hacia afuera (−Z)
  sign.castShadow = false;
  group.add(sign);

  const flagTex = respectFlagTex();
  const flagMat = new THREE.MeshStandardMaterial({
    map: flagTex, emissiveMap: flagTex, emissive: 0xffffff, emissiveIntensity: 0.22,
    roughness: 0.55, metalness: 0.08, side: THREE.DoubleSide, toneMapped: false,
  });
  mats.push(flagMat);
  hangRespectFlag(group, geos, mats, flagMat, CX - 3.5, HALL_Y, wallZ - 0.18, -1);
  hangRespectFlag(group, geos, mats, flagMat, CX + 3.5, HALL_Y, wallZ - 0.18, 1);

  const plaqueL = new THREE.PointLight(0xe8fff8, 1.7, 9, 1.55);
  plaqueL.position.set(CX, HALL_Y + 2.35, wallZ - 2.0);
  plaqueL.castShadow = false;
  group.add(plaqueL);
  const pitL = new THREE.PointLight(0xff4a18, 2.8, 11, 1.3);
  pitL.position.set(CX, PIT_Y + 1.35, CZ);
  pitL.castShadow = false;
  group.add(pitL);
  if (!lite) {
    const shaftL = new THREE.PointLight(0xffc878, 1.8, 14, 1.5);
    shaftL.position.set(CX, shaftH * 0.45, CZ);
    shaftL.castShadow = false;
    group.add(shaftL);
    const mouthL = new THREE.PointLight(0x5ae8d8, 2.2, 10, 1.6);
    mouthL.position.set(CX, 1.6, CZ);
    mouthL.castShadow = false;
    group.add(mouthL);
    const crownL = new THREE.PointLight(0xff5a30, 3.2, 12, 1.4);
    crownL.position.set(CX, PIT_Y + 3.2, CZ);
    crownL.castShadow = false;
    group.add(crownL);
  }

  const smokeN = lite ? 12 : 22;
  const smokePos = new Float32Array(smokeN * 3);
  const smokeCol = new Float32Array(smokeN * 3);
  type Puff = { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; heat: number };
  const puffs: Puff[] = [];
  const seedPuff = (p: Puff) => {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * (PIT_R - 0.35);
    p.x = CX + Math.cos(a) * r;
    p.z = CZ + Math.sin(a) * r;
    p.y = PIT_Y + 0.28 + Math.random() * 0.35;
    p.vx = (Math.random() - 0.5) * 0.45;
    p.vy = 0.85 + Math.random() * 1.25;
    p.vz = (Math.random() - 0.5) * 0.45;
    p.max = 1.8 + Math.random() * 2.2;
    p.life = Math.random() * p.max;
    p.heat = Math.random();
  };
  for (let i = 0; i < smokeN; i++) {
    const p: Puff = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, heat: 0 };
    seedPuff(p);
    puffs.push(p);
  }
  const smokeGeo = new THREE.BufferGeometry();
  const smokePosAttr = new THREE.BufferAttribute(smokePos, 3).setUsage(THREE.DynamicDrawUsage);
  const smokeColAttr = new THREE.BufferAttribute(smokeCol, 3).setUsage(THREE.DynamicDrawUsage);
  smokeGeo.setAttribute("position", smokePosAttr);
  smokeGeo.setAttribute("color", smokeColAttr);
  smokeGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(CX, PIT_Y + 4, CZ), 18);
  geos.push(smokeGeo);
  const smokeMap = smokePuffTex();
  const smokeMat = new THREE.PointsMaterial({
    map: smokeMap, color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.7,
    depthWrite: false, blending: THREE.NormalBlending, size: 2.8, sizeAttenuation: true, fog: true,
  });
  mats.push(smokeMat);
  const smoke = new THREE.Points(smokeGeo, smokeMat);
  smoke.frustumCulled = false;
  smoke.renderOrder = 6;
  group.add(smoke);

  items.push(
    { id: "core-ion", kind: "ion", x: CX + 4.4, y: HALL_Y + 0.55, z: CZ + 1.7, respawn: 42 },
    { id: "core-armor", kind: "armor", x: CX - 4.45, y: HALL_Y + 0.55, z: CZ - 1.35, respawn: 28 },
    { id: "core-hp", kind: "health", x: CX + 0.2, y: HALL_Y + 0.55, z: CZ - 4.6, respawn: 22 },
  );
  waypoints.push(
    { x: CX + 4.2, y: HALL_Y, z: CZ },
    { x: CX, y: 0.2, z: CZ },
    { x: CX, y: midY, z: CZ + TUBE_R + 0.6 },
  );

  return {
    update: (now, dt) => {
      pitFloorMat.emissiveIntensity = 0.36 + 0.16 * (0.5 + 0.5 * Math.sin(now * 2.2));
      bladeMat.emissiveIntensity = 0.22 + 0.2 * (0.5 + 0.5 * Math.sin(now * 16));
      windowMat.emissiveIntensity = 1.1 + 0.4 * (0.5 + 0.5 * Math.sin(now * 1.7));
      rotorLo.rotation.y = now * 3.6;
      rotorHi.rotation.y = -now * 4.8;
      pitL.intensity = 2.1 + 0.35 * Math.sin(now * 2.4);
      const pulse = 0.5 + 0.5 * Math.sin(now * 2.1);
      for (let i = 0; i < puffs.length; i++) {
        const p = puffs[i]!;
        p.life += dt;
        if (p.life >= p.max) seedPuff(p);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vx += Math.sin(now * 0.7 + i) * 0.12 * dt;
        p.vz += Math.cos(now * 0.55 + i) * 0.12 * dt;
        const t = p.life / p.max;
        const fade = t < 0.16 ? t / 0.16 : 1 - (t - 0.16) / 0.84;
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
      smokeMat.opacity = 0.55 + 0.16 * pulse;
    },
    dispose: () => {},
  };
}


export function buildArena(scene: THREE.Scene, renderer?: THREE.WebGLRenderer): ArenaData {
  const group = new THREE.Group();
  const solids: AABB[] = [];
  const mats: THREE.Material[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const batch = new BoxBatch();

  const maps = loadArenaMaps();
  const padTex = loadTex("/textures/power-emblem.jpg", 1, 1);
  const voxelTex = loadTex("/textures/voxel-stone.jpg", 1, 1);

  const floorMat = new THREE.MeshStandardMaterial({
    map: maps.floor,
    roughness: 0.7,
    metalness: 0.18,
    color: 0xffffff,
    emissive: 0x2ee0c8,
    emissiveMap: maps.floor,
    emissiveIntensity: 0.22,
  });
  const perimeterWallMat = new THREE.MeshStandardMaterial({
    map: maps.wall,
    color: 0xffffff,
    roughness: 0.58,
    metalness: 0.22,
    emissive: 0x3ad4e8,
    emissiveMap: maps.wall,
    emissiveIntensity: 0.26,
  });
  const plateMat = new THREE.MeshLambertMaterial({
    map: maps.plate,
    color: 0xffffff,
  });
  const beamMat = new THREE.MeshLambertMaterial({
    map: maps.beam,
    color: 0xffffff,
  });
  const pipeMat = new THREE.MeshLambertMaterial({
    map: maps.pipes,
    color: 0xffffff,
  });
  const hazardMat = new THREE.MeshLambertMaterial({
    map: maps.hazard,
    color: 0xffffff,
  });
  const consoleMat = new THREE.MeshLambertMaterial({
    map: maps.console,
    color: 0xffffff,
    emissive: 0x2ee0c8,
    emissiveMap: maps.console,
    emissiveIntensity: 0.28,
  });
  const ionMat = new THREE.MeshStandardMaterial({
    color: 0x1a3c38,
    emissive: 0x7ff5e4,
    emissiveIntensity: 1.6,
    roughness: 0.28,
    metalness: 0.45,
  });
  const portalRingTex = loadTex("/textures/rings/pozo-main-ring-v1.webp", 4, 1.15);
  const portalRingMat = new THREE.MeshStandardMaterial({
    map: portalRingTex,
    color: 0xffffff,
    emissive: 0x2ee8dc,
    emissiveMap: portalRingTex,
    emissiveIntensity: 0.58,
    roughness: 0.36,
    metalness: 0.62,
  });
  const ringDeckMat = new THREE.MeshLambertMaterial({
    map: portalRingTex,
    color: 0xffffff,
    emissive: 0x1aa8a0,
    emissiveMap: portalRingTex,
    emissiveIntensity: 0.38,
  });
  const ringTopTex = loadTex("/textures/rings/pozo-main-ring-v1.webp", 1, 1);
  const ringTopMat = new THREE.MeshLambertMaterial({
    map: ringTopTex,
    color: 0xffffff,
    emissive: 0x1aa8a0,
    emissiveMap: ringTopTex,
    emissiveIntensity: 0.42,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const emberMat = new THREE.MeshStandardMaterial({
    color: 0x3a1812,
    emissive: 0xff6a45,
    emissiveIntensity: 1.35,
    roughness: 0.3,
  });
  const voxelMat = new THREE.MeshLambertMaterial({
    map: voxelTex,
    color: 0xffffff,
    emissive: 0x261c19,
    emissiveIntensity: 0.1,
  });
  const padMat = new THREE.MeshStandardMaterial({
    map: padTex,
    emissive: 0x7ff5e4,
    emissiveMap: padTex,
    emissiveIntensity: 0.85,
    roughness: 0.32,
    metalness: 0.5,
  });
  const runeMat = new THREE.MeshLambertMaterial({
    map: maps.rune,
    color: 0xffffff,
    emissive: 0x2ee0c8,
    emissiveMap: maps.rune,
    emissiveIntensity: 0.85,
  });
  const skullMat = new THREE.MeshLambertMaterial({
    map: maps.skull,
    color: 0xffffff,
    emissive: 0xff5a28,
    emissiveMap: maps.skull,
    emissiveIntensity: 0.28,
  });
  const ruinMat = new THREE.MeshLambertMaterial({
    map: maps.ruin,
    color: 0xffffff,
    emissive: 0xff4a22,
    emissiveMap: maps.ruin,
    emissiveIntensity: 0.12,
  });
  const armorMat = new THREE.MeshLambertMaterial({
    map: maps.armor,
    color: 0xffffff,
  });
  const tubeMetalTex = loadPozoSurface("industrial-teal", 2.4, 2.4);
  // Paredes del túnel de caída: metal vertical (wall-v4), no baldosas de piso
  // industrial-teal — esas se leían como “techo” al mirar al pozo.
  const shaftWallFile = isLoDevice() ? "/textures/pozo/wall-v4-mobile.webp" : "/textures/pozo/wall-v4.webp";
  const tubeMetalWallTex = loadTex(shaftWallFile, 1, 1);
  const tubeMossTex = loadPozoSurface("alien-forest", 2.6, 2.6);
  const tubeMetalMat = new THREE.MeshLambertMaterial({
    map: tubeMetalTex,
    color: 0xc8ccd2,
  });
  const tubeMetalWallMat = new THREE.MeshStandardMaterial({
    map: tubeMetalWallTex,
    color: 0xc4c8ce,
    roughness: 0.72,
    metalness: 0.44,
    side: THREE.DoubleSide,
  });
  const tubeMossMat = new THREE.MeshLambertMaterial({
    map: tubeMossTex,
    color: 0xffffff,
  });
  mats.push(
    floorMat,
    perimeterWallMat,
    plateMat,
    beamMat,
    pipeMat,
    hazardMat,
    consoleMat,
    ionMat,
    portalRingMat,
    ringDeckMat,
    ringTopMat,
    emberMat,
    voxelMat,
    padMat,
    runeMat,
    skullMat,
    ruinMat,
    armorMat,
    tubeMetalMat,
    tubeMetalWallMat,
    tubeMossMat,
  );

  const lights = createArenaLights(
    scene,
    {
      floor: floorMat,
      rune: runeMat,
      console: consoleMat,
      ruin: ruinMat,
      skull: skullMat,
      pad: padMat,
      ion: ionMat,
      ember: emberMat,
    },
    renderer,
    "pozo-cycle",
  );

  const WALL_H = 11;
  const ARENA_HALF = 55;
  const ARENA_SIZE = ARENA_HALF * 2 + 2;
  const cryptBrick = loadTex("/textures/crypt-brick.jpg", 3, 2);
  const cryptArch = loadArenaSurface("pozo", 1, 2.5);
  const boneMat = new THREE.MeshLambertMaterial({
    map: cryptBrick,
    color: 0xc8c2b8,
    emissive: 0x1a1612,
    emissiveIntensity: 0.06,
  });
  const archMat = new THREE.MeshLambertMaterial({
    map: cryptArch,
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveMap: cryptArch,
    emissiveIntensity: 0.12,
  });
  mats.push(boneMat, archMat);
  buildCatacombs(batch, solids, group, geos, mats, floorMat, boneMat, skullMat, emberMat, ARENA_SIZE, archMat);
  addBox(batch, solids, perimeterWallMat, 0, 0, -ARENA_HALF, ARENA_SIZE, WALL_H, 1.4);
  addBox(batch, solids, perimeterWallMat, 0, 0, ARENA_HALF, ARENA_SIZE, WALL_H, 1.4);
  addBox(batch, solids, perimeterWallMat, -ARENA_HALF, 0, 0, 1.4, WALL_H, ARENA_SIZE);
  addBox(batch, solids, perimeterWallMat, ARENA_HALF, 0, 0, 1.4, WALL_H, ARENA_SIZE);

  const runeDecals = [
    { x: 0, y: 5.2, z: -54.26, ry: 0, s: 3.2 },
    { x: 0, y: 5.2, z: 54.26, ry: Math.PI, s: 3.2 },
    { x: -54.26, y: 5.2, z: 0, ry: Math.PI / 2, s: 3.2 },
    { x: 54.26, y: 5.2, z: 0, ry: -Math.PI / 2, s: 3.2 },
  ];
  const skullDecals = [
    { x: -16, y: 4.2, z: -54.26, ry: 0, s: 3.6 },
    { x: 16, y: 4.2, z: 54.26, ry: Math.PI, s: 3.6 },
    { x: -54.26, y: 4.2, z: 16, ry: Math.PI / 2, s: 3.6 },
    { x: 54.26, y: 4.2, z: -16, ry: -Math.PI / 2, s: 3.6 },
  ];
  geos.push(instancePlanes(group, runeMat, runeDecals).geo);
  geos.push(instancePlanes(group, skullMat, skullDecals).geo);

  addBox(batch, solids, hazardMat, 0, 3.2, -54.05, 108, 0.12, 0.2, false);
  addBox(batch, solids, hazardMat, 0, 3.2, 54.05, 108, 0.12, 0.2, false);
  addBox(batch, solids, ionMat, -54.05, 6.2, 0, 0.18, 0.1, 108, false);
  addBox(batch, solids, ionMat, 54.05, 6.2, 0, 0.18, 0.1, 108, false);
  // Estacionamiento triangular de doble piso + estanterías lógicas (auto miniatura arriba).
  {
    const deck1 = 0.12;
    const deck2 = 3.05;
    const shelfMat = new THREE.MeshStandardMaterial({
      color: 0x8a9694,
      metalness: 0.55,
      roughness: 0.4,
      emissive: 0x1a403c,
      emissiveIntensity: 0.2,
    });
    mats.push(shelfMat);
    // Triángulo: punta al norte (+Z), base al sur.
    const tri = [
      [0, 6.2],
      [-7.2, -5.4],
      [7.2, -5.4],
    ] as const;
    // Losas: aproximación por cajas que cubren el triángulo.
    addBox(batch, solids, consoleMat, 0, 0, 0.4, 14.6, deck1, 12.2);
    addBox(batch, solids, consoleMat, 0, deck2 - 0.14, 0.4, 13.2, 0.14, 11.0);
    // Pilares en vértices + centros de aristas.
    const pillars = [
      ...tri,
      [(tri[0][0] + tri[1][0]) / 2, (tri[0][1] + tri[1][1]) / 2],
      [(tri[0][0] + tri[2][0]) / 2, (tri[0][1] + tri[2][1]) / 2],
      [(tri[1][0] + tri[2][0]) / 2, (tri[1][1] + tri[2][1]) / 2],
    ] as const;
    for (const [px, pz] of pillars) {
      addBox(batch, solids, consoleMat, px, 0, pz, 0.55, deck2, 0.55);
    }
    // Barandas del piso alto (perímetro triangular).
    const edges = [
      [tri[0], tri[1]],
      [tri[1], tri[2]],
      [tri[2], tri[0]],
    ] as const;
    for (const [a, b] of edges) {
      const mx = (a[0] + b[0]) / 2;
      const mz = (a[1] + b[1]) / 2;
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const len = Math.hypot(dx, dz);
      addBox(batch, solids, ionMat, mx, deck2, mz, Math.abs(dx) > Math.abs(dz) ? len : 0.12, 0.55, Math.abs(dz) >= Math.abs(dx) ? len : 0.12, false);
    }
    // Rampa lógica: lado este del triángulo, piso bajo → alto (escalones ≤ stepHeight 0.5).
    {
      const steps = 10;
      for (let i = 0; i < steps; i++) {
        const t = (i + 0.5) / steps;
        const y0 = (i / steps) * deck2;
        const rise = deck2 / steps + 0.04;
        const x = 4.2 + t * 1.6;
        const z = -4.2 + t * 4.8;
        addBox(batch, solids, consoleMat, x, y0, z, 1.55, rise, 0.72);
      }
    }
    // Estanterías lógicas: bastidores en dos lados con anaqueles a alturas fijas.
    const rackH = deck2 - 0.2;
    const shelfYs = [0.45, 1.15, 1.85, 2.55];
    const racks: Array<{ x: number; z: number; along: "x" | "z"; len: number }> = [
      { x: -5.2, z: -1.2, along: "z", len: 6.4 },
      { x: 5.2, z: -1.2, along: "z", len: 6.4 },
      { x: 0, z: -4.6, along: "x", len: 8.5 },
    ];
    for (const rack of racks) {
      const posts = rack.along === "z"
        ? [[rack.x, rack.z - rack.len * 0.45], [rack.x, rack.z + rack.len * 0.45]]
        : [[rack.x - rack.len * 0.45, rack.z], [rack.x + rack.len * 0.45, rack.z]];
      for (const [px, pz] of posts) addBox(batch, solids, shelfMat, px, 0, pz, 0.12, rackH, 0.12, false);
      for (const sy of shelfYs) {
        if (rack.along === "z") addBox(batch, solids, shelfMat, rack.x, sy, rack.z, 0.55, 0.06, rack.len, false);
        else addBox(batch, solids, shelfMat, rack.x, sy, rack.z, rack.len, 0.06, 0.55, false);
      }
      // Tope / larguero.
      if (rack.along === "z") addBox(batch, solids, shelfMat, rack.x, rackH, rack.z, 0.14, 0.1, rack.len, false);
      else addBox(batch, solids, shelfMat, rack.x, rackH, rack.z, rack.len, 0.1, 0.14, false);
    }
    // Luces de bahía bajo el piso alto.
    if (!isLoDevice()) {
      for (const [lx, lz] of [[-3, 1], [3, 1], [0, -2]] as const) {
        const bay = new THREE.PointLight(0x7ff5e4, 1.3, 7, 1.6);
        bay.position.set(lx, deck2 - 0.35, lz);
        bay.castShadow = false;
        group.add(bay);
      }
    }
  }

  // Voxel ruins: stepped blocks give the arena a readable Minecraft-like silhouette
  // without replacing the existing industrial collision layout.
  for (const [x, z, h] of [[-34, -20, 4], [34, -20, 3], [-34, 20, 3], [34, 20, 4], [-20, -34, 3], [20, 34, 4]] as const) {
    for (let level = 0; level < h; level++) {
      const inset = level * 0.18;
      addBox(batch, solids, voxelMat, x, level * 1.05, z, 3.2 - inset, 1.02, 3.2 - inset);
    }
  }

  const pitCols = [
    [-8, -8, 4.4],
    [8, -8, 4.4],
    [-8, 8, 4.4],
    [8, 8, 4.4],
    [0, -11, 4.4],
    [0, 11, 4.4],
  ] as const;
  for (const [px, pz, ph] of pitCols) solids.push(boxAt(px, 0, pz, 1.36, ph, 1.36));
  geos.push(
    instanceCylinders(
      group,
      beamMat,
      pitCols.map(([x, z, h]) => ({ x, y: h / 2, z })),
      0.68,
      0.74,
      4.4,
    ).geo,
  );
  geos.push(
    instanceCylinders(
      group,
      ionMat,
      pitCols.map(([x, z]) => ({ x, y: 4.46, z })),
      0.78,
      0.78,
      0.12,
    ).geo,
  );
  for (const [px, pz, ph] of [
    [-24, -24, 5.2],
    [24, -24, 5.2],
    [-24, 24, 5.2],
    [24, 24, 5.2],
    [0, -32, 5.6],
    [0, 32, 5.6],
    [-32, 0, 5.6],
    [32, 0, 5.6],
  ] as const) {
    addBox(batch, solids, armorMat, px, 0, pz, 2.1, ph, 2.1);
    addBox(batch, solids, ionMat, px, ph, pz, 2.2, 0.1, 2.2, false);
  }

  addBox(batch, solids, plateMat, 0, 3.15, -18.2, 16, 0.28, 4.4);
  addBox(batch, solids, plateMat, 0, 3.15, 18.2, 16, 0.28, 4.4);
  addBox(batch, solids, hazardMat, 0, 3.42, -18.2, 16, 0.06, 4.4, false);
  addBox(batch, solids, hazardMat, 0, 3.42, 18.2, 16, 0.06, 4.4, false);
  addBox(batch, solids, plateMat, -18.4, 3.15, 0, 4.2, 0.28, 10);
  addBox(batch, solids, plateMat, 18.4, 3.15, 0, 4.2, 0.28, 10);
  addBox(batch, solids, ringDeckMat, 0, 3.15, -36, 28, 0.3, 7);
  addBox(batch, solids, ringDeckMat, 0, 3.15, 36, 28, 0.3, 7);
  addBox(batch, solids, ringDeckMat, -36, 3.15, 0, 7, 0.3, 22);
  addBox(batch, solids, ringDeckMat, 36, 3.15, 0, 7, 0.3, 22);
  addBox(batch, solids, plateMat, 0, 3.15, -27, 4.4, 0.28, 14);
  addBox(batch, solids, plateMat, 0, 3.15, 27, 4.4, 0.28, 14);
  addBox(batch, solids, plateMat, -27, 3.15, 0, 14, 0.28, 4.4);
  addBox(batch, solids, plateMat, 27, 3.15, 0, 14, 0.28, 4.4);

  const mkStairs = (x: number, z: number, dir: number, along = "z") => {
    const rise = 0.36;
    const tread = 1.12;
    const width = 5.8;
    for (let i = 0; i < 9; i++) {
      const top = (i + 1) * rise;
      const off = dir * (i * 0.78 + 0.56);
      const slabY = top - rise;
      const nose = dir * (tread * 0.36);
      if (along === "z") {
        addBox(batch, solids, plateMat, x, slabY, z + off, width, rise, tread);
        addBox(batch, solids, hazardMat, x, top - 0.04, z + off + nose, width * 0.94, 0.045, 0.2, false);
      } else {
        addBox(batch, solids, plateMat, x + off, slabY, z, tread, rise, width);
        addBox(batch, solids, hazardMat, x + off + nose, top - 0.04, z, 0.2, 0.045, width * 0.94, false);
      }
    }
  };
  mkStairs(-10, -14.5, -1);
  mkStairs(10, 14.5, 1);
  mkStairs(-28, -30.5, -1);
  mkStairs(28, 30.5, 1);
  mkStairs(-30.5, 28, -1, "x");
  mkStairs(30.5, -28, 1, "x");

  addBox(batch, solids, pipeMat, -14, 0, 0, 0.7, 1.15, 5.5);
  addBox(batch, solids, pipeMat, 14, 0, 0, 0.7, 1.15, 5.5);
  addBox(batch, solids, pipeMat, 0, 0, -14, 5.5, 1.15, 0.7);
  addBox(batch, solids, pipeMat, 0, 0, 14, 5.5, 1.15, 0.7);
  addBox(batch, solids, pipeMat, -30, 0, 12, 0.8, 1.2, 8);
  addBox(batch, solids, pipeMat, 30, 0, -12, 0.8, 1.2, 8);
  addBox(batch, solids, beamMat, 0, 8.2, 0, 72, 0.4, 0.55, false);
  addBox(batch, solids, beamMat, 0, 8.2, 0, 0.55, 0.4, 72, false);

  // Perimeter cover expands the combat space with a small, batched geometry cost.
  const corners = [
    [-49, -42],
    [49, -42],
    [-49, 42],
    [49, 42],
  ] as const;
  for (const [x, z] of corners) solids.push(boxAt(x, 0, z, 4.3, 4.8, 4.3));
  geos.push(instanceCylinders(group, ruinMat, corners.map(([x, z]) => ({ x, y: 2.4, z })), 2.2, 2.35, 4.8).geo);
  geos.push(instanceCylinders(group, ionMat, corners.map(([x, z]) => ({ x, y: 4.9, z })), 2.45, 2.45, 0.14).geo);

  const towers = [
    [-42, -26],
    [42, -26],
    [-42, 26],
    [42, 26],
  ] as const;
  const shaftH = 6.6;
  const shaftR = 1.55;
  for (const [x, z] of towers) solids.push(boxAt(x, 0, z, shaftR * 2, shaftH, shaftR * 2));
  geos.push(
    instanceCylinders(
      group,
      ruinMat,
      towers.map(([x, z]) => ({ x, y: shaftH / 2, z })),
      shaftR,
      shaftR + 0.16,
      shaftH,
    ).geo,
  );
  geos.push(instanceCylinders(group, boneMat, towers.map(([x, z]) => ({ x, y: 0.38, z })), 2.15, 2.35, 0.76).geo);
  geos.push(instanceCylinders(group, boneMat, towers.map(([x, z]) => ({ x, y: shaftH + 0.16, z })), 1.95, 1.85, 0.32).geo);
  const towerSkulls: Array<{ x: number; y: number; z: number; ry: number; s: number }> = [];
  for (const [x, z] of towers) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const mx = x + Math.cos(a) * 1.55;
      const mz = z + Math.sin(a) * 1.55;
      addBox(batch, solids, boneMat, mx, shaftH + 0.28, mz, 0.42, 0.72, 0.42, false);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      addBox(
        batch,
        solids,
        armorMat,
        x + Math.cos(a) * (shaftR + 0.08),
        1.15,
        z + Math.sin(a) * (shaftR + 0.08),
        0.22,
        4.2,
        0.22,
        false,
      );
    }
    addBox(batch, solids, emberMat, x, shaftH + 0.32, z, 0.55, 0.16, 0.55, false);
    addBox(batch, solids, ionMat, x, 3.1, z - shaftR, 0.28, 0.9, 0.08, false);
    const len = Math.hypot(x, z) || 1;
    const nx = -x / len;
    const nz = -z / len;
    towerSkulls.push({
      x: x + nx * (shaftR + 0.04),
      y: 4.4,
      z: z + nz * (shaftR + 0.04),
      ry: Math.atan2(nx, nz),
      s: 1.05,
    });
    lights.addGlint(group, x, shaftH + 1.35, z);
  }
  geos.push(instancePlanes(group, skullMat, towerSkulls).geo);

  lights.addFill(group, 0, 5.6, 0, 0xffc090, 6.4, 34);

  const pitSkulls = [
    { x: 0, y: 0.82, z: -3.68, ry: 0, s: 1.15 },
    { x: 0, y: 0.82, z: 3.68, ry: Math.PI, s: 1.15 },
    { x: -3.68, y: 0.82, z: 0, ry: Math.PI / 2, s: 1.15 },
    { x: 3.68, y: 0.82, z: 0, ry: -Math.PI / 2, s: 1.15 },
    { x: -4.2, y: 2.5, z: -15.9, ry: 0, s: 1.25 },
    { x: 4.2, y: 2.5, z: -15.9, ry: 0, s: 1.25 },
    { x: -4.2, y: 2.5, z: 15.9, ry: Math.PI, s: 1.25 },
    { x: 4.2, y: 2.5, z: 15.9, ry: Math.PI, s: 1.25 },
    { x: -16.2, y: 2.5, z: -3.2, ry: Math.PI / 2, s: 1.25 },
    { x: -16.2, y: 2.5, z: 3.2, ry: Math.PI / 2, s: 1.25 },
    { x: 16.2, y: 2.5, z: -3.2, ry: -Math.PI / 2, s: 1.25 },
    { x: 16.2, y: 2.5, z: 3.2, ry: -Math.PI / 2, s: 1.25 },
  ];
  for (const col of pitCols) {
    const len = Math.hypot(col[0], col[1]) || 1;
    const nx = -col[0] / len;
    const nz = -col[1] / len;
    pitSkulls.push({
      x: col[0] + nx * 0.78,
      y: 2.15,
      z: col[1] + nz * 0.78,
      ry: Math.atan2(nx, nz),
      s: 0.95,
    });
  }
  geos.push(instancePlanes(group, skullMat, pitSkulls).geo);
  for (const skull of pitSkulls) {
    const nx = Math.sin(skull.ry);
    const nz = Math.cos(skull.ry);
    lights.addGlint(group, skull.x + nx * 0.15, skull.y + 0.35, skull.z + nz * 0.15);
  }
  for (const [x, z] of corners) {
    lights.addGlint(group, x, 5.15, z);
  }

  const pads: JumpPad[] = [];
  const teleports: TeleportGate[] = [];
  const hazards: HazardZone[] = [];
  const padSpecs: Array<{ x: number; z: number; vx: number; vy: number; vz: number; lit?: boolean }> = [
    { x: -17, z: -17, vx: 8, vy: 13.5, vz: 8, lit: true },
    { x: 17, z: -17, vx: -8, vy: 13.5, vz: 8, lit: true },
    { x: 17, z: 17, vx: -8, vy: 13.5, vz: -8, lit: true },
    { x: -17, z: 17, vx: 8, vy: 13.5, vz: -8, lit: true },
    { x: -18.4, z: -8, vx: 0, vy: 12.4, vz: 0, lit: true },
    { x: 18.4, z: 8, vx: 0, vy: 12.4, vz: 0, lit: true },
  ];
  for (const p of padSpecs) {
    if (p.lit) lights.addPad(group, p.x, p.z);
    pads.push({ aabb: boxAt(p.x, 0, p.z, 2.1, 1.2, 2.1), vx: p.vx, vy: p.vy, vz: p.vz });
  }
  geos.push(instanceCylinders(group, padMat, padSpecs.map((p) => ({ x: p.x, y: 0.1, z: p.z })), 1.05, 1.15, 0.16).geo);
  stampJumpPads(group, mats, geos, padSpecs.map((p) => ({ x: p.x, y: 0.2, z: p.z })), 1.08);

  const portalRing = new THREE.TorusGeometry(1.15, 0.09, 8, 22);
  const portalBase = new THREE.CylinderGeometry(1.2, 1.32, 0.14, 16);
  const skyRing = new THREE.TorusGeometry(1.45, 0.06, 6, 20);
  geos.push(portalRing, portalBase, skyRing);
  const portal = (
    x: number,
    z: number,
    targetX: number,
    targetZ: number,
  ) => {
    teleports.push({
      aabb: boxAt(x, 0.85, z, 2.3, 1.7, 2.3),
      target: { x: targetX, y: 26, z: targetZ, yaw: Math.atan2(-targetX, -targetZ) },
      chute: true,
    });
    const base = new THREE.Mesh(portalBase, padMat);
    base.position.set(x, 0.08, z);
    const ring = new THREE.Mesh(portalRing, portalRingMat);
    ring.position.set(x, 1.15, z);
    ring.rotation.x = Math.PI / 2;
    const mark = new THREE.Mesh(skyRing, portalRingMat);
    mark.position.set(targetX, 26.4, targetZ);
    mark.rotation.x = Math.PI / 2;
    group.add(base, ring, mark);
    lights.addPad(group, x, z, 0.7);
  };
  portal(-26, 20, 12, -18);
  portal(26, -20, -12, 18);
  const portalDiscs = stampPortals(group, mats, geos, [
    { x: -26, y: 1.28, z: 20 },
    { x: 26, y: 1.28, z: -20 },
    { x: 12, y: 26.55, z: -18 },
    { x: -12, y: 26.55, z: 18 },
  ], 1.22);

  const items: ItemPad[] = [
    { id: "h1", kind: "health", x: -6, y: 0.2, z: 0, respawn: 12 },
    { id: "h2", kind: "health", x: 6, y: 0.2, z: 0, respawn: 12 },
    { id: "h3", kind: "health", x: 0, y: 0.2, z: -6, respawn: 12 },
    { id: "h4", kind: "health", x: 0, y: 0.2, z: 6, respawn: 12 },
    { id: "m1", kind: "mega", x: 0, y: 0.2, z: 0, respawn: 35 },
    { id: "a1", kind: "armor", x: -18.4, y: 3.55, z: 0, respawn: 22 },
    { id: "a2", kind: "armor", x: 18.4, y: 3.55, z: 0, respawn: 22 },
    { id: "am1", kind: "ammo", x: 0, y: 3.55, z: -18.2, respawn: 14 },
    { id: "am2", kind: "ammo", x: 0, y: 3.55, z: 18.2, respawn: 14 },
    { id: "w1", kind: "scatter", x: -11, y: 0.25, z: -4, respawn: 18 },
    { id: "w2", kind: "torpedo", x: 6, y: 3.55, z: -18.2, respawn: 22 },
    { id: "w3", kind: "lance", x: 0, y: 3.55, z: -36, respawn: 28 },
    { id: "w4", kind: "ion", x: -36, y: 3.55, z: 0, respawn: 20 },
    { id: "w5", kind: "fauces", x: 36, y: 3.55, z: 0, respawn: 24 },
    { id: "w-bate", kind: "bate", x: 11, y: 0.25, z: 8, respawn: 20 },
    { id: "w-martillo", kind: "martillo", x: 0, y: 3.55, z: 36, respawn: 26 },
    { id: "p1", kind: "rush", x: -14, y: 0.28, z: 8, respawn: 22 },
    { id: "p2", kind: "blink", x: 14, y: 0.28, z: -8, respawn: 26 },
    { id: "p3", kind: "leap", x: 22, y: 0.28, z: 12, respawn: 24 },
    { id: "p4", kind: "volt", x: -22, y: 0.28, z: -12, respawn: 24 },
  ];

  const spawns: Spawn[] = [
    { x: -16, y: 0, z: -16, yaw: Math.PI * 0.25 },
    { x: 16, y: 0, z: -16, yaw: Math.PI * 0.75 },
    { x: 16, y: 0, z: 16, yaw: -Math.PI * 0.75 },
    { x: -16, y: 0, z: 16, yaw: -Math.PI * 0.25 },
    { x: 0, y: 3.43, z: -18.2, yaw: 0 },
    { x: 0, y: 3.43, z: 18.2, yaw: Math.PI },
    { x: -18.4, y: 3.43, z: 0, yaw: Math.PI / 2 },
    { x: 18.4, y: 3.43, z: 0, yaw: -Math.PI / 2 },
    { x: -36, y: 3.43, z: -8, yaw: Math.PI / 2 },
    { x: 36, y: 3.43, z: 8, yaw: -Math.PI / 2 },
    { x: -8, y: 3.43, z: -36, yaw: 0 },
    { x: 8, y: 3.43, z: 36, yaw: Math.PI },
    { x: CORE_TUBE.x + 3.2, y: CORE_TUBE.y, z: CORE_TUBE.z + 0.5, yaw: Math.PI },
  ];

  const waypoints = [
    { x: 0, y: 1.35, z: 0 },
    { x: -16, y: 0, z: -16 },
    { x: 16, y: 0, z: -16 },
    { x: 16, y: 0, z: 16 },
    { x: -16, y: 0, z: 16 },
    { x: 0, y: 3.43, z: -18 },
    { x: 0, y: 3.43, z: 18 },
    { x: -18, y: 3.43, z: 0 },
    { x: 18, y: 3.43, z: 0 },
    { x: -8, y: 0, z: 0 },
    { x: 8, y: 0, z: 0 },
    { x: 0, y: 0, z: -8 },
    { x: 0, y: 0, z: 8 },
    { x: -17, y: 0, z: -17 },
    { x: 17, y: 0, z: 17 },
    { x: -36, y: 3.43, z: 0 },
    { x: 36, y: 3.43, z: 0 },
    { x: 0, y: 3.43, z: -36 },
    { x: 0, y: 3.43, z: 36 },
    { x: -24, y: 0, z: -24 },
    { x: 24, y: 0, z: 24 },
    { x: -38, y: 0, z: -38 },
    { x: 38, y: 0, z: 38 },
    { x: -48, y: 0, z: -42 },
    { x: 48, y: 0, z: -42 },
    { x: 48, y: 0, z: 42 },
    { x: -48, y: 0, z: 42 },
    { x: 0, y: -4.6, z: 0 },
    { x: 0, y: -4.6, z: -28 },
    { x: 0, y: -4.6, z: 28 },
    { x: -28, y: -4.6, z: 0 },
    { x: 28, y: -4.6, z: 0 },
    { x: -16, y: -4.6, z: -16 },
    { x: 16, y: -4.6, z: 16 },
    { x: 0, y: -9, z: 22 },
    { x: CORE_TUBE.x, y: 0, z: CORE_TUBE.z },
    { x: CORE_TUBE.x, y: CORE_TUBE.y, z: CORE_TUBE.z },
  ];

  const tubeFx = buildCoreTube(
    batch,
    solids,
    group,
    geos,
    mats,
    tubeMetalMat,
    tubeMossMat,
    tubeMetalWallMat,
    items,
    waypoints,
    hazards,
  );

  const addWire = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, w = 0.36) => {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dy, dz);
    const n = Math.max(2, Math.ceil(len / 0.58));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      addBox(batch, solids, beamMat, x0 + dx * t, y0 + dy * t, z0 + dz * t, w, 0.14, w);
    }
  };
  addBox(batch, solids, plateMat, -24, 8.7, -40, 3.2, 0.22, 3.2);
  addBox(batch, solids, plateMat, 24, 8.7, -40, 3.2, 0.22, 3.2);
  addWire(-8, 0.2, -40, -24, 8.7, -40);
  addWire(8, 0.2, -40, 24, 8.7, -40);
  addWire(-24, 8.7, -40, 24, 8.7, -40, 0.7);

  const skyPaths = [
    "/textures/space/pozo-cycle-start-v1.webp",
    "/textures/space/pozo-cycle-mid-v1.webp",
    "/textures/space/pozo-cycle-end-v1.webp",
  ];
  const skyTextures = skyPaths.map((path) => loadSkyTex(path, false));
  const skyGeo = skySphereGeo();
  const skyMaterials = skyTextures.map((map, index) => new THREE.MeshBasicMaterial({
    map,
    side: THREE.BackSide,
    fog: false,
    transparent: true,
    opacity: index === 0 ? 1 : 0,
    depthWrite: false,
    toneMapped: false,
  }));
  const skyLayers = skyMaterials.map((material, index) => {
    const mesh = new THREE.Mesh(skyGeo, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = -20 + index;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.visible = index === 0;
    scene.add(mesh);
    return mesh;
  });
  mats.push(...skyMaterials);

  batch.build(group);
  geos.push(
    stampDecks(
      group,
      ringTopMat,
      [
        { x: 0, y: 3.06, z: 0.4, w: 10.5, d: 9.2 },
        { x: 0, y: 3.47, z: -36, w: 28, d: 7 },
        { x: 0, y: 3.47, z: 36, w: 28, d: 7 },
        { x: -36, y: 3.47, z: 0, w: 7, d: 22 },
        { x: 36, y: 3.47, z: 0, w: 7, d: 22 },
      ],
      1.85,
    ).geo,
  );
  geos.push(skyGeo);

  const skyLo = isLoDevice();
  let cycleStartedAt: number | null = null;
  const startCycle = (epochMs: number) => {
    const elapsed = Math.max(0, (Date.now() - epochMs) / 1000);
    cycleStartedAt = performance.now() / 1000 - elapsed;
  };
  const updateSky = (now: number) => {
    const elapsed = cycleStartedAt === null ? 0 : Math.max(0, now - cycleStartedAt);
    const progress = Math.min(1, elapsed / ROUND_SECONDS);
    let base = 0;
    let overlay = 0;
    let blend = 0;
    if (progress >= 0.42 && progress < 0.56) {
      overlay = 1;
      blend = THREE.MathUtils.smoothstep(progress, 0.42, 0.56);
    } else if (progress >= 0.56 && progress < 0.66) {
      base = overlay = 1;
    } else if (progress >= 0.66 && progress < 0.84) {
      base = 1;
      overlay = 2;
      blend = THREE.MathUtils.smoothstep(progress, 0.66, 0.84);
    } else if (progress >= 0.84) {
      base = overlay = 2;
    }
    if (skyLo && overlay !== base) {
      if (blend >= 0.5) base = overlay;
      overlay = base;
      blend = 0;
    }
    for (let i = 0; i < skyLayers.length; i++) {
      const isBase = i === base;
      const isOverlay = i === overlay && overlay !== base;
      skyLayers[i]!.visible = isBase || isOverlay;
      skyMaterials[i]!.opacity = isBase ? 1 : isOverlay ? blend : 0;
    }
    lights.setTimeOfDay(progress);
  };

  scene.add(group);
  const pozoCar = mountPozoCar(group, solids);

  return {
    group,
    solids,
    pads,
    teleports,
    hazards,
    items,
    spawns,
    waypoints,
    lights,
    update: (now, dt = 1 / 60) => {
      for (let i = 0; i < portalDiscs.length; i++) {
        portalDiscs[i]!.rotation.y = now * (i % 2 ? -0.55 : 0.55);
      }
      tubeFx.update(now, dt);
      pozoCar.update(now, dt);
      updateSky(now);
    },
    startCycle,
    killY: -22,
    dispose: () => {
      pozoCar.dispose();
      tubeFx.dispose();
      scene.remove(group);
      for (const layer of skyLayers) scene.remove(layer);
      lights.dispose();
      batch.dispose();
      group.traverse((obj) => {
        if (obj instanceof THREE.BatchedMesh || obj instanceof THREE.InstancedMesh) obj.dispose();
      });
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      for (let i = 0; i < skyTextures.length; i++) {
        skyTextures[i]!.dispose();
        THREE.Cache.remove(skyPaths[i]!);
      }
    },
  };
}

function buildCatacombs(
  batch: BoxBatch,
  solids: AABB[],
  group: THREE.Group,
  geos: THREE.BufferGeometry[],
  mats: THREE.Material[],
  floorMat: THREE.Material,
  boneMat: THREE.Material,
  skullMat: THREE.Material,
  emberMat: THREE.Material,
  arenaSize: number,
  archMat: THREE.Material,
) {
  const half = arenaSize / 2;
  const lip = 2.7;
  const shafts = [
    { x: 0, z: 42, along: "z" as const, dir: 1 },
    { x: -42, z: 0, along: "x" as const, dir: -1 },
    { x: 42, z: 0, along: "x" as const, dir: 1 },
  ];
  const bands: Array<[number, number, number, number]> = [
    [-half, -46.4, -half, half],
    [-46.4, -37.6, -half, -4.35],
    [-46.4, -37.6, 4.35, half],
    [-37.6, -lip, -half, half],
    [-lip, lip, -half, -45.6],
    [-lip, lip, -38.4, 38.4],
    [-lip, lip, 45.6, half],
    [lip, 16.05, -half, half],
    [16.05, 16.35, -half, -1.15],
    [16.05, 16.35, 1.15, half],
    [16.35, 20.05, -half, half],
    [20.05, 20.35, -half, -1.15],
    [20.05, 20.35, 1.15, half],
    [20.35, 24.05, -half, half],
    [24.05, 24.35, -half, -1.15],
    [24.05, 24.35, 1.15, half],
    [24.35, 38.4, -half, half],
    [38.4, 45.6, -half, -lip],
    [38.4, 45.6, lip, half],
    [45.6, half, -half, half],
  ];
  for (const [z0, z1, x0, x1] of bands) {
    addBox(batch, solids, floorMat, (x0 + x1) / 2, -1, (z0 + z1) / 2, x1 - x0, 1, z1 - z0);
  }
  // A single world-aligned cover keeps texel density uniform across narrow bands.
  // The original solid boxes and all shaft openings remain unchanged.
  const deckTexture = loadArenaSurface("pozo");
  const deckMaterial = new THREE.MeshLambertMaterial({
    map: deckTexture, color: 0xffffff,
    emissive: 0x2ee0c8, emissiveMap: deckTexture, emissiveIntensity: 0.12,
  });
  mats.push(deckMaterial);
  geos.push(stampDecks(group, deckMaterial, bands.map(([z0, z1, x0, x1]) => ({
    x: (x0 + x1) / 2, y: 0.006, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0,
  })), 4).geo);

  const crypt = -4.6;
  const deep = -9;
  const cryptFloor = (x: number, z: number, w: number, d: number) => {
    addBox(batch, solids, boneMat, x, crypt - 1.1, z, w, 1.1, d);
  };
  cryptFloor(0, 38, 96, 20);
  // La trituradora ya no baja: rellenar el suelo de cripta bajo la torre.
  cryptFloor(CORE_TUBE.x, CORE_TUBE.z, 12, 12);
  cryptFloor(0, -19, 96, 58);
  cryptFloor(-24.8, 14, 46.4, 8);
  cryptFloor(24.8, 14, 46.4, 8);
  cryptFloor(0, 19.025, 96, 2.05);
  cryptFloor(-24.8, 20.2, 46.4, 0.3);
  cryptFloor(24.8, 20.2, 46.4, 0.3);
  cryptFloor(0, 22.2, 96, 3.7);
  cryptFloor(-24.8, 24.2, 46.4, 0.3);
  cryptFloor(24.8, 24.2, 46.4, 0.3);
  cryptFloor(0, 26.175, 96, 3.65);
  const shell = [
    [0, -48, 96, 1.4],
    [0, 48, 96, 1.4],
  ] as const;
  for (const [x, z, w, d] of shell) addBox(batch, solids, archMat, x, crypt, z, w, 3.5, d);
  addBox(batch, solids, archMat, -48, crypt, 0, 1.4, 3.5, 96);
  addBox(batch, solids, archMat, 48, crypt, 0, 1.4, 3.5, 96);

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addBox(batch, solids, boneMat, sx * 16, crypt, sz * 16, 18, 2.2, 18);
    }
  }
  const throat = 2.2;
  for (const side of [-1, 1]) {
    addBox(batch, solids, archMat, side * 1.55, crypt, -18, 0.7, throat, 28);
    addBox(batch, solids, archMat, side * 1.55, crypt, 18, 0.7, throat, 28);
    addBox(batch, solids, archMat, -18, crypt, side * 1.55, 28, throat, 0.7);
    addBox(batch, solids, archMat, 18, crypt, side * 1.55, 28, throat, 0.7);
  }
  const hallCeil = (z: number, d: number) => {
    addBox(batch, solids, boneMat, 0, crypt + 2.05, z, 2.5, 0.45, d);
  };
  hallCeil(-8, 48);
  hallCeil(18.2, 3.7);
  hallCeil(22.2, 3.7);
  hallCeil(28.175, 7.65);
  addBox(batch, solids, boneMat, 0, crypt + 2.05, 0, 64, 0.45, 2.5);
  for (let i = -4; i <= 4; i++) {
    if (i === 0) continue;
    const o = i * 7;
    if (Math.abs(o) !== 14 && Math.abs(o) !== 21) {
      addBox(batch, solids, boneMat, 0, crypt + 1.72, o, 2.35, 0.28, 0.35);
    }
    addBox(batch, solids, boneMat, o, crypt + 1.72, 0, 0.35, 0.28, 2.35);
  }

  addBox(batch, solids, boneMat, 0, deep - 1.1, 19, 11, 1.1, 19);
  addBox(batch, solids, boneMat, -4.6, deep, 19, 0.7, 3.3, 18);
  addBox(batch, solids, boneMat, 4.6, deep, 19, 0.7, 3.3, 18);
  addBox(batch, solids, boneMat, 0, deep, 27.6, 10, 3.3, 0.7);
  for (let i = 0; i < 8; i++) {
    const drop = (i + 1) * 0.55;
    const h = crypt - drop - deep;
    if (h < 0.2) continue;
    addBox(batch, solids, boneMat, 0, deep, 10.45 + i * 0.85, 2.5, h, 0.72);
  }

  for (const s of shafts) {
    const inner = s.along === "z" ? s.z - s.dir * 3.6 : s.x - s.dir * 3.6;
    for (let i = 0; i < 8; i++) {
      const drop = (i + 1) * 0.55;
      const pos = inner + s.dir * (0.45 + i * 0.82);
      const h = -drop - crypt;
      if (h <= 0.25) continue;
      if (s.along === "z") addBox(batch, solids, boneMat, s.x, crypt, pos, 4.2, h, 0.78);
      else addBox(batch, solids, boneMat, pos, crypt, s.z, 0.78, h, 4.2);
    }
  }

  const niches: Array<{ x: number; y: number; z: number; ry: number; s: number }> = [];
  for (let i = -4; i <= 4; i++) {
    if (i === 0) continue;
    const o = i * 8;
    niches.push(
      { x: -1.05, y: crypt + 1.15, z: o, ry: Math.PI / 2, s: 0.72 },
      { x: 1.05, y: crypt + 1.15, z: o, ry: -Math.PI / 2, s: 0.72 },
      { x: o, y: crypt + 1.15, z: -1.05, ry: 0, s: 0.72 },
      { x: o, y: crypt + 1.15, z: 1.05, ry: Math.PI, s: 0.72 },
    );
  }
  geos.push(instancePlanes(group, skullMat, niches).geo);

  const redMat = new THREE.MeshStandardMaterial({
    color: 0xff2a2a,
    emissive: 0xff2020,
    emissiveIntensity: 2.1,
    roughness: 0.35,
  });
  mats.push(redMat);
  for (const s of shafts) {
    const mouth = s.along === "z"
      ? { x: s.x, z: s.z - s.dir * 4.2 }
      : { x: s.x - s.dir * 4.2, z: s.z };
    for (const side of [-1, 1]) {
      const lx = s.along === "z" ? mouth.x + side * 1.15 : mouth.x;
      const lz = s.along === "z" ? mouth.z : mouth.z + side * 1.15;
      addBox(batch, solids, redMat, lx, 0.15, lz, 0.16, 0.22, 0.16, false);
    }
    if (!isLoDevice()) {
      const lamp = new THREE.PointLight(0xff2a2a, 2.2, 8, 1.8);
      lamp.position.set(mouth.x, 0.8, mouth.z);
      lamp.castShadow = false;
      group.add(lamp);
    }
    const foot = s.along === "z"
      ? { x: s.x, z: s.z + s.dir * 2.2 }
      : { x: s.x + s.dir * 2.2, z: s.z };
    addBox(batch, solids, redMat, foot.x, crypt + 0.2, foot.z, 0.14, 0.16, 0.14, false);
  }

  const candles: Array<[number, number]> = [
    [0, 0],
    [0, -14],
    [0, 14],
    [0, -28],
    [0, 28],
    [-14, 0],
    [14, 0],
    [-28, 0],
    [28, 0],
  ];
  const sunMat = new THREE.MeshBasicMaterial({
    color: 0xfff1c4,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    toneMapped: false,
  });
  mats.push(sunMat);
  const liteCrypt = isLoDevice();
  for (const z of [16.2, 20.2, 24.2]) {
    addBox(batch, solids, sunMat, 0, -8.9, z, 0.16, 8.7, 0.16, false);
    if (!liteCrypt) {
      const shaft = new THREE.PointLight(0xffc070, 2.6, 9, 1.4);
      shaft.position.set(0, deep + 1.6, z);
      shaft.castShadow = false;
      group.add(shaft);
    }
  }

  for (const [x, z] of candles) {
    addBox(batch, solids, emberMat, x, crypt, z, 0.12, 0.28, 0.12, false);
  }
  if (!liteCrypt) {
    for (const [x, z] of [[0, 0], [0, 22], [0, -22]] as const) {
      const lamp = new THREE.PointLight(0xffb060, 1.5, 14, 1.7);
      lamp.position.set(x, crypt + 1.2, z);
      lamp.castShadow = false;
      group.add(lamp);
    }
  }
}

export { makeBotMesh } from "./fighterMesh";

export function makeItemMesh(kind: ItemPad["kind"]): THREE.Group {
  const g = new THREE.Group();
  let color = 0x3ccf7a;
  if (kind === "mega") color = 0x7dffb2;
  else if (kind === "health" || kind === "rush") color = 0xffffff;
  else if (kind === "armor") color = 0x5aa8ff;
  else if (kind === "ammo") color = 0xe8c36a;
  else if (kind === "scatter") color = 0xe24a2b;
  else if (kind === "torpedo") color = 0xff7a3a;
  else if (kind === "lance") color = 0x2ee0c8;
  else if (kind === "ion") color = 0x5aa8ff;
  else if (kind === "fauces") color = 0xff8a3a;
  else if (kind === "knife") color = 0xd5dbe3;
  else if (kind === "bate") color = 0xc4843a;
  else if (kind === "martillo") color = 0xb7c0c8;
  else if (kind === "pulse") color = 0xe8c36a;
  else if (isPower(kind)) color = POWER_META[kind].color;
  const isCrate = kind === "armor" || kind === "ammo";
  const pickupMap = kind === "armor"
    ? loadIconTex("/textures/pickups/armor-crate.jpg")
    : kind === "ammo"
      ? loadIconTex("/textures/pickups/ammo-crate.jpg")
      : pickupTexture(kind);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: kind === "health" || kind === "mega" ? 0x7edc6a : kind === "rush" || kind === "leap" ? 0xffc44d : isCrate ? (kind === "armor" ? 0x3aa8ff : 0xe8b24a) : color,
    emissiveIntensity: isCrate ? 0.34 : 0.92,
    roughness: isCrate ? 0.46 : 0.34,
    metalness: isCrate ? 0.38 : 0.46,
    map: pickupMap,
    emissiveMap: pickupMap,
    toneMapped: !isCrate,
  });
  if (isCrate) {
    if (kind === "armor") {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.4, 0.46), mat);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.1, 0.52), mat);
      lid.position.y = 0.25;
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), mat);
      core.position.y = 0.33;
      g.add(body, lid, core);
    } else {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.38, 0.48), mat);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.09, 0.54), mat);
      lid.position.y = 0.24;
      for (const x of [-0.16, 0, 0.16]) {
        const cell = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.23, 6), mat);
        cell.position.set(x, 0.31, 0);
        g.add(cell);
      }
      g.add(body, lid);
    }
  } else {
    const tall = kind === "lance" || kind === "torpedo";
    const wide = kind === "pulse" || kind === "scatter" || kind === "fauces";
    const pw = tall ? 0.58 : wide ? 0.98 : 0.86;
    const ph = tall ? 1.12 : wide ? 0.62 : 0.86;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, 0.08), mat);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(Math.max(pw, ph) * 0.52, 0.04, 6, 14), mat);
    rim.rotation.x = Math.PI / 2;
    rim.position.z = 0.02;
    g.add(plate, rim);
  }
  const scanRing = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.032, 6, 16), mat);
  scanRing.rotation.x = Math.PI / 2;
  scanRing.position.y = -0.22;
  g.add(scanRing);
  g.userData.pickupMat = mat;
  g.userData.featuredPickup = true;
  g.userData.flatPickup = !isCrate;
  g.userData.cratePickup = isCrate;
  bakeMeshes(g, mat);
  return g;
}

#!/usr/bin/env node
/**
 * Paint the arena and HUD texture set. Every tiling map wraps on both axes
 * so RepeatWrapping and CSS background-size never show a seam.
 *
 *   node scripts/generate-textures.mjs
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SIZE = 512;

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
  return Buffer.concat([sig, pngChunk("IHDR", ihdr), pngChunk("IDAT", deflateSync(raw)), pngChunk("IEND", Buffer.alloc(0))]);
}

function hash(ix, iy, seed) {
  let n = (ix * 374761393 + iy * 668265263 + seed * 1442695041) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function fade(t) {
  return t * t * (3 - 2 * t);
}

/** Value noise that repeats every `period` cells on both axes. */
function noise(x, y, seed, period) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const sx = fade(x - x0);
  const sy = fade(y - y0);
  const wrap = (i) => ((i % period) + period) % period;
  const n00 = hash(wrap(x0), wrap(y0), seed);
  const n10 = hash(wrap(x0 + 1), wrap(y0), seed);
  const n01 = hash(wrap(x0), wrap(y0 + 1), seed);
  const n11 = hash(wrap(x0 + 1), wrap(y0 + 1), seed);
  return n00 * (1 - sx) * (1 - sy) + n10 * sx * (1 - sy) + n01 * (1 - sx) * sy + n11 * sx * sy;
}

function fbm(px, py, size, seed, octaves = 4, base = 4) {
  let amp = 1;
  let freq = base;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise((px / size) * freq, (py / size) * freq, seed + i * 17, freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

function clamp(v, lo = 0, hi = 255) {
  return v < lo ? lo : v > hi ? hi : v;
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function rgb(r, g, b) {
  return [r, g, b];
}

function lerpColor(a, b, t) {
  return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
}

function paint(size, fn) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = fn(x, y, size);
      const i = (y * size + x) * 4;
      rgba[i] = clamp(c[0]);
      rgba[i + 1] = clamp(c[1]);
      rgba[i + 2] = clamp(c[2]);
      rgba[i + 3] = clamp(c[3] ?? 255);
    }
  }
  return rgba;
}

function grain(x, y, size, seed, amount) {
  return (fbm(x, y, size, seed, 4, 8) - 0.5) * amount;
}

function panelShade(x, y, cell) {
  const lx = x % cell;
  const ly = y % cell;
  const edge = 3;
  const groove = lx < edge || ly < edge ? -28 : 0;
  const lip = (lx >= edge && lx < edge + 2) || (ly >= edge && ly < edge + 2) ? 16 : 0;
  const inset = lx > cell - 6 || ly > cell - 6 ? -10 : 0;
  return groove + lip + inset;
}

function rivet(x, y, cell, inset) {
  const spots = [
    [inset, inset],
    [cell - inset, inset],
    [inset, cell - inset],
    [cell - inset, cell - inset],
  ];
  const lx = x % cell;
  const ly = y % cell;
  let best = 99;
  for (const [sx, sy] of spots) {
    const d = Math.hypot(lx - sx, ly - sy);
    if (d < best) best = d;
  }
  if (best < 1.1) return 8;
  if (best < 3.6) return 34;
  if (best < 4.8) return 12;
  return 0;
}

function diamondHeight(x, y, cell) {
  const hx = (x % cell) / cell;
  const hy = (y % cell) / cell;
  const d1 = Math.abs(hx - 0.5) + Math.abs(hy - 0.5);
  const d2 = Math.abs(((hx + 0.5) % 1) - 0.5) + Math.abs(((hy + 0.5) % 1) - 0.5);
  const d = Math.min(d1, d2);
  if (d > 0.34) return 0;
  const edge = d > 0.26;
  return edge ? 0.35 : 1;
}

function hexMask(x, y, colW, rowH) {
  const row = Math.floor(y / rowH);
  const offset = (row & 1) * (colW / 2);
  const lx = (((x + offset) % colW) + colW) % colW;
  const ly = y % rowH;
  const m = 5;
  return lx > m && lx < colW - m && ly > m && ly < rowH - m ? 1 : 0;
}

function chevron(x, y, pitch) {
  const band = pitch / 2;
  const row = Math.floor(y / band);
  const dir = (row & 1) === 0 ? 1 : -1;
  const ly = y % band;
  const u = (x + dir * ly + pitch * 8) % pitch;
  return u < pitch * 0.46;
}

function pipeShade(x, y, pitch, alongY) {
  const t = (alongY ? y : x) % pitch;
  const n = t / pitch;
  const gap = n < 0.1 || n > 0.9;
  if (gap) return -30;
  const s = Math.sin((n - 0.1) / 0.8 * Math.PI);
  return -12 + s * 48;
}

function scratch(x, y, size, seed) {
  const n = fbm(x, y, size, seed, 3, 16);
  const line = Math.abs(n - 0.5) < 0.015 ? -14 : 0;
  return line;
}

function metal(x, y, size, base, seed, opts = {}) {
  const cell = opts.cell ?? 128;
  const g = grain(x, y, size, seed, opts.grain ?? 18);
  const panels = opts.panels === false ? 0 : panelShade(x, y, cell);
  const rivets = opts.rivets === false ? 0 : rivet(x, y, cell, opts.rivetInset ?? 14);
  const sc = opts.scratches === false ? 0 : scratch(x, y, size, seed + 3);
  const along = opts.brush === "y" ? y : x;
  const brush = opts.brush ? Math.sin((along / size) * Math.PI * 64) * 6 : 0;
  const v = g + panels + rivets + sc + brush;
  return [base[0] + v, base[1] + v * 0.98, base[2] + v * 0.94, 255];
}

function floorDiamond(x, y, size, base, seed) {
  const h = diamondHeight(x, y, 64);
  const g = grain(x, y, size, seed, 8);
  const lift = h === 1 ? 48 : h === 0.35 ? 18 : 0;
  return [base[0] + g + lift, base[1] + g + lift + (h > 0 ? 4 : 0), base[2] + g + lift + (h > 0 ? 6 : 0), 255];
}

function hazardStripes(x, y, size) {
  const on = chevron(x, y, 64);
  const g = grain(x, y, size, 9, 10);
  const yellow = [198 + g, 154 + g * 0.6, 36];
  const black = [32 + g * 0.3, 30 + g * 0.3, 28];
  const c = on ? yellow : black;
  return [c[0], c[1], c[2], 255];
}

function drawDisc(px, py, cx, cy, r) {
  return Math.hypot(px - cx, py - cy) <= r;
}

function rune(x, y, size) {
  const cx = size / 2;
  const cy = size / 2;
  const d = Math.hypot(x - cx, y - cy);
  const base = [18, 28, 30];
  const glow = [150, 245, 230];
  const ring = Math.abs(d - size * 0.34) < 5 || Math.abs(d - size * 0.2) < 3;
  const ang = Math.atan2(y - cy, x - cx);
  const ticks = d > size * 0.16 && d < size * 0.4 && Math.abs(Math.sin(ang * 3)) > 0.92;
  const core = d < size * 0.07;
  const g = grain(x, y, size, 21, 8);
  if (ring || ticks || core) return [glow[0] + g, glow[1], glow[2], 255];
  return [base[0] + g, base[1] + g, base[2] + g, 255];
}

function skull(x, y, size) {
  const cx = size / 2;
  const cy = size * 0.46;
  const nx = (x - cx) / size;
  const ny = (y - cy) / size;
  const head = nx * nx * 1.15 + ny * ny * 1.35 < 0.07;
  const jaw = Math.abs(nx) < 0.13 && y > cy + size * 0.12 && y < cy + size * 0.28;
  const eyeL = drawDisc(x, y, cx - size * 0.09, cy - size * 0.02, size * 0.045);
  const eyeR = drawDisc(x, y, cx + size * 0.09, cy - size * 0.02, size * 0.045);
  const nose = Math.abs(nx) < 0.025 && y > cy + size * 0.04 && y < cy + size * 0.12;
  let tooth = false;
  if (y > cy + size * 0.18 && y < cy + size * 0.25 && Math.abs(nx) < 0.11) {
    const slot = Math.floor(((nx + 0.11) / 0.22) * 5);
    tooth = slot % 2 === 0;
  }
  const bone = head || jaw;
  const dark = eyeL || eyeR || nose || (jaw && !tooth && y > cy + size * 0.18);
  const g = grain(x, y, size, 4, 8);
  if (bone && !dark) return [214 + g, 196 + g * 0.7, 160, 255];
  return [28 + g * 0.4, 24, 26, 255];
}

function consoleScreen(x, y, size) {
  const cell = 128;
  const lx = x % cell;
  const ly = y % cell;
  const bezel = lx < 10 || ly < 10 || lx > cell - 10 || ly > cell - 10;
  if (bezel) return metal(x, y, size, [46, 50, 56], 11, { cell: 128, rivets: true });
  const scan = ly % 4 < 1 ? -16 : 0;
  const col = Math.floor(lx / 12);
  const row = Math.floor(ly / 14);
  const on = hash(col, row + Math.floor(y / cell), 77) > 0.58 && lx > 16 && lx < cell - 16 && ly > 16 && ly < cell - 28;
  const bar = ly > cell - 26 && ly < cell - 16 && lx > 16 && lx < cell * 0.62;
  if (on || bar) return [120, 235, 220, 255];
  return [10, 24 + scan, 28 + scan, 255];
}

function sky(x, y, size) {
  const t = y / (size - 1);
  const zenith = [16, 18, 36];
  const mid = [92, 28, 36];
  const horizon = [214, 96, 42];
  const haze = [255, 168, 96];
  let c;
  if (t < 0.55) c = lerpColor(zenith, mid, t / 0.55);
  else if (t < 0.82) c = lerpColor(mid, horizon, (t - 0.55) / 0.27);
  else c = lerpColor(horizon, haze, (t - 0.82) / 0.18);
  const cloud = fbm(x, y * 0.35, size, 5, 4, 4);
  const puff = t < 0.7 && cloud > 0.58 ? (cloud - 0.58) * 80 : 0;
  return [c[0] + puff * 0.6, c[1] + puff * 0.25, c[2] + puff * 0.15, 255];
}

function horizonCity(x, y, size) {
  const t = y / (size - 1);
  const skyC = lerpColor([120, 42, 32], [232, 120, 58], Math.min(1, t * 1.4));
  const heights = [0.42, 0.62, 0.5, 0.74, 0.46, 0.68, 0.55, 0.8, 0.48, 0.66, 0.52, 0.72, 0.44, 0.6, 0.7, 0.5];
  const colW = size / heights.length;
  const col = Math.floor(x / colW) % heights.length;
  const localX = x % colW;
  const roof = 1 - heights[col];
  const building = t > roof;
  const win = building && localX % 7 < 2 && y % 11 < 3 && hash(col, Math.floor(y / 11), 3) > 0.45;
  if (win) return [255, 186, 110, 255];
  if (building) return [18 + (col % 3) * 4, 16, 20, 255];
  const glow = t > 0.78 ? (t - 0.78) * 40 : 0;
  return [skyC[0] + glow, skyC[1] + glow * 0.4, skyC[2], 255];
}

function rock(x, y, size) {
  const n = fbm(x, y, size, 13, 5, 4);
  const crack = Math.abs(fbm(x, y, size, 19, 3, 6) - 0.5) < 0.02 ? -40 : 0;
  const c = lerpColor([72, 64, 58], [148, 132, 118], n);
  return [c[0] + crack, c[1] + crack, c[2] + crack, 255];
}

function glass(x, y, size) {
  const streak = Math.sin((x / size) * Math.PI * 8) * 0.5 + 0.5;
  const n = fbm(x, y, size, 8, 3, 4);
  const a = 70 + streak * 50 + n * 40;
  return [150 + streak * 40, 210, 220, a];
}

function coolant(x, y, size) {
  const n = fbm(x, y, size, 15, 4, 4);
  const c = lerpColor([10, 90, 80], [80, 240, 210], n);
  return [c[0], c[1], c[2], 150 + n * 70];
}

function core(x, y, size) {
  const n = fbm(x, y, size, 23, 5, 4);
  const hot = n > 0.62;
  const c = hot ? lerpColor([255, 150, 40], [255, 240, 180], (n - 0.62) / 0.38) : lerpColor([90, 18, 12], [210, 60, 24], n / 0.62);
  return [c[0], c[1], c[2], 255];
}

function emissivePanel(x, y, size, color, seed) {
  const cell = 128;
  const shade = panelShade(x, y, cell) * 0.35;
  const g = grain(x, y, size, seed, 12);
  const hot = diamondHeight(x, y, 64) * 40;
  return [color[0] + shade + g + hot, color[1] + shade + g * 0.4 + hot * 0.3, color[2] + shade * 0.5 + hot * 0.1, 255];
}

function beamTex(x, y, size) {
  const n = fbm(x, y, size, 31, 4, 8);
  const coreBand = Math.abs((x % 64) - 32) < 8 + n * 10;
  if (!coreBand) return [40, 8, 4, 0];
  const hot = 180 + n * 75;
  return [255, hot * 0.55, 48, 140 + n * 80];
}

function screen(x, y, size) {
  return consoleScreen(x, y, size);
}

function vent(x, y, size) {
  const slat = y % 16 < 5;
  const g = grain(x, y, size, 12, 8);
  if (slat) return [22 + g, 24 + g, 28, 255];
  const rib = Math.sin((y / 16) * Math.PI) * 18;
  return [78 + g + rib, 82 + g + rib, 88 + rib, 255];
}

function jumppad(x, y, size) {
  const cx = (x % 256) - 128;
  const cy = (y % 256) - 128;
  const d = Math.hypot(cx, cy);
  const ring = Math.abs(d - 78) < 10 || Math.abs(d - 46) < 6;
  const chev = d < 28;
  const g = grain(x, y, size, 6, 8);
  if (ring || chev) return [140, 255, 236, 255];
  return [16 + g, 36 + g, 38, 255];
}

function armorHex(x, y, size, base, seed) {
  const on = hexMask(x, y, 64, 64);
  const g = grain(x, y, size, seed, 12);
  const lift = on ? 22 : -16;
  return [base[0] + g + lift, base[1] + g + lift + (on ? 8 : 0), base[2] + g + lift + (on ? 14 : 0), 255];
}

function visor(x, y, size) {
  const t = y / size;
  const c = lerpColor([8, 16, 22], [20, 48, 58], t);
  const streak = Math.abs((x / size) * 0.7 + (y / size) * 0.3 - 0.45) < 0.04 ? 70 : 0;
  return [c[0] + streak, c[1] + streak, c[2] + streak * 0.8, 255];
}

function ruinWall(x, y, size) {
  const brickW = 64;
  const brickH = 32;
  const row = Math.floor(y / brickH);
  const offset = (row & 1) * (brickW / 2);
  const lx = (((x + offset) % brickW) + brickW) % brickW;
  const ly = y % brickH;
  const mortar = lx < 4 || ly < 4;
  const n = fbm(x, y, size, 27, 4, 4);
  const stain = fbm(x, y, size, 28, 2, 2);
  if (mortar) return [150 + stain * 20, 78, 48, 255];
  const c = lerpColor([78, 70, 64], [124, 112, 100], n);
  return [c[0], c[1], c[2], 255];
}

const ARENA = {
  floor: (x, y, s) => floorDiamond(x, y, s, [168, 172, 176], 1),
  plate: (x, y, s) => metal(x, y, s, [104, 108, 114], 2, { cell: 128, grain: 7, scratches: false }),
  wall: (x, y, s) => metal(x, y, s, [96, 100, 108], 3, { cell: 128, grain: 14 }),
  beam: (x, y, s) => metal(x, y, s, [108, 96, 84], 4, { cell: 256, brush: "y", rivetInset: 18 }),
  pipes: (x, y, s) => {
    const shade = pipeShade(x, y, 64, false);
    const g = grain(x, y, s, 5, 8);
    const rust = (y % 64) > 52 ? 18 : 0;
    return [92 + shade + g + rust, 96 + shade + g, 102 + shade + g - rust * 0.4, 255];
  },
  hazard: hazardStripes,
  console: consoleScreen,
  rune,
  ruin: ruinWall,
  armor: (x, y, s) => armorHex(x, y, s, [70, 86, 108], 6),
  skull,
  gunmetal: (x, y, s) => metal(x, y, s, [86, 90, 96], 7, { cell: 256, brush: "x", panels: false, rivets: false, grain: 10 }),
  polymer: (x, y, s) => {
    const n = fbm(x, y, s, 8, 5, 8);
    return [28 + n * 22, 30 + n * 20, 34 + n * 18, 255];
  },
  visor,
  "sky-dome": sky,
  horizon: horizonCity,
};

const REACTOR = {
  floor: (x, y, s) => floorDiamond(x, y, s, [132, 158, 156], 41),
  metal: (x, y, s) => metal(x, y, s, [118, 122, 128], 42, { cell: 128 }),
  dark: (x, y, s) => metal(x, y, s, [36, 38, 44], 43, { cell: 128, grain: 8, scratches: false }),
  rock,
  armor: (x, y, s) => armorHex(x, y, s, [64, 78, 96], 44),
  glass,
  coolant,
  core,
  cyan: (x, y, s) => emissivePanel(x, y, s, [40, 190, 176], 45),
  red: (x, y, s) => emissivePanel(x, y, s, [190, 36, 32], 46),
  beam: beamTex,
  screen,
  vent,
  jumppad,
  hazard: hazardStripes,
};

function writeSet(dir, set) {
  mkdirSync(dir, { recursive: true });
  const names = [];
  for (const [name, fn] of Object.entries(set)) {
    const rgba = paint(SIZE, fn);
    writeFileSync(join(dir, `${name}.png`), encodePng(SIZE, SIZE, rgba));
    names.push(name);
  }
  return names;
}

function assertSeamless(name, fn) {
  const a = fn(0, 10, SIZE);
  const b = fn(SIZE, 10, SIZE);
  for (let i = 0; i < 3; i++) {
    if (Math.abs(a[i] - b[i]) > 1.5) {
      throw new Error(`${name} does not wrap on x (${a} vs ${b})`);
    }
  }
  const c = fn(20, 0, SIZE);
  const d = fn(20, SIZE, SIZE);
  for (let i = 0; i < 3; i++) {
    if (Math.abs(c[i] - d[i]) > 1.5) {
      throw new Error(`${name} does not wrap on y (${c} vs ${d})`);
    }
  }
}

const skipWrap = new Set(["sky-dome", "horizon", "visor", "skull", "rune"]);
for (const [name, fn] of Object.entries({ ...ARENA, ...REACTOR })) {
  if (skipWrap.has(name)) continue;
  assertSeamless(name, fn);
}

const arena = writeSet(join(ROOT, "public/textures"), ARENA);
const reactor = writeSet(join(ROOT, "public/textures/reactor"), REACTOR);
console.log(JSON.stringify({ size: SIZE, arena, reactor }, null, 2));

#!/usr/bin/env python3
"""Fill missing JPEGs under public/textures/. Existing photoreal maps are kept.

Pass --force to overwrite. The committed files in public/textures/ are the
source of truth for the arena look.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "textures"

# Matches every /textures/*.jpg referenced from src/.
TEXTURES = (
    "floor.jpg",
    "plate.jpg",
    "beam.jpg",
    "pipes.jpg",
    "hazard.jpg",
    "console.jpg",
    "rune.jpg",
    "ruin.jpg",
    "armor.jpg",
    "skull.jpg",
    "sky-dome.jpg",
    "horizon.jpg",
    "gunmetal.jpg",
    "polymer.jpg",
    "visor.jpg",
    "wall.jpg",
)


def clamp01(a: np.ndarray) -> np.ndarray:
    return np.clip(a, 0.0, 1.0)


def lerp(a: np.ndarray | float, b: np.ndarray | float, t: np.ndarray | float):
    return a * (1.0 - t) + b * t


def hash21(ix: np.ndarray, iy: np.ndarray, seed: float = 0.0) -> np.ndarray:
    n = np.sin(ix * 127.1 + iy * 311.7 + seed * 19.19) * 43758.5453
    return n - np.floor(n)


def tile_value_noise(x: np.ndarray, y: np.ndarray, period: int, cell: float, seed: float) -> np.ndarray:
    gx = x / cell
    gy = y / cell
    tiles = max(1.0, period / cell)
    ix = np.floor(gx)
    iy = np.floor(gy)
    fx = gx - ix
    fy = gy - iy
    ux = fx * fx * (3.0 - 2.0 * fx)
    uy = fy * fy * (3.0 - 2.0 * fy)

    def h(ox: float, oy: float) -> np.ndarray:
        return hash21(np.mod(ix + ox, tiles), np.mod(iy + oy, tiles), seed)

    return lerp(lerp(h(0, 0), h(1, 0), ux), lerp(h(0, 1), h(1, 1), ux), uy)


def fbm(x: np.ndarray, y: np.ndarray, period: int, cell: float, seed: float, octaves: int = 4) -> np.ndarray:
    total = np.zeros_like(x, dtype=np.float64)
    amp = 0.5
    norm = 0.0
    c = cell
    s = seed
    for _ in range(octaves):
        total += amp * tile_value_noise(x, y, period, c, s)
        norm += amp
        amp *= 0.5
        c = max(2.0, c * 0.5)
        s += 17.3
    return total / max(norm, 1e-6)


def grid(size: int, h: int | None = None) -> tuple[np.ndarray, np.ndarray]:
    height = size if h is None else h
    y, x = np.mgrid[0:height, 0:size]
    return x.astype(np.float64), y.astype(np.float64)


def rgb(r: np.ndarray, g: np.ndarray, b: np.ndarray) -> np.ndarray:
    return np.stack([clamp01(r), clamp01(g), clamp01(b)], axis=-1)


def mix_color(a: tuple[float, float, float], b: tuple[float, float, float], t: np.ndarray | float) -> np.ndarray:
    t = np.asarray(t)
    return np.stack(
        [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)],
        axis=-1,
    )


def wrap_dist(a: np.ndarray, b: float, period: int) -> np.ndarray:
    d = np.abs(a - b)
    return np.minimum(d, period - d)


def circle(x: np.ndarray, y: np.ndarray, cx: float, cy: float, r: float, period: int | None = None) -> np.ndarray:
    if period is None:
        dx = x - cx
        dy = y - cy
    else:
        dx = wrap_dist(x, cx, period)
        dy = wrap_dist(y, cy, period)
    return np.sqrt(dx * dx + dy * dy) / r


def save_jpg(name: str, arr: np.ndarray, quality: int = 86) -> None:
    img = (clamp01(arr) * 255.0 + 0.5).astype(np.uint8)
    Image.fromarray(img, "RGB").save(OUT / name, "JPEG", quality=quality, optimize=True, subsampling=0)


def metal_base(x: np.ndarray, y: np.ndarray, period: int, cool: bool = True) -> np.ndarray:
    grain = fbm(x, y, period, period / 6, 2.2, 5)
    brush = fbm(x, y * 6.0, period, period / 10, 8.1, 3)
    dirt = fbm(x * 0.7, y * 0.7, period, period / 3, 4.4, 4)
    if cool:
        c0 = (0.10, 0.11, 0.13)
        c1 = (0.22, 0.23, 0.26)
        rust = (0.28, 0.14, 0.10)
    else:
        c0 = (0.12, 0.10, 0.09)
        c1 = (0.26, 0.20, 0.16)
        rust = (0.42, 0.16, 0.08)
    col = mix_color(c0, c1, grain * 0.65 + brush * 0.35)
    rust_mask = clamp01((dirt - 0.62) * 3.2)
    col = col * (1.0 - rust_mask[..., None] * 0.55) + np.array(rust) * rust_mask[..., None] * 0.55
    return col, grain, brush


def panel_lines(x: np.ndarray, y: np.ndarray, period: int, cell: int, width: float = 2.4) -> np.ndarray:
    px = np.minimum(x % cell, cell - (x % cell))
    py = np.minimum(y % cell, cell - (y % cell))
    seam = np.minimum(px, py)
    line = clamp01(1.0 - seam / width)
    return line * line


def rivets(x: np.ndarray, y: np.ndarray, period: int, cell: int, radius: float = 3.6) -> np.ndarray:
    lx = (x % cell) - cell * 0.12
    ly = (y % cell) - cell * 0.12
    d = np.sqrt(lx * lx + ly * ly)
    ring = np.exp(-((d - radius * 0.55) ** 2) / (radius * 0.35) ** 2)
    cap = clamp01(1.0 - d / radius)
    other = np.sqrt(((x % cell) - cell * 0.88) ** 2 + ((y % cell) - cell * 0.12) ** 2)
    ring2 = np.exp(-((other - radius * 0.55) ** 2) / (radius * 0.35) ** 2)
    return clamp01(cap * 0.55 + ring * 0.9 + ring2 * 0.75)


def make_floor(n: int = 512) -> np.ndarray:
    x, y = grid(n)
    grain = fbm(x, y, n, n / 6, 2.2, 5)
    cell = n // 2
    seams = panel_lines(x, y, n, cell, 3.2)
    glow = clamp01(seams * 1.35)
    # Classic raised diamond tread, staggered.
    sx = x / n * 10.0
    sy = y / n * 10.0
    row = np.floor(sy)
    sx = sx + 0.5 * (row % 2)
    fx = np.abs((sx % 1.0) - 0.5)
    fy = np.abs((sy % 1.0) - 0.5)
    diamond = clamp01(1.0 - (fx + fy) * 2.55)
    bevel = clamp01((fx + fy) * 2.55 - 0.72)
    ion = np.array([0.18, 0.92, 0.82])
    col = mix_color((0.08, 0.09, 0.10), (0.17, 0.19, 0.21), grain)
    raised = mix_color((0.20, 0.22, 0.24), (0.34, 0.36, 0.38), grain)
    col = col * (1.0 - diamond[..., None] * 0.85) + raised * diamond[..., None]
    col = col + bevel[..., None] * np.array([0.06, 0.07, 0.08])
    col = col * (1.0 - glow[..., None] * 0.55) + ion * glow[..., None] * 0.9
    bolts = rivets(x, y, n, cell, 5.0)
    col = col + bolts[..., None] * np.array([0.14, 0.16, 0.17])
    return np.clip(col, 0, 1)


def make_plate(n: int = 512) -> np.ndarray:
    x, y = grid(n)
    col, grain, brush = metal_base(x, y, n, cool=True)
    cell = n // 2
    seams = panel_lines(x, y, n, cell, 4.0)
    col = mix_color((0.11, 0.12, 0.14), (0.28, 0.29, 0.32), grain * 0.5 + brush * 0.5)
    col = col * (1.0 - seams[..., None] * 0.55)
    col = col + rivets(x, y, n, cell, 5.0)[..., None] * 0.18
    scratch = clamp01(fbm(x * 3, y, n, n / 8, 12.0, 3) - 0.72) * 0.25
    col = col + scratch[..., None]
    return np.clip(col, 0, 1)


def make_wall(n: int = 512) -> np.ndarray:
    x, y = grid(n)
    grain = fbm(x, y, n, n / 6, 2.2, 5)
    brush = fbm(x, y * 6.0, n, n / 10, 8.1, 3)
    cell_x, cell_y = n // 2, n // 3
    px = np.minimum(x % cell_x, cell_x - (x % cell_x))
    py = np.minimum(y % cell_y, cell_y - (y % cell_y))
    seams = clamp01(1.0 - np.minimum(px, py) / 3.2) ** 2
    base = mix_color((0.09, 0.10, 0.12), (0.20, 0.21, 0.24), grain * 0.6 + brush * 0.4)
    base = base * (1.0 - seams[..., None] * 0.6)
    rust = clamp01(fbm(x, y, n, n / 2.2, 3.3, 4) - 0.58)
    base = base * (1.0 - rust[..., None] * 0.4) + np.array([0.32, 0.13, 0.07]) * rust[..., None] * 0.4
    base = base + rivets(x, y, n, cell_x, 4.4)[..., None] * 0.14
    return np.clip(base, 0, 1)


def make_beam(n: int = 512) -> np.ndarray:
    x, y = grid(n)
    grain = fbm(x, y, n, n / 5, 1.1, 5)
    rust = fbm(x * 0.6, y, n, n / 3, 9.0, 4)
    cx = np.abs((x / n) - 0.5)
    web = clamp01(1.0 - (cx - 0.18) * 18.0)
    flange = clamp01(1.0 - np.abs((y % (n / 8)) - n / 16) / 6.0)
    steel = mix_color((0.16, 0.16, 0.17), (0.36, 0.26, 0.18), grain)
    col = steel * (0.42 + web[..., None] * 0.7)
    rust_m = clamp01((rust - 0.48) * 2.2) * (0.35 + cx * 0.9)
    col = col * (1.0 - rust_m[..., None] * 0.75) + np.array([0.55, 0.18, 0.07]) * rust_m[..., None] * 0.75
    rivet_y = ((y + n / 16) % (n / 8)) - n / 16
    rivet_x = wrap_dist(x, n * 0.28, n)
    rivet_x2 = wrap_dist(x, n * 0.72, n)
    cap = np.exp(-(rivet_x**2 + rivet_y**2) / 18.0) + np.exp(-(rivet_x2**2 + rivet_y**2) / 18.0)
    col = col + cap[..., None] * 0.16
    col = col * (0.92 + flange[..., None] * 0.1)
    return np.clip(col, 0, 1)


def make_pipes(n: int = 512) -> np.ndarray:
    x, y = grid(n)
    grain = fbm(x, y, n, n / 6, 5.5, 4)
    band = (y / n) * 3.0
    local = band - np.floor(band)
    cy = (local - 0.5) * 2.0
    radius = np.abs(cy)
    body = (radius < 0.62).astype(np.float64)
    shade = clamp01(1.0 - (cy * 1.15) ** 2)
    highlight = np.exp(-((cy + 0.18) ** 2) / 0.04)
    seam = clamp01(1.0 - wrap_dist(x, n * 0.5, n) / 5.0) * body
    flange = clamp01(1.0 - wrap_dist(x, 0, n) / 22.0) * body
    steel = mix_color((0.16, 0.18, 0.19), (0.38, 0.42, 0.40), grain)
    bg = mix_color((0.06, 0.07, 0.08), (0.10, 0.11, 0.12), grain)
    col = bg * (1.0 - body[..., None]) + steel * body[..., None] * (0.45 + shade[..., None] * 0.55)
    col = col + highlight[..., None] * body[..., None] * 0.22
    col = col + seam[..., None] * 0.16
    col = col * (1.0 - flange[..., None] * 0.2) + np.array([0.18, 0.62, 0.55]) * flange[..., None] * 0.45
    rust = clamp01(fbm(x, y, n, n / 4, 2.2, 3) - 0.64) * body
    col = col + rust[..., None] * np.array([0.22, 0.07, 0.03])
    return np.clip(col, 0, 1)


def make_hazard(n: int = 512) -> np.ndarray:
    x, y = grid(n)
    grain = fbm(x, y, n, n / 8, 1.7, 3)
    stripe = np.mod((x + y) / n * 8.0, 1.0)
    on = (stripe < 0.5).astype(np.float64)
    dark = mix_color((0.06, 0.07, 0.08), (0.12, 0.13, 0.14), grain)
    ion = mix_color((0.10, 0.55, 0.50), (0.22, 0.92, 0.82), grain * 0.4 + 0.3)
    col = dark * (1.0 - on[..., None]) + ion * on[..., None]
    wear = clamp01(fbm(x, y, n, n / 3, 6.6, 4) - 0.55)
    col = col * (1.0 - wear[..., None] * 0.25)
    return np.clip(col, 0, 1)


def make_console(n: int = 512) -> np.ndarray:
    x, y = grid(n)
    grain = fbm(x, y, n, n / 7, 3.1, 4)
    col = mix_color((0.07, 0.08, 0.10), (0.14, 0.16, 0.18), grain)
    # Screen tiles.
    cell = n // 4
    lx = x % cell
    ly = y % cell
    inset = 10.0
    screen = ((lx > inset) & (lx < cell - inset) & (ly > inset) & (ly < cell - inset * 1.4)).astype(np.float64)
    glow = np.exp(-(((lx - cell * 0.5) / (cell * 0.28)) ** 2 + ((ly - cell * 0.42) / (cell * 0.22)) ** 2))
    scan = 0.5 + 0.5 * np.sin(y * (math.pi * 40 / n))
    ion = np.array([0.12, 0.85, 0.75])
    amber = np.array([0.95, 0.55, 0.18])
    which = ((np.floor(x / cell) + np.floor(y / cell)) % 2)
    tint = ion * (1.0 - which)[..., None] + amber * which[..., None]
    col = col * (1.0 - screen[..., None] * 0.85) + tint * screen[..., None] * (0.18 + glow[..., None] * 0.7) * (0.7 + scan[..., None] * 0.3)
    vents = clamp01(1.0 - np.abs((ly - cell * 0.82) / 4.0)) * ((lx > inset) & (lx < cell - inset)).astype(np.float64)
    slats = (np.sin(x * (math.pi * 24 / n)) > 0.2).astype(np.float64)
    col = col * (1.0 - vents[..., None] * slats[..., None] * 0.5)
    col = col + panel_lines(x, y, n, cell, 2.0)[..., None] * np.array([0.08, 0.22, 0.20])
    return np.clip(col, 0, 1)


def make_rune(n: int = 512) -> np.ndarray:
    x, y = grid(n)
    grain = fbm(x, y, n, n / 5, 7.7, 4)
    col = mix_color((0.05, 0.07, 0.08), (0.10, 0.13, 0.14), grain)
    cx = cy = n * 0.5
    r = circle(x, y, cx, cy, n * 0.38)
    ring = np.exp(-((r - 1.0) ** 2) / 0.004)
    ring2 = np.exp(-((r - 0.62) ** 2) / 0.003)
    # Cross + chevron, similar to the menu crest.
    arm_h = (np.abs(x - cx) < n * 0.035) & (np.abs(y - cy) < n * 0.28)
    arm_v = (np.abs(y - cy) < n * 0.035) & (np.abs(x - cx) < n * 0.28)
    chev = np.abs((y - (cy - n * 0.08)) - np.abs(x - cx) * 0.55) < n * 0.028
    chev = chev & (y < cy + n * 0.12) & (y > cy - n * 0.22)
    glyph = (arm_h | arm_v | chev).astype(np.float64)
    ion = np.array([0.22, 0.95, 0.88])
    glow = clamp01(ring + ring2 * 0.8 + glyph * 1.1)
    spread = np.exp(-(np.minimum(r, 1.2) ** 2) * 1.6) * 0.15
    col = col + ion * (glow[..., None] * 0.95 + spread[..., None])
    return np.clip(col, 0, 1)


def make_ruin(n: int = 512) -> np.ndarray:
    x, y = grid(n)
    grain = fbm(x, y, n, n / 4, 2.0, 5)
    n1 = fbm(x, y, n, n / 5, 11.2, 5)
    n2 = fbm(x * 1.7, y * 0.45, n, n / 9, 14.8, 4)
    ridged = 1.0 - np.abs(n1 * 2.0 - 1.0)
    cracks = clamp01((ridged - 0.78) * 14.0) * clamp01((n2 - 0.35) * 2.4)
    col = mix_color((0.14, 0.10, 0.08), (0.30, 0.18, 0.11), grain)
    ember = np.array([1.0, 0.32, 0.12])
    col = col * (1.0 - cracks[..., None] * 0.45) + ember * cracks[..., None] * 0.8
    spall = clamp01(fbm(x, y, n, n / 6, 4.8, 3) - 0.72)
    col = col + spall[..., None] * np.array([0.08, 0.04, 0.02])
    return np.clip(col, 0, 1)


def make_armor(n: int = 512) -> np.ndarray:
    x, y = grid(n)
    grain = fbm(x, y, n, n / 6, 6.4, 4)
    # Hex tiling.
    s = n / 6.0
    q = (2.0 / 3.0 * x) / s
    rr = (-1.0 / 3.0 * x + math.sqrt(3) / 3.0 * y) / s
    # Cube-round to hex
    xq, yq, zq = q, rr, -q - rr
    rx, ry, rz = np.round(xq), np.round(yq), np.round(zq)
    x_diff, y_diff, z_diff = np.abs(rx - xq), np.abs(ry - yq), np.abs(rz - zq)
    swap_x = (x_diff > y_diff) & (x_diff > z_diff)
    swap_y = ~swap_x & (y_diff > z_diff)
    rx = np.where(swap_x, -ry - rz, rx)
    ry = np.where(swap_y, -rx - rz, ry)
    # Local coords inside hex via remaining fractional
    hx = (xq - rx)
    hy = (yq - ry)
    edge = clamp01(np.maximum(np.abs(hx), np.abs(hy)) * 2.55 - 0.72)
    col = mix_color((0.16, 0.18, 0.20), (0.38, 0.40, 0.42), grain)
    col = col * (1.0 - edge[..., None] * 0.65)
    col = col + edge[..., None] * np.array([0.05, 0.06, 0.07])
    center = clamp01(1.0 - np.sqrt(hx * hx + hy * hy) * 2.2)
    col = col + center[..., None] * 0.06
    dent = clamp01(fbm(x, y, n, n / 5, 1.9, 3) - 0.6) * 0.1
    col = col - dent[..., None]
    return np.clip(col, 0, 1)


def make_skull(n: int = 512) -> np.ndarray:
    x, y = grid(n)
    grain = fbm(x, y, n, n / 6, 8.8, 3)
    col = mix_color((0.08, 0.06, 0.05), (0.16, 0.10, 0.08), grain)
    cx, cy = n * 0.5, n * 0.46
    cranium = circle(x, y, cx, cy, n * 0.28)
    jaw = circle(x, y, cx, cy + n * 0.16, n * 0.18)
    skull = clamp01(1.0 - np.minimum(cranium, jaw) ** 8)
    eye_l = circle(x, y, cx - n * 0.09, cy - n * 0.02, n * 0.07)
    eye_r = circle(x, y, cx + n * 0.09, cy - n * 0.02, n * 0.07)
    eyes = clamp01(1.0 - np.minimum(eye_l, eye_r) ** 6)
    nose = (np.abs(x - cx) < n * 0.03 + (y - cy) * 0.12) & (y > cy) & (y < cy + n * 0.1)
    teeth_y = (y > cy + n * 0.18) & (y < cy + n * 0.26)
    teeth_x = (np.sin((x - cx) * (math.pi * 14 / n)) > 0.15) & (np.abs(x - cx) < n * 0.12)
    teeth = (teeth_y & teeth_x).astype(np.float64)
    ember = np.array([1.0, 0.28, 0.10])
    bone = np.array([0.85, 0.78, 0.62])
    col = col * (1.0 - skull[..., None] * 0.85) + bone * skull[..., None] * 0.55
    col = col * (1.0 - eyes[..., None]) + ember * eyes[..., None] * 0.95
    col = col * (1.0 - nose[..., None] * 0.85)
    col = col * (1.0 - teeth[..., None] * 0.7)
    ring = np.exp(-((circle(x, y, cx, cy, n * 0.42) - 1.0) ** 2) / 0.006)
    col = col + ember * ring[..., None] * 0.45
    return np.clip(col, 0, 1)


def make_sky_dome(w: int = 1024, h: int = 512) -> np.ndarray:
    x, y = grid(w, h)
    v = y / (h - 1)  # 0 zenith → 1 horizon (top hemisphere UVs)
    u = x / w
    sun = np.exp(-(((u - 0.62) * 6.2) ** 2 + ((v - 0.18) * 4.8) ** 2))
    haze = fbm(x, y, w, w / 4, 1.4, 4)
    zenith = np.array([0.55, 0.12, 0.06])
    mid = np.array([0.72, 0.22, 0.08])
    horizon = np.array([0.18, 0.05, 0.04])
    t = v * v
    col = zenith * (1.0 - t)[..., None] + mid * (t * (1.0 - v))[..., None] * 1.4
    col = col * (1.0 - v[..., None] * 0.35) + horizon * (v[..., None] ** 1.6)
    col = col + np.array([1.0, 0.72, 0.28]) * sun[..., None] * 0.85
    col = col + np.array([1.0, 0.35, 0.10]) * np.exp(-((v - 0.72) ** 2) / 0.04)[..., None] * 0.25
    col = col * (0.92 + haze[..., None] * 0.12)
    return np.clip(col, 0, 1)


def make_horizon(w: int = 2048, h: int = 384) -> np.ndarray:
    x, y = grid(w, h)
    u = x / w
    v = y / (h - 1)
    sky = mix_color((0.55, 0.14, 0.06), (0.12, 0.04, 0.04), clamp01((v - 0.15) / 0.7))
    sun = np.exp(-(((np.mod(u + 0.08, 1.0) - 0.5) * 8.0) ** 2 + ((v - 0.28) * 5.0) ** 2))
    sky = sky + np.array([1.0, 0.55, 0.18]) * sun[..., None] * 0.55
    # Repeatable building silhouette.
    span = (u * 18.0)
    bid = np.floor(span)
    frac = span - bid
    hgt = 0.35 + 0.5 * hash21(np.mod(bid, 18.0), np.zeros_like(bid), 3.1)
    hgt = hgt * (0.75 + 0.25 * hash21(np.mod(bid, 18.0), np.ones_like(bid), 8.8))
    tower = (v > 1.0 - hgt) & (frac > 0.12) & (frac < 0.88)
    windows = tower & (np.sin(y * 0.35) > 0.35) & (np.sin(x * 0.22) > 0.2)
    ground = v > 0.92
    col = sky
    col = np.where(tower[..., None], np.array([0.05, 0.04, 0.05]), col)
    col = np.where(windows[..., None], np.array([0.95, 0.42, 0.12]), col)
    col = np.where(ground[..., None], np.array([0.03, 0.02, 0.02]), col)
    return np.clip(col, 0, 1)


def make_gunmetal(n: int = 512) -> np.ndarray:
    x, y = grid(n)
    grain = fbm(x, y, n, n / 7, 4.0, 5)
    brush = fbm(x, y * 8.0, n, n / 12, 9.9, 3)
    col = mix_color((0.18, 0.20, 0.22), (0.42, 0.45, 0.48), grain * 0.45 + brush * 0.55)
    spec = clamp01(brush - 0.55) * 0.2
    col = col + spec[..., None]
    return np.clip(col, 0, 1)


def make_polymer(n: int = 512) -> np.ndarray:
    x, y = grid(n)
    grain = fbm(x, y, n, n / 5, 2.6, 5)
    speckle = tile_value_noise(x, y, n, 3.0, 14.0)
    col = mix_color((0.22, 0.23, 0.20), (0.40, 0.41, 0.36), grain)
    col = col * (0.92 + speckle[..., None] * 0.12)
    return np.clip(col, 0, 1)


def make_visor(n: int = 512) -> np.ndarray:
    x, y = grid(n)
    v = y / n
    grain = fbm(x, y, n, n / 4, 1.2, 3)
    col = mix_color((0.02, 0.18, 0.22), (0.10, 0.85, 0.90), 0.25 + 0.5 * (1.0 - v) + grain * 0.15)
    scan = 0.55 + 0.45 * np.sin(y * (math.pi * 36 / n))
    flare = np.exp(-(((x / n - 0.35) * 4.0) ** 2 + ((y / n - 0.3) * 3.2) ** 2))
    col = col * (0.75 + scan[..., None] * 0.35)
    col = col + np.array([0.7, 1.0, 1.0]) * flare[..., None] * 0.45
    return np.clip(col, 0, 1)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    makers = {
        "floor.jpg": lambda: make_floor(),
        "plate.jpg": lambda: make_plate(),
        "wall.jpg": lambda: make_wall(),
        "beam.jpg": lambda: make_beam(),
        "pipes.jpg": lambda: make_pipes(),
        "hazard.jpg": lambda: make_hazard(),
        "console.jpg": lambda: make_console(),
        "rune.jpg": lambda: make_rune(),
        "ruin.jpg": lambda: make_ruin(),
        "armor.jpg": lambda: make_armor(),
        "skull.jpg": lambda: make_skull(),
        "sky-dome.jpg": lambda: make_sky_dome(),
        "horizon.jpg": lambda: make_horizon(),
        "gunmetal.jpg": lambda: make_gunmetal(),
        "polymer.jpg": lambda: make_polymer(),
        "visor.jpg": lambda: make_visor(),
    }
    assert set(makers) == set(TEXTURES)
    force = "--force" in sys.argv
    for name in TEXTURES:
        path = OUT / name
        if path.exists() and not force:
            print(f"{name:16} skip (exists)")
            continue
        arr = makers[name]()
        quality = 84 if arr.shape[0] <= 512 else 82
        save_jpg(name, arr, quality=quality)
        print(f"{name:16} {arr.shape[1]}x{arr.shape[0]}  {path.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()

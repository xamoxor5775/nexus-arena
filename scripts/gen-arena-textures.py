#!/usr/bin/env python3
"""Texturas tileables para Cumbre y LAVE. No toca las del Pozo."""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "public" / "textures"
SIZE = 512
SKY_W, SKY_H = 1024, 512


def fade(t: float) -> float:
    return t * t * t * (t * (t * 6 - 15) + 10)


def hash2(ix: int, iy: int, seed: int) -> float:
    n = (ix * 374761393 + iy * 668265263 + seed * 1274126177) & 0xFFFFFFFF
    n = (n ^ (n >> 13)) * 1274126177 & 0xFFFFFFFF
    return (n ^ (n >> 16)) / 4294967295.0


def vnoise(x: float, y: float, seed: int, period: float) -> float:
    x %= period
    y %= period
    x0 = math.floor(x)
    y0 = math.floor(y)
    x1 = (x0 + 1) % int(period)
    y1 = (y0 + 1) % int(period)
    tx, ty = fade(x - x0), fade(y - y0)
    n00 = hash2(x0, y0, seed)
    n10 = hash2(x1, y0, seed)
    n01 = hash2(x0, y1, seed)
    n11 = hash2(x1, y1, seed)
    return (n00 * (1 - tx) + n10 * tx) * (1 - ty) + (n01 * (1 - tx) + n11 * tx) * ty


def fbm(x: float, y: float, seed: int, period: float, octaves: int = 5) -> float:
    amp = 1.0
    freq = 1.0
    total = 0.0
    norm = 0.0
    for i in range(octaves):
        total += amp * vnoise(x * freq, y * freq, seed + i * 19, max(1.0, period * freq))
        norm += amp
        amp *= 0.52
        freq *= 2.0
    return total / norm


def clamp(v: float) -> int:
    return max(0, min(255, int(v)))


def mix(a: tuple[float, float, float], b: tuple[float, float, float], t: float) -> tuple[float, float, float]:
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)


def voronoi(x: float, y: float, cells: int, seed: int) -> tuple[float, float]:
    gx, gy = x * cells, y * cells
    ix, iy = math.floor(gx), math.floor(gy)
    best = 9.0
    second = 9.0
    for oy in (-1, 0, 1):
        for ox in (-1, 0, 1):
            cx = (ix + ox) % cells
            cy = (iy + oy) % cells
            px = cx + hash2(cx, cy, seed)
            py = cy + hash2(cx, cy, seed + 91)
            if ox < 0:
                px -= cells
            elif ox > 0:
                px += cells
            if oy < 0:
                py -= cells
            elif oy > 0:
                py += cells
            d = math.hypot(gx - px, gy - py)
            if d < best:
                second = best
                best = d
            elif d < second:
                second = d
    return best, second - best


def save(name: str, pixels: list[int], size: tuple[int, int] = (SIZE, SIZE)) -> None:
    path = ROOT / name
    img = Image.frombytes("RGB", size, bytes(pixels))
    img.save(path, "JPEG", quality=84, optimize=True)
    print(f"{path.name} {img.size} {path.stat().st_size // 1024}k")


def basalt() -> None:
    pixels: list[int] = []
    for y in range(SIZE):
        for x in range(SIZE):
            u, v = x / SIZE, y / SIZE
            d, edge = voronoi(u, v, 11, 7)
            n = fbm(u * 18, v * 18, 3, 18, 5)
            crack = 1.0 - min(1.0, edge * 3.4)
            grain = fbm(u * 48, v * 48, 11, 48, 3)
            tone = 42 + n * 38 + grain * 16 - crack * 22
            moss = max(0.0, fbm(u * 22, v * 22, 29, 22, 4) - 0.62) * 90
            r = tone + moss * 0.15
            g = tone + moss * 0.55
            b = tone + 4 - moss * 0.2
            pixels += [clamp(r), clamp(g), clamp(b)]
    save("summit-basalt-moss.jpg", pixels)


def alpine_moss() -> None:
    pixels: list[int] = []
    for y in range(SIZE):
        for x in range(SIZE):
            u, v = x / SIZE, y / SIZE
            n = fbm(u * 14, v * 14, 5, 14, 6)
            tuft = fbm(u * 36, v * 36, 41, 36, 4)
            rock = max(0.0, fbm(u * 20, v * 20, 17, 20, 3) - 0.72)
            soil = 0.28 + n * 0.35
            green = 0.22 + tuft * 0.38
            r = 38 + soil * 40 + green * 18 + rock * 90
            g = 48 + soil * 22 + green * 110 - rock * 10
            b = 28 + soil * 16 + green * 28 + rock * 70
            pixels += [clamp(r), clamp(g), clamp(b)]
    save("summit-moss-ground.jpg", pixels)


def bark() -> None:
    pixels: list[int] = []
    for y in range(SIZE):
        for x in range(SIZE):
            u, v = x / SIZE, y / SIZE
            ridge = fbm(u * 22 + fbm(u * 6, v * 2, 8, 8, 3) * 2.2, v * 3.2, 13, 22, 5)
            knot = max(0.0, 0.78 - abs(fbm(u * 9, v * 9, 21, 9, 3) - 0.5) * 4)
            groove = abs(math.sin((u + ridge * 0.18) * math.pi * 16))
            tone = 58 + ridge * 46 - groove * 18 + knot * 24
            pixels += [clamp(tone + 18), clamp(tone * 0.72), clamp(tone * 0.42)]
    save("summit-bark.jpg", pixels)


def canopy() -> None:
    pixels: list[int] = []
    for y in range(SIZE):
        for x in range(SIZE):
            u, v = x / SIZE, y / SIZE
            n = fbm(u * 16, v * 16, 33, 16, 5)
            vein = abs(math.sin((u * 9 + n) * math.pi * 2) * math.cos((v * 7 - n) * math.pi * 2))
            glow = max(0.0, n - 0.45)
            r = 48 + n * 90 + glow * 120 + vein * 20
            g = 8 + n * 18 + glow * 22
            b = 14 + n * 28 + glow * 36
            pixels += [clamp(r), clamp(g), clamp(b)]
    save("summit-canopy.jpg", pixels)


def lave_earth() -> None:
    pixels: list[int] = []
    for y in range(SIZE):
        for x in range(SIZE):
            u, v = x / SIZE, y / SIZE
            n = fbm(u * 10, v * 10, 2, 10, 6)
            d, edge = voronoi(u, v, 8, 15)
            crack = 1.0 - min(1.0, edge * 4.2)
            ember = max(0.0, 0.22 - edge) * 8
            scorched = max(0.0, n - 0.62)
            r = 92 + n * 70 - crack * 40 + ember * 90 - scorched * 30
            g = 48 + n * 28 - crack * 28 + ember * 18 - scorched * 22
            b = 28 + n * 12 - crack * 16 + ember * 4
            pixels += [clamp(r), clamp(g), clamp(b)]
    save("lave-earth.jpg", pixels)


def lave_rock() -> None:
    pixels: list[int] = []
    for y in range(SIZE):
        for x in range(SIZE):
            u, v = x / SIZE, y / SIZE
            n = fbm(u * 16, v * 16, 44, 16, 5)
            pore = 1.0 if fbm(u * 40, v * 40, 55, 40, 3) > 0.78 else 0.0
            d, edge = voronoi(u, v, 7, 61)
            face = 28 + n * 36 - edge * 10 - pore * 18
            heat = max(0.0, fbm(u * 12, v * 12, 70, 12, 3) - 0.58)
            r = face + heat * 110
            g = face * 0.7 + heat * 28
            b = face * 0.55
            pixels += [clamp(r), clamp(g), clamp(b)]
    save("lave-rock.jpg", pixels)


def lave_sky() -> None:
    pixels: list[int] = []
    for y in range(SKY_H):
        for x in range(SKY_W):
            u, v = x / SKY_W, y / SKY_H
            elev = 1.0 - v
            n = fbm(u * 6, v * 4, 90, 6, 5)
            storm = fbm(u * 3 + 0.2, v * 2.4, 99, 3, 4)
            glow = math.exp(-((v - 0.62) ** 2) * 18) * (0.55 + n * 0.45)
            r = 18 + elev * 28 + storm * 90 + glow * 180
            g = 6 + elev * 8 + storm * 22 + glow * 70
            b = 8 + elev * 18 + storm * 10 + glow * 12
            pixels += [clamp(r), clamp(g), clamp(b)]
    save("lave-sky.jpg", pixels, (SKY_W, SKY_H))


if __name__ == "__main__":
    ROOT.mkdir(parents=True, exist_ok=True)
    basalt()
    alpine_moss()
    bark()
    canopy()
    lave_earth()
    lave_rock()
    lave_sky()

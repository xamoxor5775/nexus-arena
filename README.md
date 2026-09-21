# NEXUS ARENA

[![CI](https://github.com/xamoxor5775/nexus-arena/actions/workflows/ci.yml/badge.svg)](https://github.com/xamoxor5775/nexus-arena/actions/workflows/ci.yml)

Deathmatch FPS en el navegador. Pozo industrial, cielo rojo, cinco armas, bots y poderes flotantes.

El primero en el límite de frags se queda The Crucible.

## Jugar

- **WASD** mover · **Mouse** apuntar
- **Click** disparar · **Espacio** saltar
- **Shift** sprint · **C** agachar
- **1–5** armas · **R** recargar · **Tab** marcador
- Pads cian te lanzan. Torpedo a los pies = rocket jump.
- Iconos flotantes: **VELOCIDAD**, **FASE**, **MEGAVATIO**

## Local

```bash
npm install
npm run dev
```

Abre `http://localhost:8080`.

```bash
npm run build
npm run preview
```

## CI

Cada push a `main` y cada pull request corre typecheck, tests y build en GitHub Actions.

```bash
npm run typecheck
npm run test:app
npm run build
```

## Stack

Three.js · React · TanStack Start · Vite · Tailwind v4

## Cuenta

[xamoxor5775/nexus-arena](https://github.com/xamoxor5775/nexus-arena)

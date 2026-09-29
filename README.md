# NEXUS ARENA

[![CI](https://github.com/xamoxor5775/nexus-arena/actions/workflows/ci.yml/badge.svg)](https://github.com/xamoxor5775/nexus-arena/actions/workflows/ci.yml)

Deathmatch FPS en el navegador. Pozo industrial, cielo rojo, cinco armas, bots y poderes flotantes.

El primero en el límite de frags se queda The Crucible.

## Jugar

- **WASD** mover · **Mouse** apuntar
- **Click** disparar · **Espacio** saltar
- **Click derecho** zoom · **G** granada de píxeles · **B** armería
- **Shift** sprint · **C** agachar
- **1–5** armas · **R** recargar · **Tab** marcador
- Pads cian te lanzan. Torpedo a los pies = rocket jump.
- Iconos flotantes: **VELOCIDAD**, **FASE**, **MEGAVATIO**
- Headshots hacen daño crítico; botiquines y armadura sostienen la ronda.

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

## Docker

Requiere Docker Engine y Docker Compose v2:

```bash
cp .env.example .env
./start-docker.sh
```

La aplicación quedará disponible en `http://localhost:8080`. Para detenerla:

```bash
docker compose down
```

El contenedor se reinicia automáticamente si el proceso falla o si el servidor
se reinicia. Para datos persistentes en producción, configura `DATABASE_URL` en
`.env` con una conexión PostgreSQL/Neon antes de ejecutar `start-docker.sh`.

## Acceso de pago con Flow

El landing usa un pago único de $1.000 CLP mediante `/payment/create`. Flow
confirma la orden en `/api/flow/confirmation` y redirige al jugador por
`/api/flow/return`. Solo una orden con estado pagado activa el acceso.

El servidor genera una llave firmada válida durante 30 días, la almacena solo
como hash y la entrega una vez al comprador para que la guarde. La arena y el
señalizador WebRTC rechazan solicitudes sin esa llave vigente.

Configura en el `.env` del servidor `FLOW_API_KEY`, `FLOW_SECRET_KEY`,
`NEXUS_ACCESS_SECRET`, `NEXUS_PUBLIC_URL`, `FLOW_AMOUNT_CLP` y
`FLOW_PAYMENT_METHOD`. Los callbacks públicos son:

`http://23.23.152.63:8080/api/flow/confirmation`

`http://23.23.152.63:8080/api/flow/return`

Las claves de Flow nunca deben quedar en Git ni en el HTML.
El multiplayer actual usa señalización WebRTC dentro del proceso del contenedor;
para escalar a varias instancias habrá que mover esa señalización a Redis o a un
servicio dedicado.

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

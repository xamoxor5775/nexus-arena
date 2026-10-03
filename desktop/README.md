# Nexus Arena Desktop v0.1.0

Primera integracion de escritorio para el juego existente. Windows x64 es el objetivo inicial.
No cambia la compilacion web, el motor, las arenas ni el package-lock.json de la raiz.

## Abrir desde el codigo fuente

En una terminal de Windows, desde la raiz del repositorio:

```powershell
git fetch origin
git switch desktop/windows-electron
npm --prefix desktop install
npm --prefix desktop start
```

Requiere Node.js 22.12 o posterior; se recomienda Node.js 24 LTS para igualar el workflow.
La primera instalacion descarga las dependencias. No hace falta instalar Node.js para jugar
con el ejecutable ya empaquetado. No ejecutar npm ci en desktop hasta tener su package-lock.json.

## Crear el instalador y el ZIP de Windows

```powershell
npm --prefix desktop run dist:win
```

Salidas configuradas:

- `desktop/release/Nexus-Arena-0.1.0-windows-x64.exe`: instalador NSIS.
- `desktop/release/Nexus-Arena-0.1.0-windows-x64.zip`: aplicacion portable; extraer completa.
- `desktop/release/win-unpacked/Nexus Arena.exe`: ejecutable con sus archivos adyacentes.

No distribuir solamente el .exe de win-unpacked: necesita sus recursos y bibliotecas.
`npm --prefix desktop run pack:win` genera la carpeta sin el instalador.
El instalador inicial no tiene firma digital ni un icono propio aprobado.
No desactives el antivirus o protecciones del sistema para ejecutarlo; verifica el origen del build.

## Pruebas

```powershell
npm --prefix desktop test
npm --prefix desktop run build
npm --prefix desktop run smoke
```

Las pruebas de Node verifican rutas, origen, configuracion y preparacion de fuentes con fixtures.
No sustituyen una partida real. El smoke test de Electron crea un perfil temporal y comprueba
el puente aislado, dibujo WebGL, texturas locales, Pozo/Reactor, inicio de partida y pausa.
La prueba usa renderizado por software solo para CI; la aplicacion normal conserva la GPU.

El workflow `.github/workflows/desktop-windows.yml` construye en Windows y prueba el ejecutable
empaquetado antes de subir el artefacto `Nexus-Arena-Windows-x64`. No publica releases ni sube a Steam.
Incluye el package-lock.json generado: debe incorporarse al repositorio tras revisar la primera
instalacion. Hasta entonces, las dependencias transitivas no estan totalmente fijadas.

Antes de distribuir: probar arranque sin internet en otro PC; ambos mapas; mouse y sensibilidad;
F11 y Alt+Enter; Escape; Alt+Tab; audio; resoluciones; cerrar y reabrir para verificar ajustes y record.

## Controles y datos

F11 o Alt+Enter alternan pantalla completa. La barra de escritorio ofrece pantalla completa y salir,
y desaparece durante la partida. Al perder foco se pausa. Cerrar pide confirmacion.

Windows guarda los datos en `%APPDATA%\\NexusArena`:

- Ajustes, mapa y record: almacenamiento local de Chromium para `nexus://app`.
- Posicion, tamano y modo de ventana: `window.json`.
- Diagnosticos: `desktop.log`.

Se conservan entre versiones si se mantiene el mismo perfil. No se importa automaticamente el
almacenamiento de la version del navegador. No se guarda la partida en curso ni hay Steam Cloud.
El ZIP portable tambien usa este perfil; no guarda datos junto al ejecutable.

## Arquitectura

`prepare.mjs` copia `src/game`, `src/components/nexus-app.tsx` y `public/textures` a `.generated`.
Prepara una copia del CSS sin Google Fonts y con fuentes de sistema como fallback. Puede variar
ligeramente la tipografia; el CSS web original permanece intacto. No se incluyen fuentes externas.
Agrega avisos de las bibliotecas incluidas y un hash del snapshot en `build-info.json`.

Vite genera una entrada React exclusiva para escritorio, sin TanStack Start, Nitro, Vercel,
autenticacion web ni migraciones de base de datos. Electron sirve `dist` por `nexus://app`, sin
servidor localhost y sin depender de una web publicada. El origen estable admite rutas absolutas
como `/textures/wall.png` y almacenamiento persistente.

El renderer no tiene acceso a Node.js, usa sandbox y contextIsolation. El preload expone operaciones
concretas. El proceso principal valida el emisor IPC, bloquea navegacion/ventanas externas y rechaza
rutas fuera del bundle, incluidos enlaces simbolicos. CSP y filtros de red bloquean recursos remotos.
Esta configuracion offline tendra que revisarse antes de incorporar multijugador.

Editar siempre los archivos canonicos en `src/`, nunca `.generated`. Volver a ejecutar start/build
para incluir cambios. Las dependencias del juego se mantienen separadas en desktop/package.json;
actualizarlas junto con las de la web cuando corresponda. Los comandos npm de la raiz no cambian.

## Alcance y pendientes

Es una base de escritorio, no una publicacion comercial aprobada. Reutiliza los bots y mapas actuales.
No agrega multijugador, logros, overlay, Steamworks ni Steam Cloud. No crea una ficha de Steam.
La carpeta win-unpacked es el punto de partida para un futuro depot de Steam, tras validar el juego.
Revisar derechos de todos los recursos y las licencias originales antes de distribuir comercialmente.

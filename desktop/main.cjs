"use strict";
const { app, BrowserWindow, dialog, ipcMain, Menu, protocol, screen, session } = require("electron");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { ENTRY_URL, CSP, MIME, isTrustedUrl, isInside, resolveAssetPath, sanitizeWindowState } = require("./runtime.cjs");

const smokeTest = process.argv.includes("--smoke-test");
app.setName("Nexus Arena");
const profile = smokeTest
  ? fs.mkdtempSync(path.join(app.getPath("temp"), "nexus-arena-test-"))
  : path.join(app.getPath("appData"), "NexusArena");
fs.mkdirSync(profile, { recursive: true });
app.setPath("userData", profile);
const stateFile = path.join(profile, "window.json");
const logFile = path.join(profile, "desktop.log");
const bundleRoot = path.join(__dirname, "dist");
let win;
let closing = false;

function log(message) {
  const line = `${new Date().toISOString()} ${message}\n`;
  console.log(line.trim());
  try {
    if (fs.existsSync(logFile) && fs.statSync(logFile).size > 2_000_000) fs.writeFileSync(logFile, "");
    fs.appendFileSync(logFile, line);
  } catch { /* A read-only profile must not hide the original error. */ }
}

protocol.registerSchemesAsPrivileged([{ scheme: "nexus", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

function readState() {
  try { return sanitizeWindowState(JSON.parse(fs.readFileSync(stateFile, "utf8"))); }
  catch { return sanitizeWindowState(null); }
}
function saveState() {
  if (!win || win.isDestroyed()) return;
  try {
    const state = { ...win.getNormalBounds(), fullscreen: win.isFullScreen(), maximized: win.isMaximized() };
    fs.writeFileSync(`${stateFile}.tmp`, JSON.stringify(state));
    fs.renameSync(`${stateFile}.tmp`, stateFile);
  } catch (error) { log(`Window state: ${error.message}`); }
}
function authorized(event) {
  return win && !win.isDestroyed() && event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame && isTrustedUrl(event.senderFrame.url);
}

async function serveAsset(request) {
  const headers = { "Content-Security-Policy": CSP, "X-Content-Type-Options": "nosniff" };
  if (!["GET", "HEAD"].includes(request.method)) return new Response("Method not allowed", { status: 405, headers });
  const filename = resolveAssetPath(bundleRoot, request.url);
  if (!filename) return new Response("Forbidden", { status: 403, headers });
  try {
    const [root, real] = await Promise.all([fsp.realpath(bundleRoot), fsp.realpath(filename)]);
    if (!isInside(root, real)) return new Response("Forbidden", { status: 403, headers });
    if (!(await fsp.stat(real)).isFile()) return new Response("Not found", { status: 404, headers });
    headers["Content-Type"] = MIME[path.extname(real).toLowerCase()] || "application/octet-stream";
    return new Response(request.method === "HEAD" ? null : await fsp.readFile(real), { headers });
  } catch (error) {
    log(`Asset unavailable: ${new URL(request.url).pathname} (${error.code || "error"})`);
    return new Response("Not found", { status: 404, headers });
  }
}

function configureSession() {
  const ses = session.defaultSession;
  protocol.handle("nexus", serveAsset);
  const allow = (contents, permission, origin) => contents === win?.webContents && isTrustedUrl(origin) && ["pointerLock", "fullscreen"].includes(permission);
  ses.setPermissionRequestHandler((contents, permission, callback, details) => callback(allow(contents, permission, details.requestingUrl || contents?.getURL())));
  ses.setPermissionCheckHandler((contents, permission, origin) => allow(contents, permission, origin));
  ses.setDevicePermissionHandler(() => false);
  ses.on("will-download", (event) => event.preventDefault());
  // Desktop v0.1 is deliberately offline. No hosted pages, analytics or web APIs.
  ses.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] }, (_details, callback) => callback({ cancel: true }));
}

async function createWindow() {
  const state = readState();
  const primary = screen.getPrimaryDisplay().workArea;
  state.width = Math.min(state.width, primary.width);
  state.height = Math.min(state.height, primary.height);
  const visible = screen.getAllDisplays().some(({ workArea: area }) => state.x !== undefined && state.y !== undefined && state.x + state.width > area.x + 80 && state.y + state.height > area.y + 80 && state.x < area.x + area.width - 80 && state.y < area.y + area.height - 80);
  if (!visible) { delete state.x; delete state.y; }
  win = new BrowserWindow({
    title: "Nexus Arena",
    width: state.width, height: state.height, x: state.x, y: state.y,
    minWidth: Math.min(800, primary.width), minHeight: Math.min(600, primary.height),
    show: false, backgroundColor: "#08090c", autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false, contextIsolation: true, sandbox: true,
      webSecurity: true, allowRunningInsecureContent: false,
      webviewTag: false, spellcheck: false, backgroundThrottling: !smokeTest,
      devTools: !app.isPackaged,
    },
  });
  if (!smokeTest && state.maximized) win.maximize();
  if (!smokeTest && state.fullscreen) win.setFullScreen(true);
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, url) => { if (!isTrustedUrl(url)) event.preventDefault(); });
  win.webContents.on("will-attach-webview", (event) => event.preventDefault());
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown" || input.isAutoRepeat) return;
    if (input.key === "F11" || (input.alt && input.key === "Enter")) {
      event.preventDefault();
      win.setFullScreen(!win.isFullScreen());
    }
  });
  win.webContents.on("render-process-gone", (_event, details) => {
    log(`Renderer stopped: ${details.reason}`);
    if (smokeTest) app.exit(1);
    else dialog.showErrorBox("Nexus Arena", "El proceso grafico se cerro. Reabre el juego y revisa desktop.log.");
  });
  win.webContents.on("console-message", (_event, details) => {
    if (details.level === "error" || details.level === "warning" || details.level >= 2) log(`Renderer: ${details.message}`);
  });
  win.on("blur", () => { if (!win.isDestroyed()) win.webContents.send("desktop:pause"); });
  win.on("close", (event) => {
    if (!closing && !smokeTest) {
      event.preventDefault();
      win.webContents.send("desktop:pause");
      const choice = dialog.showMessageBoxSync(win, {
        type: "question", title: "Nexus Arena", message: "Cerrar Nexus Arena?",
        detail: "Los ajustes y el record se conservan. La partida actual no se guarda.",
        buttons: ["Seguir jugando", "Salir"], defaultId: 0, cancelId: 0,
      });
      if (choice !== 1) return;
      closing = true;
      saveState();
      win.close();
      return;
    }
    saveState();
  });
  win.once("closed", () => { win = null; });
  win.once("ready-to-show", () => { if (!smokeTest) win.show(); });
  await win.loadURL(ENTRY_URL);
  if (smokeTest) {
    try {
      const result = await require("./smoke.cjs").runSmokeTest(win);
      log(`SMOKE PASS ${JSON.stringify(result)}`);
      app.exit(0);
    } catch (error) { log(`SMOKE FAIL ${error.stack || error}`); app.exit(1); }
  } else if (!win.isVisible()) win.show();
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    if (win && !win.isDestroyed()) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
  });
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    configureSession();
    ipcMain.handle("desktop:fullscreen", (event) => {
      if (!authorized(event)) throw new Error("Untrusted caller");
      const fullscreen = !win.isFullScreen();
      win.setFullScreen(fullscreen);
      return fullscreen;
    });
    ipcMain.handle("desktop:quit", (event) => {
      if (!authorized(event)) throw new Error("Untrusted caller");
      win.close();
    });
    await createWindow();
  }).catch((error) => {
    log(error.stack || String(error));
    if (!smokeTest) dialog.showErrorBox("Nexus Arena", `No se pudo iniciar el juego.\n${error.message}`);
    app.exit(1);
  });
  app.on("before-quit", () => session.defaultSession.flushStorageData());
  app.on("window-all-closed", () => app.quit());
}

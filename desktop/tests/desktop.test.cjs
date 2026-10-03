"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const os = require("node:os");
const { pathToFileURL } = require("node:url");
const { CSP, isTrustedUrl, isInside, resolveAssetPath, sanitizeWindowState } = require("../runtime.cjs");
const desktopRoot = path.resolve(__dirname, "..");

for (const url of ["nexus://app/", "nexus://app/index.html", "nexus://app/textures/wall.png?x=1"]) {
  test(`trusted origin: ${url}`, () => assert.equal(isTrustedUrl(url), true));
}
for (const url of ["https://app/index.html", "file:///tmp/index.html", "nexus://app.evil/", "nexus://user@app/", "nexus://app:8080/", "not a URL"]) {
  test(`reject origin: ${url}`, () => assert.equal(isTrustedUrl(url), false));
}
for (const paths of [path.posix, path.win32]) {
  const root = paths === path.win32 ? "C:\\Games\\Nexus Arena\\dist" : "/games/nexus/dist";
  test(`local asset mapping (${paths.sep})`, () => {
    assert.equal(resolveAssetPath(root, "nexus://app/", paths), paths.join(root, "index.html"));
    assert.equal(resolveAssetPath(root, "nexus://app/textures/wall.png?v=1", paths), paths.join(root, "textures", "wall.png"));
    assert.equal(resolveAssetPath(root, "nexus://app/textures/my%20texture.png", paths), paths.join(root, "textures", "my texture.png"));
  });
  for (const pathname of ["/%2e%2e%2fsecret", "/textures/%2e%2e%2f%2e%2e%2fsecret", "/%5c..%5csecret", "/C:%5cWindows%5cfile", "/%00file", "/%ZZ", "/%252e%252e%252fsecret", "/file.txt:stream"]) {
    test(`reject unsafe path (${paths.sep}): ${pathname}`, () => assert.equal(resolveAssetPath(root, `nexus://app${pathname}`, paths), null));
  }
  test(`containment does not accept a sibling (${paths.sep})`, () => {
    assert.equal(isInside(root, `${root}-other/file`, paths), false);
    assert.equal(isInside(root, root, paths), false);
    assert.equal(isInside(root, paths.join(root, "x.png"), paths), true);
  });
}
test("window state defaults and invalid values", () => {
  assert.deepEqual(sanitizeWindowState(null), { width: 1280, height: 800, fullscreen: false, maximized: false });
  assert.deepEqual(sanitizeWindowState({ width: Infinity, height: -1, fullscreen: "yes", x: "0", y: 2 }), sanitizeWindowState(null));
});
test("valid window state including negative monitor coordinates", () => {
  assert.deepEqual(sanitizeWindowState({ width: 1920, height: 1080, x: -1920, y: 0, fullscreen: true, maximized: true }), { width: 1920, height: 1080, x: -1920, y: 0, fullscreen: true, maximized: true });
});
test("CSP forbids remote scripts, frames, objects and form submission", () => {
  assert.ok(CSP.includes("script-src 'self'"));
  assert.ok(CSP.includes("object-src 'none'"));
  assert.ok(CSP.includes("frame-ancestors 'none'"));
  assert.ok(CSP.includes("form-action 'none'"));
  assert.ok(!CSP.includes("unsafe-eval"));
});
test("offline CSS removes Google Fonts and includes explicit Tailwind scanning", async () => {
  const { offlineStyles } = await import(pathToFileURL(path.join(desktopRoot, "scripts/prepare.mjs")));
  const css = offlineStyles('@import url("https://fonts.googleapis.com/css2?family=Example&display=swap");\n@import "tailwindcss";\n.a { background:url("/textures/wall.png") }');
  assert.ok(!css.includes("googleapis"));
  assert.ok(css.includes('@source "./"'));
  assert.ok(css.includes('/textures/wall.png'));
  assert.throws(() => offlineStyles('@import "https://example.com/style.css";'), /remote resource/);
});
test("prepare copies game and textures without mutating web source", async () => {
  const { prepare } = await import(pathToFileURL(path.join(desktopRoot, "scripts/prepare.mjs")));
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), "nexus-desktop-fixture-"));
  try {
    for (const dir of ["src/game", "src/components", "public/textures/reactor", "desktop"]) await fs.mkdir(path.join(repo, dir), { recursive: true });
    const source = '@import "tailwindcss";\n:root { color: white; }';
    await fs.writeFile(path.join(repo, "src/styles.css"), source);
    await fs.writeFile(path.join(repo, "src/game/engine.ts"), "export class NexusArena {}\n");
    await fs.writeFile(path.join(repo, "src/components/nexus-app.tsx"), "export const NexusApp = () => null;\n");
    await fs.writeFile(path.join(repo, "public/textures/wall.png"), "fixture");
    await fs.writeFile(path.join(repo, "public/textures/reactor/floor.png"), "fixture");
    const out = await prepare(repo, path.join(repo, "desktop"));
    assert.equal(await fs.readFile(path.join(repo, "src/styles.css"), "utf8"), source);
    assert.equal(await fs.readFile(path.join(out, "public/textures/reactor/floor.png"), "utf8"), "fixture");
    assert.ok((await fs.readFile(path.join(out, "src/styles.css"), "utf8")).includes("@source"));
    const first = JSON.parse(await fs.readFile(path.join(out, "public/build-info.json"), "utf8"));
    await prepare(repo, path.join(repo, "desktop"));
    const second = JSON.parse(await fs.readFile(path.join(out, "public/build-info.json"), "utf8"));
    assert.equal(first.sourceSHA256, second.sourceSHA256);
  } finally { await fs.rm(repo, { recursive: true, force: true }); }
});
test("packaging includes only desktop runtime and compiled game", async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(desktopRoot, "package.json"), "utf8"));
  for (const entry of ["main.cjs", "preload.cjs", "runtime.cjs", "smoke.cjs"]) {
    assert.ok(pkg.build.files.includes(entry));
    await fs.access(path.join(desktopRoot, entry));
  }
  assert.equal(pkg.build.asar, true);
  assert.ok(pkg.scripts["dist:win"].includes("--publish never"));
  assert.ok(!pkg.build.files.some((entry) => entry.includes("../")));
});

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEXTURE_DIR = join(ROOT, "public", "textures");
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const REFS = /\/textures\/[A-Za-z0-9._-]+\.jpg/g;

function collectReferencedTextures() {
  const found = new Set();
  const scan = (dir) => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, name.name);
      if (name.isDirectory()) {
        if (name.name === "node_modules" || name.name === "dist" || name.name === ".output") continue;
        scan(path);
        continue;
      }
      if (!/\.(ts|tsx|css|mjs|js)$/.test(name.name)) continue;
      const text = readFileSync(path, "utf8");
      for (const match of text.matchAll(REFS)) found.add(match[0].slice("/textures/".length));
    }
  };
  scan(join(ROOT, "src"));
  scan(join(ROOT, "scripts"));
  return [...found].sort();
}

test("every /textures/*.jpg reference has a JPEG on disk", () => {
  const names = collectReferencedTextures();
  assert.ok(names.length >= 16, `expected the arena maps, got ${names.join(", ")}`);
  for (const name of names) {
    const path = join(TEXTURE_DIR, name);
    assert.equal(extname(name), ".jpg");
    assert.ok(existsSync(path), `missing public/textures/${name}`);
    const buf = readFileSync(path);
    assert.ok(buf.length > 4 * 1024, `${name} is too small to be a real map`);
    assert.ok(buf.subarray(0, 3).equals(JPEG_MAGIC), `${name} is not a JPEG`);
    assert.ok(statSync(path).size < 800 * 1024, `${name} is unexpectedly large`);
  }
});

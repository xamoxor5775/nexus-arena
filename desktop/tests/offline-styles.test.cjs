"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const moduleUrl = pathToFileURL(path.join(__dirname, "../scripts/prepare.mjs"));

for (const quote of ['"', "'", ""]) {
  test(`Google Fonts weight-list semicolons are removed completely (${quote || "unquoted"})`, async () => {
    const { offlineStyles } = await import(moduleUrl);
    const url = "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600&family=IBM+Plex+Sans:wght@400;500;600&family=Rajdhani:wght@600;700&display=swap";
    const local = '@import "tailwindcss";\n@theme { --color-bg: #08090c; }';
    assert.equal(offlineStyles(`@import url(${quote}${url}${quote});\n${local}`), offlineStyles(local));
  });
}

test("local textures survive font removal and external CSS is rejected", async () => {
  const { offlineStyles } = await import(moduleUrl);
  const css = '@import "tailwindcss";\n.wall { background-image: url("/textures/wall.png"); }';
  assert.ok(offlineStyles(css).includes('/textures/wall.png'));
  assert.throws(() => offlineStyles('@import "https://example.com/theme.css";'), /remote resource/);
});

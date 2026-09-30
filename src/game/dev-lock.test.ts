import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS } from "./constants.ts";
import { lockSettings, patchLocked, persistable, unlockSettings } from "./dev-lock.ts";
import type { Settings } from "./types.ts";

const base: Settings = { ...DEFAULT_SETTINGS, name: "Tester", arena: "cumbre", mode: "duel" };

describe("dev room arena lock", () => {
  it("forces the server arena in deathmatch whatever the player picked", () => {
    for (const [arena, mode] of [["cumbre", "duel"], ["luna", "ctf"], ["mar", "dm"], ["pozo", "dm"]] as const) {
      const { settings, lock } = lockSettings({ ...base, arena, mode }, "pozo", null);
      assert.equal(settings.arena, "pozo");
      assert.equal(settings.mode, "dm");
      assert.deepEqual(lock.saved, { arena, mode });
    }
  });

  it("ignores arena/mode changes while locked but keeps other settings", () => {
    const { settings, lock } = lockSettings(base, "pozo", null);
    const next = patchLocked(settings, { arena: "lave", mode: "ctf", fov: 95, name: "Otro" }, lock);
    assert.equal(next.arena, "pozo");
    assert.equal(next.mode, "dm");
    assert.equal(next.fov, 95);
    assert.equal(next.name, "Otro");
  });

  it("persists the player's own pick, never the forced arena", () => {
    const { settings, lock } = lockSettings(base, "pozo", null);
    const saved = persistable(patchLocked(settings, { volume: 0.3 }, lock), lock);
    assert.equal(saved.arena, "cumbre");
    assert.equal(saved.mode, "duel");
    assert.equal(saved.volume, 0.3);
  });

  it("re-locking to another arena keeps the original pick; unlock restores it", () => {
    const first = lockSettings(base, "pozo", null);
    const second = lockSettings(first.settings, "mar", first.lock);
    assert.equal(second.settings.arena, "mar");
    assert.deepEqual(second.lock.saved, { arena: "cumbre", mode: "duel" });
    const back = unlockSettings(second.settings, second.lock);
    assert.equal(back.arena, "cumbre");
    assert.equal(back.mode, "duel");
  });

  it("normal players (no lock) patch and persist as before", () => {
    const next = patchLocked(base, { arena: "lave", mode: "dm" }, null);
    assert.equal(next.arena, "lave");
    assert.equal(next.mode, "dm");
    assert.deepEqual(persistable(next, null), next);
  });
});

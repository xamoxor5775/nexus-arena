import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS } from "./constants.ts";
import { lockSettings, patchLocked, persistable, unlockSettings } from "./dev-lock.ts";
import { DEMO_ARENA, DEMO_MAX_PLAYS, DEMO_MODE, DEMO_PLAYS_KEY, DEMO_SECONDS, canStartDemo, demoPlays, demoSecondsLeft, formatDemoClock, recordDemoPlay } from "./demo.ts";
import type { Settings } from "./types.ts";

function mem(init: Record<string, string> = {}) {
  const data = new Map(Object.entries(init));
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
}

describe("demo timer", () => {
  it("is a 60 second demo in pozo deathmatch", () => {
    assert.equal(DEMO_SECONDS, 60);
    assert.equal(DEMO_ARENA, "pozo");
    assert.equal(DEMO_MODE, "dm");
  });
  it("counts down from the start and clamps at 0", () => {
    const t0 = 1_000_000;
    assert.equal(demoSecondsLeft(null, t0), 60);
    assert.equal(demoSecondsLeft(t0, t0), 60);
    assert.equal(demoSecondsLeft(t0, t0 + 1), 60);
    assert.equal(demoSecondsLeft(t0, t0 + 1000), 59);
    assert.equal(demoSecondsLeft(t0, t0 + 59_001), 1);
    assert.equal(demoSecondsLeft(t0, t0 + 60_000), 0);
    assert.equal(demoSecondsLeft(t0, t0 + 3_600_000), 0);
    assert.equal(demoSecondsLeft(t0, t0 - 5000), 60, "clock skew never adds time");
  });
  it("formats the clock", () => {
    assert.equal(formatDemoClock(60), "1:00");
    assert.equal(formatDemoClock(59), "0:59");
    assert.equal(formatDemoClock(5), "0:05");
    assert.equal(formatDemoClock(-3), "0:00");
  });
});

describe("demo play counter", () => {
  it("allows DEMO_MAX_PLAYS demos then blocks", () => {
    const s = mem();
    for (let i = 1; i <= DEMO_MAX_PLAYS; i++) {
      assert.equal(canStartDemo(s), true);
      assert.equal(recordDemoPlay(s), i);
    }
    assert.equal(canStartDemo(s), false);
    assert.equal(s.data.get(DEMO_PLAYS_KEY), String(DEMO_MAX_PLAYS));
  });
  it("treats garbage / missing / throwing storage as zero plays", () => {
    assert.equal(demoPlays(mem({ [DEMO_PLAYS_KEY]: "abc" })), 0);
    assert.equal(demoPlays(mem({ [DEMO_PLAYS_KEY]: "-4" })), 0);
    assert.equal(demoPlays(null), 0);
    const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
    assert.equal(canStartDemo(broken), true);
    assert.equal(recordDemoPlay(broken), 1);
  });
});

describe("demo arena lock", () => {
  const base: Settings = { ...DEFAULT_SETTINGS, name: "Tester", arena: "mar", mode: "duel" };
  it("locks pozo dm, ignores arena/mode picks, and never persists the forced arena", () => {
    const { settings, lock } = lockSettings(base, DEMO_ARENA, null);
    assert.equal(settings.arena, "pozo");
    assert.equal(settings.mode, "dm");
    const patched = patchLocked(settings, { arena: "luna", mode: "ctf", volume: 0.3 }, lock);
    assert.equal(patched.arena, "pozo");
    assert.equal(patched.mode, "dm");
    assert.equal(patched.volume, 0.3);
    assert.equal(persistable(patched, lock).arena, "mar");
    assert.equal(unlockSettings(patched, lock).mode, "duel");
  });
});

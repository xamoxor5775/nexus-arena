import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { SIGNAL_CAP_PER_PEER, addSignal, leaveRoom, pollRoom, suggestRoom } from "./rtc.server.ts";

const rooms = () => (globalThis as { __nexusRtcRooms__?: Map<string, unknown> }).__nexusRtcRooms__!;

function join(room: string, peer: string) {
  return pollRoom(room, peer, peer, 0);
}

function hostOf(room: string, peer: string) {
  const r = join(room, peer);
  return r.full ? undefined : r.hostId;
}

describe("rtc signaling rooms", () => {
  beforeEach(() => rooms().clear());

  it("caps dm rooms at 8 and suggests the first overflow room", () => {
    for (let i = 0; i < 8; i++) assert.notEqual(join("nexus-pozo-dm", `p${i}`).full, true);
    const ninth = join("nexus-pozo-dm", "p8");
    assert.equal(ninth.full, true);
    assert.equal(ninth.full && ninth.suggestedRoom, "nexus-pozo-dm-2");
    assert.equal(ninth.full && ninth.capacity, 8);
    // The newcomer was not registered and nobody was kicked.
    const roster = join("nexus-pozo-dm", "p0");
    assert.equal(roster.peers.length, 8);
    assert.ok(!roster.peers.some((p) => p.id === "p8"));
    // Overflow room accepts it.
    const over = join("nexus-pozo-dm-2", "p8");
    assert.notEqual(over.full, true);
    assert.deepEqual(over.peers.map((p) => p.id), ["p8"]);
  });

  it("existing peers keep polling a full room", () => {
    for (let i = 0; i < 8; i++) join("nexus-mar-dm", `p${i}`);
    for (let i = 0; i < 8; i++) assert.notEqual(join("nexus-mar-dm", `p${i}`).full, true);
  });

  it("caps duel rooms at 2 and ctf at 8", () => {
    join("nexus-lave-duel", "a");
    join("nexus-lave-duel", "b");
    const third = join("nexus-lave-duel", "c");
    assert.equal(third.full && third.suggestedRoom, "nexus-lave-duel-2");
    for (let i = 0; i < 8; i++) join("nexus-luna-ctf", `c${i}`);
    const ctf = join("nexus-luna-ctf", "c8");
    assert.equal(ctf.full && ctf.suggestedRoom, "nexus-luna-ctf-2");
  });

  it("suggests the base room again when it frees up, skips full overflow rooms", () => {
    join("nexus-cumbre-duel", "a");
    join("nexus-cumbre-duel", "b");
    join("nexus-cumbre-duel-2", "c");
    join("nexus-cumbre-duel-2", "d");
    assert.equal(suggestRoom("nexus-cumbre-duel"), "nexus-cumbre-duel-3");
    leaveRoom("nexus-cumbre-duel", "a");
    assert.equal(suggestRoom("nexus-cumbre-duel-2"), "nexus-cumbre-duel");
  });

  it("returns no suggestion when every overflow room is full", () => {
    for (let n = 1; n <= 21; n++) {
      const room = n === 1 ? "nexus-pozo-duel" : `nexus-pozo-duel-${n}`;
      join(room, `${n}a`);
      join(room, `${n}b`);
    }
    const r = join("nexus-pozo-duel", "late");
    assert.equal(r.full, true);
    assert.equal(r.full && r.suggestedRoom, null);
  });

  it("reports the earliest-joined live peer as hostId", () => {
    join("nexus-luna-dm", "zeta");
    join("nexus-luna-dm", "alpha");
    assert.equal(hostOf("nexus-luna-dm", "alpha"), "zeta");
    leaveRoom("nexus-luna-dm", "zeta");
    assert.equal(hostOf("nexus-luna-dm", "alpha"), "alpha");
  });

  it("keeps enough signals for an 8-peer mesh and caps per recipient", () => {
    const peers = Array.from({ length: 8 }, (_, i) => `p${i}`);
    for (const p of peers) join("nexus-laberinto-dm", p);
    // Every pair exchanges offer/answer + 10 ICE candidates each way.
    for (const a of peers) {
      for (const b of peers) {
        if (a >= b) continue;
        addSignal("nexus-laberinto-dm", a, b, "offer", { sdp: a });
        addSignal("nexus-laberinto-dm", b, a, "answer", { sdp: b });
        for (let i = 0; i < 10; i++) {
          addSignal("nexus-laberinto-dm", a, b, "ice", i);
          addSignal("nexus-laberinto-dm", b, a, "ice", i);
        }
      }
    }
    for (const p of peers) {
      const got = join("nexus-laberinto-dm", p).signals;
      assert.equal(got.length, 7 * 11, `all signals delivered to ${p}`);
      assert.ok(got.some((s) => s.kind === "offer" || s.kind === "answer"));
    }
    for (let i = 0; i < SIGNAL_CAP_PER_PEER + 20; i++) addSignal("nexus-laberinto-dm", "p1", "p0", "ice", i);
    assert.equal(join("nexus-laberinto-dm", "p0").signals.length, SIGNAL_CAP_PER_PEER);
    assert.equal(join("nexus-laberinto-dm", "p7").signals.length, 7 * 11);
  });

  it("rejects non-public rooms", () => {
    const r = pollRoom("nexus-pozo-dm-99", "x", "x", 0);
    assert.deepEqual(r, { peers: [], signals: [] });
  });
});

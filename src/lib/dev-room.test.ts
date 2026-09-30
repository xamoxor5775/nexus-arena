import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_DEV_ROOM, devRoomConfig, parseDevRoom, parseDevSessions, routeRoom } from "./dev-room.ts";
import { addSignal, leaveRoom, pollRoom } from "./rtc.server.ts";

const rooms = () => (globalThis as { __nexusRtcRooms__?: Map<string, unknown> }).__nexusRtcRooms__!;
// Local fake ids only (never real tester sessions).
const DEV_A = "00000000-0000-4000-8000-00000000dev1";
const DEV_B = "00000000-0000-4000-8000-00000000dev2";
const config = devRoomConfig({ NEXUS_DEV_SESSIONS: `${DEV_A}, ${DEV_B}`, NEXUS_DEV_ROOM: "" });

/** What server/api/rtc.get.ts does: route, then poll. */
function poll(requested: string, sessionId: string | null, peer: string) {
  const route = routeRoom(requested, sessionId, config);
  if (!route.ok) return route;
  return { route, result: pollRoom(route.room, peer, peer, 0, { dev: route.dev }) };
}

describe("dev room env parsing", () => {
  it("parses comma-separated session ids, trimming and dropping junk", () => {
    assert.deepEqual([...parseDevSessions(" a-1 , ,b_2,bad id,c.d,")], ["a-1", "b_2"]);
    assert.equal(parseDevSessions(undefined).size, 0);
    assert.equal(parseDevSessions("").size, 0);
  });
  it("defaults the room and refuses public/invalid room ids", () => {
    assert.equal(parseDevRoom(undefined), DEFAULT_DEV_ROOM);
    assert.equal(parseDevRoom("  Nexus-Lab  "), "nexus-lab");
    assert.equal(parseDevRoom("nexus-pozo-dm"), DEFAULT_DEV_ROOM);
    assert.equal(parseDevRoom("nexus-pozo-dm-3"), DEFAULT_DEV_ROOM);
    assert.equal(parseDevRoom("bad room!"), DEFAULT_DEV_ROOM);
  });
  it("feature is off when NEXUS_DEV_SESSIONS is unset", () => {
    const off = devRoomConfig({});
    assert.equal(off.sessions.size, 0);
    assert.deepEqual(routeRoom("nexus-pozo-dm", DEV_A, off), { ok: true, room: "nexus-pozo-dm", dev: false });
    assert.equal(routeRoom(DEFAULT_DEV_ROOM, DEV_A, off).ok, false);
  });
});

describe("dev room routing", () => {
  beforeEach(() => rooms().clear());

  it("forces dev sessions into the dev room whatever they request", () => {
    const a = poll("nexus-pozo-dm", DEV_A, "a");
    const b = poll("nexus-luna-duel", DEV_B, "b");
    assert.ok("result" in a && "result" in b);
    assert.equal(b.route.room, DEFAULT_DEV_ROOM);
    assert.equal(b.result.full, undefined);
    assert.ok(!b.result.full && b.result.dev === true && b.result.room === DEFAULT_DEV_ROOM);
    assert.deepEqual(b.result.peers.map((p) => p.id).sort(), ["a", "b"]);
    assert.ok(!b.result.full && b.result.hostId === "a");
  });

  it("dev session is never capped even when the requested dm room is full", () => {
    for (let i = 0; i < 8; i++) assert.notEqual(pollRoom("nexus-pozo-dm", `p${i}`, "p", 0).full, true);
    assert.equal(pollRoom("nexus-pozo-dm", "p8", "p", 0).full, true);
    const dev = poll("nexus-pozo-dm", DEV_A, "dev");
    assert.ok("result" in dev && !dev.result.full && dev.result.dev === true);
    // The public room is untouched.
    const roster = pollRoom("nexus-pozo-dm", "p0", "p", 0);
    assert.ok(!roster.full && roster.peers.length === 8 && !roster.peers.some((p) => p.id === "dev"));
  });

  it("dev room has no cap", () => {
    for (let i = 0; i < 12; i++) {
      const r = poll("nexus-mar-duel", DEV_A, `d${i}`);
      assert.ok("result" in r && !r.result.full);
    }
    const r = pollRoom(DEFAULT_DEV_ROOM, "d0", "d", 0, { dev: true });
    assert.equal(r.peers.length, 12);
  });

  it("non-dev players can never enter or signal into the dev room", () => {
    poll("nexus-pozo-dm", DEV_A, "a");
    assert.deepEqual(routeRoom(DEFAULT_DEV_ROOM, "someone-else", config), { ok: false, status: 403, error: "Room reserved" });
    assert.deepEqual(routeRoom(DEFAULT_DEV_ROOM, null, config), { ok: false, status: 403, error: "Room reserved" });
    // Without the dev flag the dev room id is not a valid room at all.
    assert.deepEqual(pollRoom(DEFAULT_DEV_ROOM, "x", "x", 0), { peers: [], signals: [] });
    addSignal(DEFAULT_DEV_ROOM, "x", "a", "offer", {});
    leaveRoom(DEFAULT_DEV_ROOM, "a");
    const a = pollRoom(DEFAULT_DEV_ROOM, "a", "a", 0, { dev: true });
    assert.deepEqual(a.peers.map((p) => p.id), ["a"]);
    assert.equal(a.signals.length, 0);
    // A normal player requesting a public room lands there, not with the testers.
    const n = poll("nexus-pozo-dm", "someone-else", "n");
    assert.ok("result" in n && n.route.dev === false && !n.result.full);
    assert.deepEqual(n.result.peers.map((p) => p.id), ["n"]);
    assert.equal(!n.result.full && n.result.dev, undefined);
  });

  it("dev peers exchange signals and leave through the dev room", () => {
    poll("nexus-pozo-dm", DEV_A, "a");
    poll("nexus-cumbre-dm", DEV_B, "b");
    const post = routeRoom("nexus-cumbre-dm", DEV_B, config);
    assert.ok(post.ok && post.dev);
    addSignal(post.room, "b", "a", "offer", { sdp: 1 }, { dev: post.dev });
    const a = pollRoom(DEFAULT_DEV_ROOM, "a", "a", 0, { dev: true });
    assert.deepEqual(a.signals.map((s) => [s.from, s.kind]), [["b", "offer"]]);
    leaveRoom(post.room, "b", { dev: true });
    assert.deepEqual(pollRoom(DEFAULT_DEV_ROOM, "a", "a", 0, { dev: true }).peers.map((p) => p.id), ["a"]);
  });
});

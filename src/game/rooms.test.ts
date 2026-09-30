import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MAX_OVERFLOW_ROOMS, baseRoomId, isPublicRoomId, overflowRoomId, publicRoomId, roomCapacity, roomOverflowIndex } from "./constants.ts";

describe("public room ids", () => {
  it("accepts the 13 base rooms and legacy id", () => {
    for (const arena of ["pozo", "cumbre", "lave", "luna", "laberinto", "mar"] as const) {
      assert.ok(isPublicRoomId(publicRoomId(arena, "dm")));
      assert.ok(isPublicRoomId(publicRoomId(arena, "duel")));
    }
    assert.ok(isPublicRoomId("nexus-luna-ctf"));
    assert.ok(isPublicRoomId("nexus-arena-public-v1"));
  });

  it("accepts overflow ids -2..-21 only", () => {
    assert.ok(isPublicRoomId("nexus-pozo-dm-2"));
    assert.ok(isPublicRoomId(`nexus-luna-ctf-${MAX_OVERFLOW_ROOMS + 1}`));
    assert.ok(!isPublicRoomId(`nexus-luna-ctf-${MAX_OVERFLOW_ROOMS + 2}`));
    assert.ok(!isPublicRoomId("nexus-pozo-dm-1"));
    assert.ok(!isPublicRoomId("nexus-pozo-dm-0"));
    assert.ok(!isPublicRoomId("nexus-pozo-dm-02"));
    assert.ok(!isPublicRoomId("nexus-arena-public-v1-2"));
    assert.ok(!isPublicRoomId("nexus-pozo-ctf"));
    assert.ok(!isPublicRoomId("nexus-pozo-dm-2-2"));
  });

  it("maps overflow ids back to their base and capacity", () => {
    assert.equal(roomOverflowIndex("nexus-mar-duel"), 1);
    assert.equal(roomOverflowIndex("nexus-mar-duel-7"), 7);
    assert.equal(roomOverflowIndex("bogus"), 0);
    assert.equal(baseRoomId("nexus-mar-duel-7"), "nexus-mar-duel");
    assert.equal(baseRoomId("nexus-arena-public-v1"), "nexus-pozo-dm");
    assert.equal(overflowRoomId("nexus-mar-duel", 1), "nexus-mar-duel");
    assert.equal(overflowRoomId("nexus-mar-duel", 3), "nexus-mar-duel-3");
    assert.equal(roomCapacity("nexus-mar-duel-3"), 2);
    assert.equal(roomCapacity("nexus-mar-dm"), 8);
    assert.equal(roomCapacity("nexus-luna-ctf-2"), 8);
  });
});

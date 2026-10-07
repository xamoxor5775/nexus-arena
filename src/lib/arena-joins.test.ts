import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_INTERNAL_PREFIXES, hashId, isInternalIp, joinDay, parsePrefixes } from "./arena-joins.ts";

test("arena joins: day is computed in America/Santiago", () => {
  // 2026-10-08 02:00 UTC is still 2026-10-07 23:00 in Chile (UTC-3).
  assert.equal(joinDay(Date.UTC(2026, 9, 8, 2, 0)), "2026-10-07");
  assert.equal(joinDay(Date.UTC(2026, 9, 8, 4, 0)), "2026-10-08");
});

test("arena joins: internal prefixes (own/test traffic)", () => {
  assert.deepEqual(parsePrefixes(undefined), DEFAULT_INTERNAL_PREFIXES);
  assert.deepEqual(parsePrefixes(" 10.0., ,192.168.1. "), ["10.0.", "192.168.1."]);
  assert.deepEqual(parsePrefixes(""), []);
  assert.equal(isInternalIp("190.114.33.4", DEFAULT_INTERNAL_PREFIXES), true);
  assert.equal(isInternalIp("::ffff:104.30.180.9", DEFAULT_INTERNAL_PREFIXES), true);
  assert.equal(isInternalIp("190.11.4.4", DEFAULT_INTERNAL_PREFIXES), false);
  assert.equal(isInternalIp("201.1.1.1", []), false);
});

test("arena joins: hashes are stable, keyed and never the raw value", () => {
  const a = hashId("ip:200.1.1.1", "k1");
  assert.equal(a, hashId("ip:200.1.1.1", "k1"));
  assert.notEqual(a, hashId("ip:200.1.1.1", "k2"));
  assert.equal(a.length, 16);
  assert.ok(!a.includes("200.1.1.1"));
});

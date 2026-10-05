import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WEAPON_META } from "./constants.ts";
import {
  PvpInbox,
  RecentIds,
  makeHitMessage,
  makeKillMessage,
  maxHitDamage,
  type AcceptedHit,
  type AcceptedKill,
  type PvpHitMessage,
} from "./pvp.ts";

const hit = (over: Partial<AcceptedHit> = {}): AcceptedHit => ({
  weapon: "pulse",
  damage: 9,
  headshot: false,
  dir: [0, 0, 1],
  knock: 1,
  ...over,
});

describe("PvpInbox.acceptHit", () => {
  it("accepts a hit addressed to us from its shooter", () => {
    const inbox = new PvpInbox("B", WEAPON_META);
    const got = inbox.acceptHit("A", makeHitMessage("A", "B", 1, hit({ headshot: true })));
    assert.ok(got);
    assert.equal(got.weapon, "pulse");
    assert.equal(got.damage, 9);
    assert.equal(got.headshot, true);
  });

  it("dedupes by hit id", () => {
    const inbox = new PvpInbox("B", WEAPON_META);
    const msg = makeHitMessage("A", "B", 7, hit());
    assert.ok(inbox.acceptHit("A", msg));
    assert.equal(inbox.acceptHit("A", msg), null);
    assert.ok(inbox.acceptHit("A", makeHitMessage("A", "B", 8, hit())));
  });

  it("rejects spoofed shooter, wrong victim, bad weapon and non-positive damage", () => {
    const inbox = new PvpInbox("B", WEAPON_META);
    assert.equal(inbox.acceptHit("C", makeHitMessage("A", "B", 1, hit())), null);
    assert.equal(inbox.acceptHit("A", makeHitMessage("A", "Z", 2, hit())), null);
    assert.equal(inbox.acceptHit("A", { ...makeHitMessage("A", "B", 3, hit()), weapon: "bfg" }), null);
    assert.equal(inbox.acceptHit("A", makeHitMessage("A", "B", 4, hit({ damage: 0 }))), null);
    assert.equal(inbox.acceptHit("A", { ...makeHitMessage("A", "B", 5, hit()), damage: Number.NaN }), null);
    assert.equal(inbox.acceptHit("A", null), null);
    assert.equal(inbox.acceptHit("A", "hit"), null);
  });

  it("clamps damage and knock to what the weapon can deal", () => {
    const inbox = new PvpInbox("B", WEAPON_META);
    const got = inbox.acceptHit("A", makeHitMessage("A", "B", 1, hit({ damage: 5000, knock: 999 })));
    assert.ok(got);
    assert.equal(got.damage, maxHitDamage("pulse", WEAPON_META));
    assert.ok(got.damage < 30);
    assert.ok(got.knock <= WEAPON_META.pulse.knock * 1.25);
    // A legit volt headshot with the hammer is still lethal.
    const hammer = inbox.acceptHit("A", makeHitMessage("A", "B", 2, hit({ weapon: "martillo", damage: 100 * 1.45 * 1.6 })));
    assert.ok(hammer && hammer.damage >= 200);
  });

  it("normalizes a bogus direction", () => {
    const inbox = new PvpInbox("B", WEAPON_META);
    const msg: PvpHitMessage = { ...makeHitMessage("A", "B", 1, hit()), dir: [3, 0, 4] };
    assert.deepEqual(inbox.acceptHit("A", msg)?.dir, [0.6, 0, 0.8]);
    const bad = { ...makeHitMessage("A", "B", 2, hit()), dir: ["x", 1] };
    assert.deepEqual(inbox.acceptHit("A", bad)?.dir, [0, 0, 0]);
  });
});

describe("PvpInbox.acceptKill", () => {
  it("credits the local player when named as killer", () => {
    const inbox = new PvpInbox("A", WEAPON_META);
    const kill = inbox.acceptKill("B", makeKillMessage("B", 1, { killer: "A", killerName: "Ana", weapon: "lance", headshot: true }));
    assert.deepEqual(kill, { victim: "B", killer: "self", killerName: "Ana", weapon: "lance", headshot: true });
  });

  it("only the victim can announce its own death, once", () => {
    const inbox = new PvpInbox("A", WEAPON_META);
    const msg = makeKillMessage("B", 1, { killer: "C", killerName: "Cris", weapon: "pulse", headshot: false });
    assert.equal(inbox.acceptKill("C", msg), null);
    assert.equal(inbox.acceptKill("B", msg)?.killer, "C");
    assert.equal(inbox.acceptKill("B", msg), null);
  });

  it("maps suicide / world / bot kills to a null killer", () => {
    const inbox = new PvpInbox("A", WEAPON_META);
    assert.equal(inbox.acceptKill("B", makeKillMessage("B", 1, { killer: null, killerName: null, weapon: "world", headshot: false }))?.killer, null);
    assert.equal(inbox.acceptKill("B", makeKillMessage("B", 2, { killer: "B", killerName: null, weapon: "torpedo", headshot: false }))?.killer, null);
    const bot = inbox.acceptKill("B", makeKillMessage("B", 3, { killer: null, killerName: "Sentinel", weapon: "ion", headshot: false }));
    assert.equal(bot?.killer, null);
    assert.equal(bot?.killerName, "Sentinel");
    assert.equal(inbox.acceptKill("B", { ...makeKillMessage("B", 4, { killer: null, killerName: null, weapon: "world", headshot: false }), weapon: "nuke" }), null);
  });
});

describe("RecentIds", () => {
  it("evicts oldest ids beyond its cap", () => {
    const ids = new RecentIds(2);
    assert.equal(ids.add("a"), true);
    assert.equal(ids.add("b"), true);
    assert.equal(ids.add("a"), false);
    assert.equal(ids.add("c"), true);
    assert.equal(ids.add("a"), true);
  });
});

/**
 * Two-peer simulation of the wire protocol: A shoots B. B owns its health,
 * dies, broadcasts `kill`; A (and a spectator C) credit A exactly once.
 */
describe("two-peer hit/kill simulation", () => {
  type Peer = {
    id: string;
    inbox: PvpInbox;
    health: number;
    alive: boolean;
    protectedUntil: number;
    seq: number;
    score: Map<string, { frags: number; deaths: number }>;
    feed: string[];
  };
  const mk = (id: string): Peer => ({
    id,
    inbox: new PvpInbox(id, WEAPON_META),
    health: 100,
    alive: true,
    protectedUntil: 0,
    seq: 0,
    score: new Map(),
    feed: [],
  });
  const row = (p: Peer, id: string) => {
    let r = p.score.get(id);
    if (!r) p.score.set(id, (r = { frags: 0, deaths: 0 }));
    return r;
  };
  // Reliable channel: messages are JSON round-tripped like the data channel does.
  const wire = (v: unknown) => JSON.parse(JSON.stringify(v)) as unknown;

  function applyKill(p: Peer, k: AcceptedKill) {
    row(p, k.victim).deaths += 1;
    const killer = k.killer === "self" ? p.id : k.killer;
    if (killer) row(p, killer).frags += 1;
    p.feed.push(`${killer ?? k.killerName ?? k.victim}>${k.victim}`);
  }

  function deliverHit(victim: Peer, from: string, raw: unknown, now: number, peers: Peer[]) {
    const h = victim.inbox.acceptHit(from, wire(raw));
    if (!h || !victim.alive || now < victim.protectedUntil) return;
    victim.health -= h.damage;
    if (victim.health > 0) return;
    victim.alive = false;
    victim.health = 0;
    const kill = makeKillMessage(victim.id, ++victim.seq, { killer: from, killerName: from, weapon: h.weapon, headshot: h.headshot });
    // Victim applies its own death locally, then broadcasts it.
    row(victim, victim.id).deaths += 1;
    row(victim, from).frags += 1;
    victim.feed.push(`${from}>${victim.id}`);
    for (const p of peers) {
      if (p === victim) continue;
      const k = p.inbox.acceptKill(victim.id, wire(kill));
      if (k) applyKill(p, k);
      // Duplicate delivery must be ignored.
      const again = p.inbox.acceptKill(victim.id, wire(kill));
      assert.equal(again, null);
    }
  }

  it("credits the killer once on every peer, ignores dead/duplicate/protected hits", () => {
    const A = mk("A");
    const B = mk("B");
    const C = mk("C");
    const peers = [A, B, C];
    const shot = (seq: number) => makeHitMessage("A", "B", seq, { weapon: "lance", damage: 86, headshot: false, dir: [1, 0, 0], knock: 4 });

    B.protectedUntil = 10;
    deliverHit(B, "A", shot(1), 5, peers); // respawn-protected → ignored
    assert.equal(B.health, 100);

    deliverHit(B, "A", shot(2), 20, peers);
    deliverHit(B, "A", shot(2), 20, peers); // duplicate id → ignored
    assert.equal(B.health, 14);

    deliverHit(B, "A", shot(3), 21, peers); // lethal
    assert.equal(B.alive, false);
    deliverHit(B, "A", shot(4), 22, peers); // already dead → ignored

    for (const p of peers) {
      assert.deepEqual(p.score.get("A"), { frags: 1, deaths: 0 }, `frags of A on ${p.id}`);
      assert.deepEqual(p.score.get("B"), { frags: 0, deaths: 1 }, `deaths of B on ${p.id}`);
      assert.deepEqual(p.feed, ["A>B"], `killfeed on ${p.id}`);
    }
  });

  it("an inflated damage report cannot one-shot through the clamp", () => {
    const A = mk("A");
    const B = mk("B");
    deliverHit(B, "A", makeHitMessage("A", "B", 1, { weapon: "pulse", damage: 9999, headshot: true, dir: [0, 0, 1], knock: 0 }), 1, [A, B]);
    assert.equal(B.alive, true);
    assert.ok(B.health > 70);
  });
});

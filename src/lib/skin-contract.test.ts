import { test } from "node:test";
import assert from "node:assert/strict";
import { flowSignature, mergeOwnedSkins, restoreCodeFor, restoreCodeMatches } from "./skin-contract.ts";
import { PAID_SKINS, RESTORE_CODE, SKIN_BUNDLE_ID, SKIN_BUNDLE_PRICE_CLP, SKIN_PRICE_CLP, formatClp, normalizeRestoreCode, skinProduct } from "./skin-store.ts";

const SECRET = "test-secret";

test("restore code: stable, formatted, per email (case/space-insensitive), per secret", () => {
  const a = restoreCodeFor("Ana@Example.com ", SECRET);
  assert.match(a, RESTORE_CODE);
  assert.equal(a, restoreCodeFor("ana@example.com", SECRET));
  assert.notEqual(a, restoreCodeFor("otro@example.com", SECRET));
  assert.notEqual(a, restoreCodeFor("ana@example.com", "other-secret"));
});

test("restore code check accepts loose typing, rejects wrong codes/emails", () => {
  const code = restoreCodeFor("ana@example.com", SECRET);
  assert.ok(restoreCodeMatches("ana@example.com", code, SECRET));
  assert.ok(restoreCodeMatches("ANA@example.com", code.toLowerCase().replace(/-/g, " "), SECRET));
  assert.ok(!restoreCodeMatches("otro@example.com", code, SECRET));
  assert.ok(!restoreCodeMatches("ana@example.com", "NX-AAAA-AAAA-AAAA", SECRET));
  assert.ok(!restoreCodeMatches("ana@example.com", "garbage", SECRET));
  assert.equal(normalizeRestoreCode("nxabcd efgh jkmn"), "NX-ABCD-EFGH-JKMN");
});

test("Flow signature matches the documented algorithm (sorted key+value, HMAC-SHA256 hex)", () => {
  const sig = flowSignature({ token: "T1", apiKey: "K", amount: 990 }, "s3cr3t");
  // amount990apiKeyKtokenT1
  assert.equal(sig, "99ea7755322511cdb6978cd7dc9ecaec277b7f2ea7ffc7f1ffbd3359fc6b9755"); // python hmac reference
  assert.match(sig, /^[0-9a-f]{64}$/);
  assert.equal(sig, flowSignature({ amount: 990, token: "T1", apiKey: "K" }, "s3cr3t"));
  assert.notEqual(sig, flowSignature({ token: "T1", apiKey: "K", amount: 991 }, "s3cr3t"));
});

test("products and prices come from one config", () => {
  assert.equal(PAID_SKINS.length, 10);
  for (const s of PAID_SKINS) assert.deepEqual(skinProduct(s.id), { id: s.id, name: s.name, amount: SKIN_PRICE_CLP, skins: [s.id] });
  const bundle = skinProduct(SKIN_BUNDLE_ID)!;
  assert.equal(bundle.amount, SKIN_BUNDLE_PRICE_CLP);
  assert.equal(bundle.skins.length, 10);
  assert.equal(skinProduct("pulse-default"), null);
  assert.equal(skinProduct("nope"), null);
  assert.equal(formatClp(3990), "$3.990");
  assert.equal(formatClp(990), "$990");
});

test("owned skins = union of paid orders, unknown ids dropped", () => {
  assert.deepEqual(mergeOwnedSkins([{ skins: "pulse-ar-h470" }, { skins: "pulse-ar-h470,bate-metal-bat" }, { skins: "hack-skin" }, { skins: null }]), ["bate-metal-bat", "pulse-ar-h470"]);
});

test("Flow email check: '+' and odd characters are rejected with a clear message, normal emails pass", async () => {
  const { FLOW_EMAIL_CHARS_ERROR, FLOW_EMAIL_PLUS_ERROR, flowEmailError } = await import("./skin-store.ts");
  assert.equal(flowEmailError("nombre+skins@gmail.com"), FLOW_EMAIL_PLUS_ERROR);
  assert.match(FLOW_EMAIL_PLUS_ERROR, /Flow no acepta correos con '\+'/);
  assert.equal(flowEmailError("nombre@gmail.com"), null);
  assert.equal(flowEmailError("nombre.apellido_2-x@mi-dominio.cl"), null);
  assert.equal(flowEmailError("NOMBRE@Gmail.COM"), null);
  assert.equal(flowEmailError("nombre!@gmail.com"), FLOW_EMAIL_CHARS_ERROR);
  assert.equal(flowEmailError("ñandú@gmail.com"), FLOW_EMAIL_CHARS_ERROR);
  assert.equal(flowEmailError("nombre@gmail"), FLOW_EMAIL_CHARS_ERROR);
});

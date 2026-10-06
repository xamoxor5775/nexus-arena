import { test } from "node:test";
import assert from "node:assert/strict";
import { clientIpFromHeaders } from "./client-ip.ts";

const h = (init: Record<string, string>) => new Headers(init);

test("client ip: prefers X-Real-IP (set by nginx) over any X-Forwarded-For", () => {
  assert.equal(clientIpFromHeaders(h({ "x-real-ip": "200.1.1.1", "x-forwarded-for": "6.6.6.6, 200.1.1.1" }), "172.18.0.1"), "200.1.1.1");
  assert.equal(clientIpFromHeaders(h({ "x-real-ip": " 200.1.1.1 " })), "200.1.1.1");
});

test("client ip: without X-Real-IP uses the LAST X-Forwarded-For entry, not the forgeable first one", () => {
  assert.equal(clientIpFromHeaders(h({ "x-forwarded-for": "6.6.6.6, 7.7.7.7, 200.1.1.1" }), "172.18.0.1"), "200.1.1.1");
  assert.equal(clientIpFromHeaders(h({ "x-forwarded-for": "200.1.1.1" })), "200.1.1.1");
  assert.equal(clientIpFromHeaders(h({ "x-forwarded-for": "6.6.6.6, 200.1.1.1 , " })), "200.1.1.1");
});

test("client ip: falls back to the socket address, then 'local'", () => {
  assert.equal(clientIpFromHeaders(h({}), "172.18.0.1"), "172.18.0.1");
  assert.equal(clientIpFromHeaders(h({ "x-real-ip": "", "x-forwarded-for": " , " }), "10.0.0.2"), "10.0.0.2");
  assert.equal(clientIpFromHeaders(h({})), "local");
  assert.equal(clientIpFromHeaders(h({}), null), "local");
});

test("client ip: a forged first X-Forwarded-For value does not change the key", () => {
  const a = clientIpFromHeaders(h({ "x-real-ip": "200.1.1.1", "x-forwarded-for": "1.1.1.1, 200.1.1.1" }));
  const b = clientIpFromHeaders(h({ "x-real-ip": "200.1.1.1", "x-forwarded-for": "9.9.9.9, 200.1.1.1" }));
  assert.equal(a, b);
});

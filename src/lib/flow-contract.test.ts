import assert from "node:assert/strict";
import test from "node:test";
import {
  amountsMatch,
  describeFlowCreateFailure,
  flowAmountMatches,
  flowCallbackUrls,
  parseFlowCallback,
} from "./flow-contract.ts";

test("las urls de Flow no llevan otra query", () => {
  const urls = flowCallbackUrls("https://nexusarena.cl/");
  assert.equal(urls.urlConfirmation, "https://nexusarena.cl/api/flow/confirmation");
  assert.equal(urls.urlReturn, "https://nexusarena.cl/api/flow/return");
  assert.equal(urls.urlReturn.includes("?"), false);
  assert.equal(urls.urlConfirmation.includes("?"), false);
});

test("acepta el monto de Flow como texto", () => {
  assert.equal(amountsMatch("1000", 1000), true);
  assert.equal(amountsMatch("1000.00", 1000), true);
  assert.equal(amountsMatch(1000, 1000), true);
  assert.equal(amountsMatch("970", 1000), false);
  assert.equal(flowAmountMatches({ amount: "1000", paymentData: { amount: "970.00" } }, 1000), true);
  assert.equal(flowAmountMatches({ paymentData: { amount: "1000.00" } }, 1000), true);
  assert.equal(flowAmountMatches({}, 1000), false);
});

test("lee el token aunque Flow lo pegue en la url de regreso", () => {
  const order = "203afd0a-77ef-4295-b08c-77b9d6c4dacc";
  assert.deepEqual(parseFlowCallback({ raw: `token=abc123&order=${order}` }), { token: "abc123", orderId: order });
  assert.deepEqual(parseFlowCallback({ query: { token: "abc123" } }), { token: "abc123", orderId: "" });
  assert.deepEqual(parseFlowCallback({ query: { order: `${order}?token=abc123` } }), { token: "abc123", orderId: order });
  assert.deepEqual(parseFlowCallback({ raw: JSON.stringify({ token: "abc123" }) }), { token: "abc123", orderId: "" });
});

test("un correo rechazado por Flow se explica y no se reintenta", () => {
  const failure = describeFlowCreateFailure(400, JSON.stringify({
    code: 1620,
    message: "The userEmail: persona@ejemplo.cl is not valid.",
  }));
  assert.equal(failure.statusCode, 400);
  assert.equal(failure.retryable, false);
  assert.match(failure.message, /correo/);
  assert.equal(failure.message.includes("persona@"), false);
});

test("un corte de Flow sí se reintenta", () => {
  const failure = describeFlowCreateFailure(503, "upstream timeout");
  assert.equal(failure.retryable, true);
  assert.equal(failure.statusCode, 503);
});

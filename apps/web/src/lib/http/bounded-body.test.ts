import assert from "node:assert/strict";
import test from "node:test";
import { BFF_REQUEST_BODY_LIMIT_BYTES, BoundedBodyError, readBoundedForm, readBoundedJson } from "./bounded-body";

test("accepts normal JSON and form bodies", async () => {
  assert.deepEqual(await readBoundedJson(new Request("http://app.test", { method: "POST", body: JSON.stringify({ ok: true }) })), { ok: true });
  const form = await readBoundedForm(new Request("http://app.test", { method: "POST", body: "login=user&password=private" }));
  assert.equal(form.get("login"), "user");
});

test("rejects declared and streamed oversized bodies with safe 413 errors", async () => {
  const declared = new Request("http://app.test", { method: "POST", headers: { "Content-Length": String(BFF_REQUEST_BODY_LIMIT_BYTES + 1) }, body: "{}" });
  const streamed = new Request("http://app.test", { method: "POST", body: "x".repeat(BFF_REQUEST_BODY_LIMIT_BYTES + 1) });
  for (const request of [declared, streamed]) {
    await assert.rejects(readBoundedJson(request), (error: unknown) => error instanceof BoundedBodyError && error.status === 413);
  }
});

test("malformed JSON is a safe 400 without parser internals", async () => {
  await assert.rejects(readBoundedJson(new Request("http://app.test", { method: "POST", body: "{" })), (error: unknown) => {
    assert.ok(error instanceof BoundedBodyError);
    assert.equal(error.status, 400);
    assert.equal(error.message.includes("position"), false);
    return true;
  });
});

import assert from "node:assert/strict";
import test from "node:test";
import { classifyMeResponse } from "./auth-resolution";

const safeUser = {
  id: "00000000-0000-4000-8000-000000000001",
  login: "operator",
  role: "ADMIN",
  permissions: [],
  mustChangePassword: false,
} as const;

test("valid 200 user resolves authenticated", () => {
  const resolution = classifyMeResponse(200, safeUser);
  assert.equal(resolution.kind, "authenticated");
  assert.deepEqual(resolution.kind === "authenticated" ? resolution.user : null, safeUser);
});

test("401 resolves unauthenticated without inspecting the body", () => {
  for (const body of [undefined, null, { stack: "private" }, { user: safeUser }]) {
    assert.deepEqual(classifyMeResponse(401, body), { kind: "unauthenticated" });
  }
});

test("403 resolves unavailable", () => {
  assert.deepEqual(classifyMeResponse(403, { error: "Forbidden" }), { kind: "unavailable" });
});

test("500 and 503 resolve unavailable", () => {
  assert.deepEqual(classifyMeResponse(500, { error: "internal" }), { kind: "unavailable" });
  assert.deepEqual(classifyMeResponse(503, { error: "upstream" }), { kind: "unavailable" });
});

test("unexpected statuses resolve unavailable", () => {
  for (const status of [400, 404, 429, 502]) {
    assert.deepEqual(classifyMeResponse(status, {}), { kind: "unavailable" });
  }
});

test("malformed 200 payload resolves unavailable", () => {
  for (const payload of [undefined, null, "user", 42, { passwordHash: "must not surface" }]) {
    assert.deepEqual(classifyMeResponse(200, payload), { kind: "unavailable" });
  }
});

test("structurally invalid 200 user resolves unavailable", () => {
  assert.deepEqual(
    classifyMeResponse(200, { ...safeUser, permissions: ["unknown.permission"] }),
    { kind: "unavailable" },
  );
  assert.deepEqual(
    classifyMeResponse(200, { ...safeUser, role: "OWNER" }),
    { kind: "unavailable" },
  );
});

test("classification never classifies by message strings", () => {
  assert.deepEqual(classifyMeResponse(200, { message: "unauthenticated" }), { kind: "unavailable" });
  assert.deepEqual(classifyMeResponse(418, { kind: "authenticated", user: safeUser }), {
    kind: "unavailable",
  });
});

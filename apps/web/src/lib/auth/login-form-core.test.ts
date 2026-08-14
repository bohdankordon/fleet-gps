import assert from "node:assert/strict";
import test from "node:test";
import { attemptLogin, validateLoginForm } from "./login-form-core";

const safeUser = { id: "user-id", login: "operator", role: "ADMIN", permissions: [], mustChangePassword: false } as const;

test("validation distinguishes local form mistakes without validating login-time password policy", () => {
  assert.equal(validateLoginForm("", "present"), "LOGIN_REQUIRED");
  for (const login of ["ab", "bad login", "кириллица"]) assert.equal(validateLoginForm(login, "present"), "LOGIN_INVALID");
  assert.equal(validateLoginForm("operator", ""), "PASSWORD_REQUIRED");
  assert.equal(validateLoginForm("operator", "x"), null);
});

test("login credentials are sent only in the POST body and never in the URL", async () => {
  let input = ""; let init: RequestInit | undefined;
  const result = await attemptLogin("operator", "private-password", async (url, options) => { input = String(url); init = options; return Response.json(safeUser); });
  assert.equal(result.kind, "success");
  assert.equal(input, "/api/auth/login");
  assert.equal(new URL(input, "http://app.test").search, "");
  assert.equal(init?.method, "POST");
  assert.deepEqual(JSON.parse(String(init?.body)), { login: "operator", password: "private-password" });
});

test("unknown, wrong-password, and disabled-account 401 responses are indistinguishable", async () => {
  for (const internalBody of [{ reason: "unknown" }, { reason: "wrong-password" }, { reason: "disabled" }]) {
    const result = await attemptLogin("operator", "wrong", async () => Response.json(internalBody, { status: 401 }));
    assert.deepEqual(result, { kind: "invalid-credentials" });
  }
});

test("5xx, network, and malformed success responses become one safe unavailable result", async () => {
  const server = await attemptLogin("operator", "present", async () => Response.json({ stack: "private internal stack" }, { status: 500 }));
  const network = await attemptLogin("operator", "present", async () => { throw new Error("private network details"); });
  const malformed = await attemptLogin("operator", "present", async () => Response.json({ passwordHash: "must not surface" }));
  for (const result of [server, network, malformed]) assert.deepEqual(result, { kind: "unavailable" });
  assert.equal(JSON.stringify([server, network, malformed]).includes("private"), false);
});

test("only the stable LOGIN_RATE_LIMITED code becomes the localized rate-limit state", async () => {
  const limited = await attemptLogin("operator", "present", async () => Response.json({ statusCode: 429, error: "LOGIN_RATE_LIMITED", message: "raw backend text" }, { status: 429 }));
  const unknown = await attemptLogin("operator", "present", async () => Response.json({ error: "SOMETHING_ELSE", message: "raw backend text" }, { status: 429 }));
  assert.deepEqual(limited, { kind: "rate-limited" });
  assert.deepEqual(unknown, { kind: "unavailable" });
  assert.equal(JSON.stringify([limited, unknown]).includes("raw backend text"), false);
});

import assert from "node:assert/strict";
import test from "node:test";
import type { EqugpsConfig } from "../config.js";
import { EqugpsClient, serializeSessionForm } from "./equgps-client.js";
import { sessionSchema } from "./equgps-session-schemas.js";
import { compareConfiguredWebToken, verifySessionTokenWithWebApi } from "./equgps-session-token.js";
import { EquGpsWebClient } from "../equgps-web/equgps-web-client.js";

const config: EqugpsConfig = {
  baseUrl: "https://trace.example.test/api/",
  email: "tester@example.test",
  password: "password-not-for-output",
  timezone: "Europe/Kyiv",
  requestTimeoutMs: 1_000,
};

test("serializes the session form with email and password", () => {
  assert.equal(serializeSessionForm("a+b@example.test", "p&=x"), "email=a%2Bb%40example.test&password=p%26%3Dx");
});

test("session request uses form auth and never Basic Auth", async () => {
  const originalFetch = globalThis.fetch;
  let captured: RequestInit | undefined;
  globalThis.fetch = async (_input, init) => {
    captured = init;
    return new Response(JSON.stringify({ id: 1, name: "user", token: "session-token" }), { status: 200 });
  };
  try {
    await new EqugpsClient(config).createSession();
    const headers = new Headers(captured?.headers);
    assert.equal(headers.get("accept"), "application/json");
    assert.equal(headers.get("content-type"), "application/x-www-form-urlencoded");
    assert.equal(headers.get("authorization"), null);
    assert.equal(captured?.body, serializeSessionForm(config.email, config.password));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("session errors do not disclose password or token", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("password-not-for-output token=session-token", { status: 400 });
  try {
    await assert.rejects(
      () => new EqugpsClient(config).createSession(),
      (error: Error) => !error.message.includes(config.password) && !error.message.includes("session-token"),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a session token never appears in a web diagnostic URL or error", async () => {
  const originalFetch = globalThis.fetch;
  const token = "session-token-not-for-diagnostics";
  globalThis.fetch = async () => new Response("forbidden", { status: 403 });
  try {
    await assert.rejects(
      () => new EquGpsWebClient({ baseUrl: "https://web.example.test/", configuredToken: undefined, requestTimeoutMs: 1_000 }).getRunsWithToken(token),
      (error: Error) => !error.message.includes(token) && !error.message.includes("https://web.example.test"),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("session response requires a non-empty token", () => {
  assert.equal(sessionSchema.safeParse({ id: 1 }).success, false);
  assert.equal(sessionSchema.safeParse({ token: "" }).success, false);
});

test("configured web-token comparison has only a boolean-safe result", () => {
  assert.equal(compareConfiguredWebToken("session-token", undefined), "not checked");
  assert.equal(compareConfiguredWebToken("session-token", "session-token"), true);
  assert.equal(compareConfiguredWebToken("session-token", "different-token"), false);
});

test("runs verification starts only after a successful session response", async () => {
  let runsCalls = 0;
  await assert.rejects(() => verifySessionTokenWithWebApi(
    async () => { throw new Error("session failed"); },
    async () => { runsCalls += 1; return "runs"; },
  ));
  assert.equal(runsCalls, 0);
});

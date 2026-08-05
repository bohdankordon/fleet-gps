import assert from "node:assert/strict";
import test from "node:test";
import { parseEquGpsConfig } from "../config/equgps-config";
import { FakeHttpTransport } from "../contracts/fake-transport";
import { EquGpsResponseValidationError } from "../errors/equgps-errors";
import { DefaultOfficialEquGpsClient } from "./official-client";

const config = parseEquGpsConfig({ officialBaseUrl: "https://trace.example.test/api", webBaseUrl: "https://web.example.test", email: "user@example.test", password: " secret ", requestTimeoutMs: 5_000 });

test("createSession sends form credentials without Basic Auth and returns only token", async () => {
  const transport = new FakeHttpTransport(async (request) => {
    assert.equal(request.method, "POST");
    assert.deepEqual(request.formBody, { email: "user@example.test", password: " secret " });
    assert.equal(request.headers.Authorization, undefined);
    assert.equal(request.timeoutMs, 5_000);
    return { status: 200, headers: {}, body: { token: "session", name: "ignored" } };
  });
  assert.equal(await new DefaultOfficialEquGpsClient(config, transport).createSession(), "session");
});

test("devices normalize optional values and drop sensitive transport fields", async () => {
  const client = new DefaultOfficialEquGpsClient(config, new FakeHttpTransport(async (request) => {
    assert.match(request.headers.Authorization ?? "", /^Basic /);
    assert.equal(request.timeoutMs, 5_000);
    return { status: 200, headers: {}, body: [{ id: 1, uniqueId: "hidden", phone: "hidden", attributes: { hidden: true } }] };
  }));
  assert.deepEqual(await client.getDevices(), [{ id: 1, name: null, status: null, disabled: null, lastUpdate: null }]);
});

test("positions normalize and historical requests encode validated query", async () => {
  const transport = new FakeHttpTransport(async (request) => {
    const url = new URL(request.url);
    if (request.operation === "getHistoricalPositions") assert.equal(url.searchParams.get("deviceId"), "7");
    return { status: 200, headers: {}, body: [{ deviceId: 7, speed: 12, latitude: 49, longitude: 28, network: null, attributes: { ignored: true } }] };
  });
  const client = new DefaultOfficialEquGpsClient(config, transport);
  assert.deepEqual(await client.getLatestPositions(), [{ deviceId: 7, fixTime: null, valid: null, outdated: null, speedKnots: 12, latitude: 49, longitude: 28 }]);
  await client.getHistoricalPositions({ deviceId: 7, from: "2026-01-01T00:00:00Z", to: "2026-01-01T01:00:00Z" });
  await client.getHistoricalPositions({ deviceId: 7, from: "2026-01-01T02:00:00+02:00", to: "2026-01-01T03:00:00+02:00" });
  for (const params of [
    { deviceId: 0, from: "2026-01-01T00:00:00Z", to: "2026-01-01T01:00:00Z" },
    { deviceId: 7, from: "2026-01-01T00:00:00", to: "2026-01-01T01:00:00Z" },
    { deviceId: 7, from: "2026-01-01", to: "2026-01-01T01:00:00Z" },
    { deviceId: 7, from: "text", to: "2026-01-01T01:00:00Z" },
    { deviceId: 7, from: "2026-01-01T00:00:00Z", to: "2026-01-01T00:00:00Z" },
    { deviceId: 7, from: "2026-01-01T01:00:00Z", to: "2026-01-01T00:00:00Z" },
    { deviceId: 7, from: "2026-02-30T00:00:00Z", to: "2026-03-01T00:00:00Z" },
  ]) {
    await assert.rejects(() => client.getHistoricalPositions(params), EquGpsResponseValidationError);
  }
});

test("invalid token response, speed, coordinates and schemas fail safely", async () => {
  for (const body of [{}, [{ deviceId: 1, speed: -1 }], [{ deviceId: 1, latitude: 91 }]]) {
    const client = new DefaultOfficialEquGpsClient(config, new FakeHttpTransport(async () => ({ status: 200, headers: {}, body })));
    const operation = Array.isArray(body) ? () => client.getLatestPositions() : () => client.createSession();
    await assert.rejects(operation, EquGpsResponseValidationError);
  }
});

test("device identifiers must be positive", async () => {
  for (const id of [0, -1]) {
    const client = new DefaultOfficialEquGpsClient(config, new FakeHttpTransport(async () => ({ status: 200, headers: {}, body: [{ id }] })));
    await assert.rejects(() => client.getDevices(), EquGpsResponseValidationError);
  }
});

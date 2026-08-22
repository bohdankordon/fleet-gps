import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { HealthBackendUnavailableError } from "../../../lib/health/health-contract";
import { createHealthRouteHandler } from "../../../lib/health/health-route-handler";

const timestamp = "2026-08-22T00:00:00.000Z";
const liveness = { status: "ok", service: "taxi-gps-api", timestamp };
const ready = { status: "ready", service: "taxi-gps-api", database: "ready", timestamp };
const unavailable = { status: "unavailable", service: "taxi-gps-api", database: "unavailable", timestamp };

test("public liveness BFF forwards the validated API liveness response without authentication", async () => {
  const response = await createHealthRouteHandler("/api/health", async (path) => {
    assert.equal(path, "/api/health");
    return Response.json(liveness, { status: 200 });
  })();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), liveness);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("public readiness BFF preserves ready and unavailable API readiness semantics", async () => {
  const healthy = await createHealthRouteHandler("/api/health/ready", async () => Response.json(ready, { status: 200 }))();
  assert.equal(healthy.status, 200);
  assert.deepEqual(await healthy.json(), ready);

  const degraded = await createHealthRouteHandler("/api/health/ready", async () => Response.json(unavailable, { status: 503 }))();
  assert.equal(degraded.status, 503);
  assert.deepEqual(await degraded.json(), unavailable);
});

test("non-success, malformed, and unavailable upstream health responses never become healthy or leak internals", async () => {
  const responses = [
    await createHealthRouteHandler("/api/health", async () => new Response('{"detail":"http://api:3000 secret"}', { status: 500 }))(),
    await createHealthRouteHandler("/api/health/ready", async () => Response.json({ ...ready, database: "unavailable" }, { status: 200 }))(),
    await createHealthRouteHandler("/api/health", async () => { throw new HealthBackendUnavailableError(); })(),
  ];
  for (const response of responses) {
    assert.equal(response.status, 503);
    const body = await response.text();
    assert.equal(body.includes("api:3000"), false);
    assert.equal(body.includes("secret"), false);
  }
});

test("both documented public health routes are dynamic GET-only BFF routes", () => {
  for (const file of ["src/app/api/health/route.ts", "src/app/api/health/ready/route.ts"]) {
    const source = readFileSync(file, "utf8");
    assert.equal(source.includes('export const dynamic = "force-dynamic"'), true);
    assert.equal(source.includes("export const GET ="), true);
    assert.equal(source.includes("export const POST"), false);
    assert.equal(source.includes("auth"), false);
  }
});

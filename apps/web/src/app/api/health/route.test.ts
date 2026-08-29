import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createHealthRouteHandler } from "../../../lib/health/health-route-handler";

const timestamp = "2026-08-22T00:00:00.000Z";
const liveness = { status: "ok", service: "taxi-gps-api", timestamp };
const ready = { status: "ready", service: "taxi-gps-api", database: "ready", timestamp };
const unavailable = { status: "unavailable", service: "taxi-gps-api", database: "unavailable", timestamp };

test("public liveness BFF forwards the validated API liveness response anonymously", async () => {
  const response = await createHealthRouteHandler("/api/health", async (path) => {
    assert.equal(path, "/api/health");
    return Response.json(liveness, { status: 200 });
  })();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), liveness);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("public readiness BFF returns 200 when the internal API is ready", async () => {
  const response = await createHealthRouteHandler("/api/health/ready", async (path) => {
    assert.equal(path, "/api/health/ready");
    return Response.json(ready, { status: 200 });
  })();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), ready);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("public readiness BFF preserves an internal API non-ready response", async () => {
  const response = await createHealthRouteHandler("/api/health/ready", async () => Response.json(unavailable, { status: 503 }))();
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), unavailable);
});

test("unreachable or malformed upstream health never becomes ready or leaks internals", async () => {
  const responses = [
    await createHealthRouteHandler("/api/health/ready", async () => { throw new TypeError("connect ECONNREFUSED http://api:3000 secret"); })(),
    await createHealthRouteHandler("/api/health/ready", async () => Response.json({ ...ready, database: "unavailable" }, { status: 200 }))(),
    await createHealthRouteHandler("/api/health", async () => new Response("not-json", { status: 500 }))(),
  ];
  for (const response of responses) {
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { statusCode: 503, error: "Service Unavailable" });
  }
});

test("both accepted public health routes are dynamic GET-only anonymous BFF routes", () => {
  for (const file of ["src/app/api/health/route.ts", "src/app/api/health/ready/route.ts"]) {
    const source = readFileSync(file, "utf8");
    assert.equal(source.includes('export const dynamic = "force-dynamic"'), true);
    assert.equal(source.includes("export const GET ="), true);
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) assert.equal(source.includes(`export const ${method}`), false);
    assert.equal(source.includes("auth"), false);
    assert.equal(source.includes("cookie"), false);
  }
});

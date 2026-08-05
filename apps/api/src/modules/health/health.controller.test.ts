import assert from "node:assert/strict";
import test from "node:test";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";
import type { DatabaseReadinessService } from "../database/database-readiness.service";

function responseSpy() { let code = 0; let body: unknown; return { response: { status(value: number) { code = value; return this; }, json(value: unknown) { body = value; } }, get: () => ({ code, body }) }; }
test("liveness does not call database readiness", () => { const controller = new HealthController(new HealthService(), { check: async () => { throw new Error("must not be called"); } } as unknown as DatabaseReadinessService); assert.equal(controller.getHealth().status, "ok"); });
test("readiness maps ready and unavailable without error fields", async () => {
  for (const status of ["ready", "unavailable"] as const) { const spy = responseSpy(); const controller = new HealthController(new HealthService(), { check: async () => ({ status }) } as unknown as DatabaseReadinessService); await controller.getReadiness(spy.response as never); const result = spy.get(); assert.equal(result.code, status === "ready" ? 200 : 503); assert.equal(typeof (result.body as { timestamp: unknown }).timestamp, "string"); assert.equal("error" in (result.body as object), false); assert.equal("message" in (result.body as object), false); }
});

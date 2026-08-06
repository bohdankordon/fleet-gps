import assert from "node:assert/strict";
import test from "node:test";
import { SchedulerBackendUnavailableError } from "../../../../lib/scheduler/scheduler-errors";
import { SchedulerContractError } from "../../../../lib/scheduler/scheduler-contract";
import { createSchedulerRouteHandler } from "../../../../lib/scheduler/scheduler-route-handler";
import { validSchedulerStatus } from "../../../../lib/scheduler/scheduler-fixture";

test("scheduler BFF returns validated success", async () => { const response = await createSchedulerRouteHandler(async () => validSchedulerStatus)(); assert.equal(response.status, 200); assert.deepEqual(await response.json(), validSchedulerStatus); });
test("scheduler BFF returns 503 and 502 safely", async () => { const unavailable = await createSchedulerRouteHandler(async () => { throw new SchedulerBackendUnavailableError(); })(); assert.equal(unavailable.status, 503); const invalid = await createSchedulerRouteHandler(async () => { throw new SchedulerContractError(); })(); assert.equal(invalid.status, 502); });
test("scheduler BFF never returns raw backend error or body", async () => { const response = await createSchedulerRouteHandler(async () => { throw new Error("https://backend.invalid secret response body"); })(); const body = await response.text(); assert.equal(response.status, 500); assert.equal(body.includes("backend.invalid"), false); assert.equal(body.includes("secret"), false); });

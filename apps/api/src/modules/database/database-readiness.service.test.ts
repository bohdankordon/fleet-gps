import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseReadinessService } from "./database-readiness.service";
import type { DatabaseService } from "./database.service";

test("readiness returns ready after exactly one successful ping", async () => { let pings = 0; const service = new DatabaseReadinessService({ ping: async () => { pings += 1; } } as unknown as DatabaseService); assert.deepEqual(await service.check(), { status: "ready" }); assert.equal(pings, 1); });
test("readiness hides a failed ping", async () => { const service = new DatabaseReadinessService({ ping: async () => { throw new Error("secret database error"); } } as unknown as DatabaseService); assert.deepEqual(await service.check(), { status: "unavailable" }); });

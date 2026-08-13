import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PositionHistoryRetentionController } from "./position-history-retention.controller";
import { PositionHistoryRetentionModule } from "./position-history-retention.module";

test("retention runtime module is a read-only database module with no execution dependency", () => {
  assert.deepEqual((Reflect.getMetadata("imports", PositionHistoryRetentionModule) as Array<{ name: string }>).map((value) => value.name), ["DatabaseModule"]);
  assert.deepEqual(Reflect.getMetadata("controllers", PositionHistoryRetentionModule), [PositionHistoryRetentionController]);
});

test("planner structure reuses Stage 18C and has no mutation, provider, worker, scheduler, or lock path", () => {
  const service = readFileSync("src/modules/position-history-retention/position-history-retention.service.ts", "utf8");
  const repository = readFileSync("src/modules/position-history-retention/prisma-position-history-retention.repository.ts", "utf8");
  const module = readFileSync("src/modules/position-history-retention/position-history-retention.module.ts", "utf8");
  const combined = `${service}\n${repository}\n${module}`;
  assert.match(service, /position-history-maintenance-anchor/);
  assert.equal((service.match(/canonicalPositionHistoryMaintenanceAnchor/g) ?? []).length, 2);
  assert.doesNotMatch(combined, /EquGps|Provider|Worker|Executor|Cron|Interval|advisory|1706170003/);
  assert.doesNotMatch(repository, /\b(?:INSERT|UPDATE|DELETE)\b/i);
  assert.doesNotMatch(combined, /\.(?:create|createMany|update|updateMany|delete|deleteMany|upsert)\(/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { activeDurableRunSchema, createDurableRunRequestSchema, durableRunBudgets, recentDurableRunsSchema, safeDurableRunSchema } from "./position-history-durable-run-contract";

const exact = "2026-08-11T02:00:00.000Z";
const run = (status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED") => ({ id: "00000000-0000-4000-8000-000000000123", status, initiatorType: "USER", to: exact, excludeProviderDisabled: true, windowBudget: 1000, committedWindows: 24, createdAt: exact, startedAt: null, finishedAt: null, failureCategory: null });

test("browser contract has exactly three durable presets and strict fields", () => {
  assert.deepEqual(durableRunBudgets, [500, 1000, 5000]);
  for (const windowBudget of durableRunBudgets) assert.equal(createDurableRunRequestSchema.safeParse({ to: exact, windowBudget, excludeProviderDisabled: true }).success, true);
  for (const windowBudget of [24, 499, 777, 5001]) assert.equal(createDurableRunRequestSchema.safeParse({ to: exact, windowBudget, excludeProviderDisabled: true }).success, false);
  assert.equal(createDurableRunRequestSchema.safeParse({ to: exact, windowBudget: 1000, excludeProviderDisabled: true, initiatorType: "SYSTEM" }).success, false);
});

test("safe run contract rejects lease/internal fields and recent is terminal-only and bounded", () => {
  assert.equal(safeDurableRunSchema.safeParse({ ...run("RUNNING"), leaseOwner: "secret" }).success, false);
  assert.equal(activeDurableRunSchema.safeParse(run("PENDING")).success, true); assert.equal(activeDurableRunSchema.safeParse(null).success, true);
  assert.equal(recentDurableRunsSchema.safeParse([run("SUCCEEDED"), run("FAILED")]).success, true);
  assert.equal(recentDurableRunsSchema.safeParse([run("RUNNING")]).success, false);
  assert.equal(recentDurableRunsSchema.safeParse(Array.from({ length: 11 }, () => run("SUCCEEDED"))).success, false);
});


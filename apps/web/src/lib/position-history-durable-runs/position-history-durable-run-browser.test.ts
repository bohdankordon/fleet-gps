import assert from "node:assert/strict";
import test from "node:test";
import { submitDurableRun } from "./position-history-durable-run-browser";

const exact = "2026-08-11T02:00:00.000Z";
const run = { id: "00000000-0000-4000-8000-000000000123", status: "PENDING", initiatorType: "USER", to: exact, excludeProviderDisabled: true, windowBudget: 1000, committedWindows: 0, createdAt: exact, startedAt: null, finishedAt: null, failureCategory: null };

test("explicit create POST occurs exactly once and succeeds without retry", async () => {
  const methods: string[] = [];
  const outcome = await submitDurableRun({ to: exact, windowBudget: 1000, excludeProviderDisabled: true }, async (_input, init) => { methods.push(init?.method ?? "GET"); return Response.json(run, { status: 201 }); });
  assert.equal(outcome.kind, "CREATED"); assert.deepEqual(methods, ["POST"]);
});

test("ambiguous failure discovers active database truth with one GET but never reposts", async () => {
  const methods: string[] = [];
  const outcome = await submitDurableRun({ to: exact, windowBudget: 500, excludeProviderDisabled: false }, async (_input, init) => { const method = init?.method ?? "GET"; methods.push(method); if (method === "POST") throw new Error("lost response"); return Response.json(run); });
  assert.equal(outcome.kind, "FAILED"); assert.deepEqual(methods, ["POST", "GET"]); assert.equal(outcome.active?.id, run.id);
});


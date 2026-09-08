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
  // Phase 0: active read uses explicit { active: run | null } envelope.
  const outcome = await submitDurableRun({ to: exact, windowBudget: 500, excludeProviderDisabled: false }, async (_input, init) => { const method = init?.method ?? "GET"; methods.push(method); if (method === "POST") throw new Error("lost response"); return Response.json({ active: run }); });
  assert.equal(outcome.kind, "FAILED"); assert.deepEqual(methods, ["POST", "GET"]); assert.equal(outcome.active?.id, run.id);
});
test("Repair ambiguous create: conflict with confirmed active run", async () => {
  const methods: string[] = [];
  const outcome = await submitDurableRun({ to: exact, windowBudget: 500, excludeProviderDisabled: false }, async (_input, init) => { const method = init?.method ?? "GET"; methods.push(method); if (method === "POST") return Response.json({ error: "conflict" }, { status: 409 }); return Response.json({ active: run }); });
  assert.equal(outcome.kind, "ALREADY_RUNNING"); assert.deepEqual(methods, ["POST", "GET"]); assert.equal(outcome.active?.id, run.id); assert.equal((outcome as any).activeUnavailable, false);
});
test("Repair ambiguous create: follow-up succeeds with confirmed none", async () => {
  const outcome = await submitDurableRun({ to: exact, windowBudget: 500, excludeProviderDisabled: false }, async (_input, init) => { if ((init?.method ?? "GET") === "POST") throw new Error("lost"); return Response.json({ active: null }); });
  assert.equal(outcome.kind, "FAILED"); assert.equal(outcome.active, null); assert.equal((outcome as any).activeUnavailable, false);
});
test("Repair ambiguous create: follow-up failure is unavailable, not confirmed none", async () => {
  const methods: string[] = [];
  const outcome = await submitDurableRun({ to: exact, windowBudget: 500, excludeProviderDisabled: false }, async (_input, init) => { const method = init?.method ?? "GET"; methods.push(method); if (method === "POST") throw new Error("lost"); throw new Error("active down"); });
  assert.equal(outcome.kind, "FAILED"); assert.equal(outcome.active, null); assert.equal((outcome as any).activeUnavailable, true); assert.deepEqual(methods, ["POST", "GET"]);
});
test("Repair ambiguous create: no duplicate POST occurs", async () => {
  const methods: string[] = [];
  const outcome = await submitDurableRun({ to: exact, windowBudget: 500, excludeProviderDisabled: false }, async (_input, init) => { methods.push(init?.method ?? "GET"); if ((init?.method ?? "GET") === "POST") return Response.json({ error: "x" }, { status: 500 }); return Response.json({ active: null }); });
  assert.deepEqual(methods, ["POST", "GET"]); assert.equal((outcome as any).activeUnavailable, false);
});

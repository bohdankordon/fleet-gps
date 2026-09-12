import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { durableRunInitiatorLabel, durableRunPresentation } from "../../components/position-history-durable-runs";
import type { SafeDurableRun } from "./position-history-durable-run-contract";

const exact = "2026-08-11T02:00:00.000Z";
const terminal = (status: "SUCCEEDED" | "FAILED", committedWindows: number): SafeDurableRun => ({ id: status === "SUCCEEDED" ? "00000000-0000-4000-8000-000000000123" : "00000000-0000-4000-8000-000000000124", status, initiatorType: "USER", to: exact, excludeProviderDisabled: true, windowBudget: 1000, committedWindows, createdAt: exact, startedAt: exact, finishedAt: exact, failureCategory: status === "FAILED" ? "EXECUTION" : null });

test("view-only integration receives active/recent truth while create controls stay permission-conditional", () => {
  const source = readFileSync("src/components/position-history-population-workspace.tsx", "utf8"); const page = readFileSync("src/app/admin/history/population/page.tsx", "utf8");
  assert.match(source, /active && <ActiveRun/); assert.match(source, /<RecentRuns runs=\{recent\}/); assert.match(source, /shouldShowDurableCreateControls/);
  assert.match(page, /PositionHistoryPopulationWorkspace/); assert.match(page, /hasPermission\(user, "historyAdmin\.populate"\)/); assert.match(page, /fetchActiveDurableRun/); assert.match(page, /fetchRecentDurableRuns/);
  assert.equal(source.includes("leaseOwner"), false); assert.equal(source.includes("safeFailureCode"), false);
});

test("populate UI has exact defaults, confirmation-only create, long-running disclosure, and no expansive controls", () => {
  const source = readFileSync("src/components/position-history-population-workspace.tsx", "utf8");
  for (const expected of ["durableRunBudgets.map", "useState<DurableRunBudget>(1000)", "useState(true)", "checked={excludeProviderDisabled}", "AlertDialog", "submitting.current", "submitDurableRun", "history.population.durableHelp", "readActiveDurableRun", "startDurableRunPolling"]) assert.ok(source.includes(expected), expected);
  for (const forbidden of ["type=\"number\"", "unlimited", "leaseOwner", "leaseExpiresAt", "ETA", "Date.now()", "new Date()", "localStorage", "sessionStorage", "keepalive"]) assert.equal(source.includes(forbidden), false, forbidden);
});

test("PENDING, SUCCEEDED under budget, and FAILED retain factual product wording", () => {
  const pending = durableRunPresentation({ ...terminal("SUCCEEDED", 0), status: "PENDING", startedAt: null, finishedAt: null });
  assert.deepEqual(pending, { title: "Ожидает запуска", progress: "0 / 1000", partialWork: false });
  assert.deepEqual(durableRunPresentation(terminal("SUCCEEDED", 50)), { title: "Завершено", progress: "50 / 1000", partialWork: false });
  assert.deepEqual(durableRunPresentation(terminal("FAILED", 24)), { title: "Остановлено с ошибкой", progress: "24 / 1000", partialWork: true });
});

test("active and recent summaries distinguish safe USER and SYSTEM initiators without attribution internals", () => {
  assert.equal(durableRunInitiatorLabel("USER"), "Оператор");
  assert.equal(durableRunInitiatorLabel("SYSTEM"), "Автоматически");
  const source = readFileSync("src/components/position-history-population-workspace.tsx", "utf8");
  assert.match(source, /durableRunInitiatorLabel/);
  for (const forbidden of ["requestedByUserId", "leaseOwner", "scheduler instance", "server hostname", "pause", "resume", "retry-same-run"]) assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
  assert.match(source, /shouldShowDurableCreateControls/);
});

test("BFF server source forwards through named session helper and has one POST call site", () => {
  const source = readFileSync("src/lib/position-history-durable-runs/position-history-durable-run-client.ts", "utf8"); const cookie = readFileSync("src/lib/auth/auth-cookie.ts", "utf8");
  assert.match(source, /authenticatedApiFetch/); assert.match(source, /method: "POST"/); assert.match(source, /cache: "no-store"/); assert.equal((source.match(/method: "POST"/g) ?? []).length, 1); assert.doesNotMatch(source, /retry|taxi_session/i); assert.match(cookie, /AUTH_COOKIE_NAME/);
});

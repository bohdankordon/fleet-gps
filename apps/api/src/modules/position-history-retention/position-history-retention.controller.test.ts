import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException, HttpException, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthRole } from "../../generated/prisma/enums";
import { AuthenticationGuard } from "../auth/authentication.guard";
import type { AuthService } from "../auth/auth.service";
import { PermissionGuard } from "../auth/permission.guard";
import type { AuthenticatedPrincipal, AuthenticatedRequest } from "../auth/auth.types";
import { resolvePermissions } from "../auth/permissions";
import { PositionHistoryRetentionController } from "./position-history-retention.controller";
import type { PositionHistoryRetentionService } from "./position-history-retention.service";
import { PositionHistoryRetentionExecutionError, type PositionHistoryRetentionPlan } from "./position-history-retention.types";

const safePlan = { policyDays: 90, canonicalAnchor: "2026-08-11T02:00:00.000Z", policyCutoff: "2026-05-13T02:00:00.000Z", policyReconciliation: { cursorFloorCandidates: 0, replayCheckpointCandidates: 0 }, observations: { oldestObservedAt: null, newestObservedAt: null, hasExecutableWork: false }, checkpoints: { total: 0, fullyObsolete: 0, boundaryOverlap: 0, protected: 0, fullyObsoleteByStatus: { pending: 0, running: 0, completed: 0 }, boundaryOverlapByStatus: { pending: 0, running: 0, completed: 0 }, protectedByStatus: { pending: 0, running: 0, completed: 0 }, endingExactlyAtCutoff: 0, startingExactlyAtCutoff: 0, strictlyCrossingCutoff: 0 } } as const satisfies PositionHistoryRetentionPlan;
const handler = PositionHistoryRetentionController.prototype.getRetentionPlan;
function principal(role: AuthRole, permissions: readonly string[] = [], mustChangePassword = false): AuthenticatedPrincipal { return { id: "00000000-0000-4000-8000-000000000001", login: "operator", role, permissions: permissions as AuthenticatedPrincipal["permissions"], mustChangePassword, sessionTokenHash: new Uint8Array(32) }; }
function context(request: object) { return { getHandler: () => handler, getClass: () => PositionHistoryRetentionController, switchToHttp: () => ({ getRequest: () => request }) } as never; }

test("requires historyAdmin.view, permits its populate dependency and ADMIN", () => {
  const guard = new PermissionGuard(new Reflector());
  assert.throws(() => guard.canActivate(context({ auth: principal(AuthRole.USER) })), ForbiddenException);
  assert.equal(guard.canActivate(context({ auth: principal(AuthRole.USER, ["historyAdmin.view"]) })), true);
  assert.equal(guard.canActivate(context({ auth: principal(AuthRole.USER, resolvePermissions(["historyAdmin.populate"])) })), true);
  assert.equal(guard.canActivate(context({ auth: principal(AuthRole.ADMIN) })), true);
});

test("unauthenticated, revoked, and must-change sessions invoke the planner zero times", async () => {
  let calls = 0;
  void new PositionHistoryRetentionController({ getRetentionPlan: async () => { calls += 1; return safePlan; } } as unknown as PositionHistoryRetentionService);
  const missing = new AuthenticationGuard(new Reflector(), { authenticate: async () => null } as unknown as AuthService);
  await assert.rejects(missing.canActivate(context({ headers: {} })), UnauthorizedException);
  await assert.rejects(missing.canActivate(context({ headers: { cookie: `taxi_session=${"a".repeat(43)}` } })), UnauthorizedException);
  const mustChange = new AuthenticationGuard(new Reflector(), { authenticate: async () => principal(AuthRole.USER, ["historyAdmin.view"], true) } as unknown as AuthService);
  await assert.rejects(mustChange.canActivate(context({ headers: { cookie: `taxi_session=${"a".repeat(43)}` } })), ForbiddenException);
  assert.equal(calls, 0);
});

test("GET is no-store, accepts no policy query, and invokes only the planner read", async () => {
  let calls = 0;
  const headers = new Map<string, string>();
  const controller = new PositionHistoryRetentionController({ getRetentionPlan: async () => { calls += 1; return safePlan; } } as unknown as PositionHistoryRetentionService);
  const response = { setHeader: (name: string, value: string) => headers.set(name, value) };
  assert.equal(await controller.getRetentionPlan({}, response), safePlan);
  assert.equal(headers.get("Cache-Control"), "no-store");
  for (const query of [{ to: "2026-01-01T00:00:00Z" }, { cutoff: "x" }, { days: "365" }, { retentionDays: "90" }]) await assert.rejects(controller.getRetentionPlan(query, response), (error) => error instanceof HttpException && error.getStatus() === 400);
  assert.equal(calls, 1);
  assert.equal("post" in controller || "delete" in controller, false);
});

test("execution POST is ADMIN-only even when USER has view or populate permission", () => {
  const executionHandler = PositionHistoryRetentionController.prototype.executeRetention;
  const executionContext = (request: object) => ({ getHandler: () => executionHandler, getClass: () => PositionHistoryRetentionController, switchToHttp: () => ({ getRequest: () => request }) } as never);
  const guard = new PermissionGuard(new Reflector());
  assert.throws(() => guard.canActivate(executionContext({ auth: principal(AuthRole.USER, ["historyAdmin.view"]) })), ForbiddenException);
  assert.throws(() => guard.canActivate(executionContext({ auth: principal(AuthRole.USER, resolvePermissions(["historyAdmin.populate"])) })), ForbiddenException);
  assert.equal(guard.canActivate(executionContext({ auth: principal(AuthRole.ADMIN) })), true);
});

test("execution authentication rejects unauthenticated, revoked, and must-change ADMIN sessions before service invocation", async () => {
  let calls = 0;
  void new PositionHistoryRetentionController({ executeRetention: async () => { calls += 1; throw new Error("must not run"); } } as unknown as PositionHistoryRetentionService);
  const executionHandler = PositionHistoryRetentionController.prototype.executeRetention;
  const executionContext = (request: object) => ({ getHandler: () => executionHandler, getClass: () => PositionHistoryRetentionController, switchToHttp: () => ({ getRequest: () => request }) } as never);
  const revoked = new AuthenticationGuard(new Reflector(), { authenticate: async () => null } as unknown as AuthService);
  await assert.rejects(revoked.canActivate(executionContext({ headers: { cookie: `taxi_session=${"a".repeat(43)}` } })), UnauthorizedException);
  const mustChange = new AuthenticationGuard(new Reflector(), { authenticate: async () => principal(AuthRole.ADMIN, [], true) } as unknown as AuthService);
  await assert.rejects(mustChange.canActivate(executionContext({ headers: { cookie: `taxi_session=${"a".repeat(43)}` } })), ForbiddenException);
  const missing = new AuthenticationGuard(new Reflector(), { authenticate: async () => null } as unknown as AuthService);
  await assert.rejects(missing.canActivate(executionContext({ headers: {} })), UnauthorizedException);
  assert.equal(calls, 0);
});

test("execution POST is strict, no-store, returns safe result, and maps all zero-delete conflicts", async () => {
  const headers = new Map<string, string>();
  const response = { setHeader: (name: string, value: string) => headers.set(name, value) };
  const body = { expectedCanonicalAnchor: safePlan.canonicalAnchor, expectedPolicyCutoff: safePlan.policyCutoff };
  const safeResult = { canonicalAnchor: safePlan.canonicalAnchor, policyCutoff: safePlan.policyCutoff, advancedCursorFloors: 0, advancedReplayCheckpoints: 0, completedReplayCheckpoints: 0, deletedCheckpoints: 0, deletedObservations: 0, moreCheckpointWork: false, moreObservationWork: false, stoppedByBudget: false, noWork: true } as const;
  let calls = 0;
  const controller = new PositionHistoryRetentionController({ executeRetention: async () => { calls += 1; return safeResult; } } as unknown as PositionHistoryRetentionService);
  const request = { auth: principal(AuthRole.ADMIN) } as AuthenticatedRequest;
  assert.deepEqual(await controller.executeRetention(request, body, response), safeResult);
  assert.equal(headers.get("Cache-Control"), "no-store");
  await assert.rejects(controller.executeRetention(request, { ...body, days: 365 }, response), (error) => error instanceof HttpException && error.getStatus() === 400);
  assert.equal(calls, 1);
  for (const code of ["LOCK_UNAVAILABLE", "ACTIVE_DURABLE_RUN", "STALE_PLAN"] as const) {
    const conflicting = new PositionHistoryRetentionController({ executeRetention: async () => { throw new PositionHistoryRetentionExecutionError(code); } } as unknown as PositionHistoryRetentionService);
    await assert.rejects(conflicting.executeRetention(request, body, response), (error) => error instanceof HttpException && error.getStatus() === 409 && (error.getResponse() as { error: string }).error === code);
  }
});

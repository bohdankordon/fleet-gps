import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException, HttpException, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthRole } from "../../generated/prisma/enums";
import { AuthenticationGuard } from "../auth/authentication.guard";
import type { AuthService } from "../auth/auth.service";
import { PermissionGuard } from "../auth/permission.guard";
import type { AuthenticatedPrincipal } from "../auth/auth.types";
import { PositionHistoryHorizonPopulationError } from "../position-history-horizon-population/position-history-horizon-population.error";
import type { PositionHistoryHorizonPopulationProgress } from "../position-history-horizon-population/position-history-horizon-population.types";
import { PositionHistoryHorizonExecutionController } from "./position-history-horizon-execution.controller";
import { PositionHistoryHorizonAlreadyRunningError } from "./position-history-horizon-execution-lock.service";
import { PositionHistoryHorizonExecutionFinalizationError, type PositionHistoryHorizonExecutionService } from "./position-history-horizon-execution.service";
import type { PositionHistoryHorizonExecutionResponse } from "./position-history-horizon-execution.types";

const exact = "2026-08-11T02:00:00.000Z";
const safeResult: PositionHistoryHorizonExecutionResponse = { to: exact, maxWindows: 24, excludeProviderDisabled: true, committedWindows: 4, providerRequests: 5, rowsReceived: 7, candidates: 6, inserted: 4, duplicates: 2, invalid: 1, retries: 1, rateLimits: 1, slicesTotal: 13, slicesVisited: 1, slicesAlreadyComplete: 0, providerDisabledExcluded: 2, stoppedByBudget: false, horizonComplete: false };
const handler = PositionHistoryHorizonExecutionController.prototype.populate;
function context(request: object) { return { getHandler: () => handler, getClass: () => PositionHistoryHorizonExecutionController, switchToHttp: () => ({ getRequest: () => request }) } as never; }
function principal(role: AuthRole, permissions: readonly string[] = [], mustChangePassword = false): AuthenticatedPrincipal { return { id: "00000000-0000-4000-8000-000000000001", login: "operator", role, permissions: permissions as AuthenticatedPrincipal["permissions"], mustChangePassword, sessionTokenHash: new Uint8Array(32) }; }
const authenticatedRequest = { headers: {}, auth: principal(AuthRole.USER, ["historyAdmin.populate"]) };

test("endpoint metadata authorizes populate permission and ADMIN but rejects view-only USER", () => {
  const guard = new PermissionGuard(new Reflector());
  assert.throws(() => guard.canActivate(context({ auth: principal(AuthRole.USER, ["historyAdmin.view"]) })), ForbiddenException);
  assert.equal(guard.canActivate(context({ auth: principal(AuthRole.USER, ["historyAdmin.view", "historyAdmin.populate"]) })), true);
  assert.equal(guard.canActivate(context({ auth: principal(AuthRole.ADMIN) })), true);
});

test("route authentication rejects missing, disabled/revoked, and must-change sessions before execution", async () => {
  const missing = new AuthenticationGuard(new Reflector(), { authenticate: async () => { throw new Error("not called"); } } as unknown as AuthService);
  await assert.rejects(missing.canActivate(context({ headers: {} })), UnauthorizedException);
  const disabled = new AuthenticationGuard(new Reflector(), { authenticate: async () => null } as unknown as AuthService);
  await assert.rejects(disabled.canActivate(context({ headers: { cookie: `taxi_session=${"a".repeat(43)}` } })), UnauthorizedException);
  const mustChange = new AuthenticationGuard(new Reflector(), { authenticate: async () => principal(AuthRole.USER, ["historyAdmin.populate"], true) } as unknown as AuthService);
  await assert.rejects(mustChange.canActivate(context({ headers: { cookie: `taxi_session=${"a".repeat(43)}` } })), ForbiddenException);
});

test("strict invalid bodies execute no work while valid fields pass server-derived actor and set no-store", async () => {
  const calls: unknown[][] = [];
  const headers = new Map<string, string>();
  const controller = new PositionHistoryHorizonExecutionController({ run: async (...args: unknown[]) => { calls.push(args); return safeResult; } } as unknown as PositionHistoryHorizonExecutionService);
  const response = { setHeader: (name: string, value: string) => headers.set(name, value) };
  for (const body of [{ to: exact, maxWindows: 1, excludeProviderDisabled: true }, { to: exact, maxWindows: 24 }, { to: exact, maxWindows: 24, excludeProviderDisabled: true, actorUserId: "browser" }]) {
    await assert.rejects(controller.populate(authenticatedRequest, body, response), (error) => error instanceof HttpException && error.getStatus() === 400);
  }
  assert.equal(calls.length, 0);
  assert.equal(await controller.populate(authenticatedRequest, { to: exact, maxWindows: 24, excludeProviderDisabled: true }, response), safeResult);
  assert.equal(calls.length, 1);
  assert.equal((calls[0]?.[0] as { requestedTo: string }).requestedTo, exact);
  assert.deepEqual(calls[0]?.[1], { actorType: "USER", actorUserId: authenticatedRequest.auth.id, actorLoginSnapshot: authenticatedRequest.auth.login });
  assert.equal(headers.get("Cache-Control"), "no-store");
});

test("lock conflict and runner failure retain their existing safe product errors", async () => {
  const response = { setHeader: () => undefined };
  const body = { to: exact, maxWindows: 6, excludeProviderDisabled: false };
  const conflict = new PositionHistoryHorizonExecutionController({ run: async () => { throw new PositionHistoryHorizonAlreadyRunningError(); } } as unknown as PositionHistoryHorizonExecutionService);
  await assert.rejects(conflict.populate(authenticatedRequest, body, response), (error) => error instanceof HttpException && error.getStatus() === 409 && JSON.stringify(error.getResponse()).includes("HISTORY_POPULATION_ALREADY_RUNNING"));
  const progress = { horizonFrom: new Date(), horizonTo: new Date(), policyDays: 90, slicesTotal: 13, slicesVisited: 0, slicesAlreadyComplete: 0, providerDisabledExcluded: 0, windowsRequested: 0, providerRequests: 0, providerRows: 0, candidates: 0, inserted: 0, duplicates: 0, invalid: 0, retries: 0, rateLimitResponses: 0, stoppedByBudget: false, horizonComplete: false, currentSliceFrom: null, currentSliceTo: null } satisfies PositionHistoryHorizonPopulationProgress;
  const failed = new PositionHistoryHorizonExecutionController({ run: async () => { throw new PositionHistoryHorizonPopulationError(progress, new Error("token=provider-secret raw payload coordinates")); } } as unknown as PositionHistoryHorizonExecutionService);
  await assert.rejects(failed.populate(authenticatedRequest, body, response), (error) => {
    if (!(error instanceof HttpException) || error.getStatus() !== 502) return false;
    const publicBody = JSON.stringify(error.getResponse());
    return (error.getResponse() as { partialWorkMayHavePersisted?: unknown }).partialWorkMayHavePersisted === true && !publicBody.includes("provider-secret") && !publicBody.includes("coordinates");
  });
});

test("post-commit audit finalization failure maps to the safe ambiguous partial-work response", async () => {
  const response = { setHeader: () => undefined };
  const controller = new PositionHistoryHorizonExecutionController({ run: async () => { throw new PositionHistoryHorizonExecutionFinalizationError(); } } as unknown as PositionHistoryHorizonExecutionService);
  await assert.rejects(controller.populate(authenticatedRequest, { to: exact, maxWindows: 6, excludeProviderDisabled: false }, response), (error) => {
    if (!(error instanceof HttpException) || error.getStatus() !== 502) return false;
    const publicBody = error.getResponse() as { error?: unknown; partialWorkMayHavePersisted?: unknown };
    const serialized = JSON.stringify(publicBody);
    return publicBody.error === "HISTORY_POPULATION_FAILED"
      && publicBody.partialWorkMayHavePersisted === true
      && !serialized.includes("AuditEvent")
      && !serialized.includes("Prisma")
      && !serialized.includes("SQL")
      && !serialized.includes("audit failure")
      && !serialized.includes("provider-secret");
  });
});

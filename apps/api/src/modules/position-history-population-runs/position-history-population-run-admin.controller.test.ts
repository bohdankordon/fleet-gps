import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException, HttpException, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthRole, PositionHistoryPopulationRunInitiatorType, PositionHistoryPopulationRunStatus } from "../../generated/prisma/client";
import { AuthenticationGuard } from "../auth/authentication.guard";
import type { AuthService } from "../auth/auth.service";
import { PermissionGuard } from "../auth/permission.guard";
import type { AuthenticatedPrincipal } from "../auth/auth.types";
import { PositionHistoryPopulationRunAdminController } from "./position-history-population-run-admin.controller";
import type { PositionHistoryPopulationRunAdminService } from "./position-history-population-run-admin.service";
import { PositionHistoryPopulationRunConflictError } from "./position-history-population-run.errors";

const actor = "00000000-0000-4000-8000-000000000001";
const safe = { id: "00000000-0000-4000-8000-000000000123", status: PositionHistoryPopulationRunStatus.PENDING, initiatorType: PositionHistoryPopulationRunInitiatorType.USER, to: "2026-08-11T02:00:00.000Z", excludeProviderDisabled: true, windowBudget: 1000, committedWindows: 0, createdAt: "2026-08-13T10:00:00.000Z", startedAt: null, finishedAt: null, failureCategory: null } as const;
function principal(role: AuthRole, permissions: readonly string[] = [], mustChangePassword = false): AuthenticatedPrincipal { return { id: actor, login: "operator", role, permissions: permissions as AuthenticatedPrincipal["permissions"], mustChangePassword, sessionTokenHash: new Uint8Array(32) }; }
function context(handler: object, request: object) { return { getHandler: () => handler, getClass: () => PositionHistoryPopulationRunAdminController, switchToHttp: () => ({ getRequest: () => request }) } as never; }

test("create requires populate, while active/recent require view; ADMIN retains full authority", () => {
  const guard = new PermissionGuard(new Reflector());
  assert.throws(() => guard.canActivate(context(PositionHistoryPopulationRunAdminController.prototype.create, { auth: principal(AuthRole.USER, ["historyAdmin.view"]) })), ForbiddenException);
  assert.equal(guard.canActivate(context(PositionHistoryPopulationRunAdminController.prototype.create, { auth: principal(AuthRole.USER, ["historyAdmin.populate"]) })), true);
  assert.equal(guard.canActivate(context(PositionHistoryPopulationRunAdminController.prototype.create, { auth: principal(AuthRole.ADMIN) })), true);
  for (const handler of [PositionHistoryPopulationRunAdminController.prototype.active, PositionHistoryPopulationRunAdminController.prototype.recent]) {
    assert.equal(guard.canActivate(context(handler, { auth: principal(AuthRole.USER, ["historyAdmin.view"]) })), true);
    assert.equal(guard.canActivate(context(handler, { auth: principal(AuthRole.USER, ["historyAdmin.view", "historyAdmin.populate"]) })), true);
    assert.equal(guard.canActivate(context(handler, { auth: principal(AuthRole.ADMIN) })), true);
  }
});

test("authentication rejects absent/revoked and must-change sessions before creation", async () => {
  let creates = 0;
  const request = { headers: {} as { cookie?: string } };
  const missing = new AuthenticationGuard(new Reflector(), { authenticate: async () => null } as unknown as AuthService);
  await assert.rejects(missing.canActivate(context(PositionHistoryPopulationRunAdminController.prototype.create, request)), UnauthorizedException);
  request.headers.cookie = `taxi_session=${"a".repeat(43)}`;
  await assert.rejects(missing.canActivate(context(PositionHistoryPopulationRunAdminController.prototype.create, request)), UnauthorizedException);
  const mustChange = new AuthenticationGuard(new Reflector(), { authenticate: async () => principal(AuthRole.USER, ["historyAdmin.populate"], true) } as unknown as AuthService);
  await assert.rejects(mustChange.canActivate(context(PositionHistoryPopulationRunAdminController.prototype.create, request)), ForbiddenException);
  assert.equal(creates, 0);
});

test("controller passes authenticated identity, rejects spoofing, returns no-store and safely maps conflict", async () => {
  const calls: unknown[] = []; const headers = new Map<string, string>();
  const service = { create: async (actorValue: unknown, body: unknown) => { calls.push({ actorValue, body }); return safe; }, active: async () => safe, recent: async () => [] } as unknown as PositionHistoryPopulationRunAdminService;
  const controller = new PositionHistoryPopulationRunAdminController(service);
  const response = { setHeader: (name: string, value: string) => headers.set(name, value) };
  const request = { auth: principal(AuthRole.ADMIN), headers: {} };
  assert.equal(await controller.create(request, { to: safe.to, windowBudget: 1000, excludeProviderDisabled: true }, response), safe);
  assert.deepEqual((calls[0] as { actorValue: unknown }).actorValue, { actorType: "USER", actorUserId: actor, actorLoginSnapshot: "operator" }); assert.equal(headers.get("Cache-Control"), "no-store");
  for (const spoof of [{ initiatorType: "SYSTEM" }, { requestedByUserId: "other" }]) await assert.rejects(controller.create(request, { to: safe.to, windowBudget: 1000, excludeProviderDisabled: true, ...spoof }, response), (error) => error instanceof HttpException && error.getStatus() === 400);
  assert.equal(calls.length, 1);
  const conflict = new PositionHistoryPopulationRunAdminController({ create: async () => { throw new PositionHistoryPopulationRunConflictError(); } } as unknown as PositionHistoryPopulationRunAdminService);
  await assert.rejects(conflict.create(request, { to: safe.to, windowBudget: 500, excludeProviderDisabled: false }, response), (error) => error instanceof HttpException && error.getStatus() === 409 && JSON.stringify(error.getResponse()).includes("HISTORY_DURABLE_POPULATION_ALREADY_RUNNING"));
});

test("active/recent reads do not invoke creation or worker paths", async () => {
  let reads = 0;
  const service = { active: async () => { reads += 1; return null; }, recent: async () => { reads += 1; return []; }, create: async () => { throw new Error("not called"); } } as unknown as PositionHistoryPopulationRunAdminService;
  const controller = new PositionHistoryPopulationRunAdminController(service); const response = { setHeader: () => undefined };
  assert.equal(await controller.active(response), null); assert.deepEqual(await controller.recent(response), []); assert.equal(reads, 2);
});

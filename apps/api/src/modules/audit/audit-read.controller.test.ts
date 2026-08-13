import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException, HttpException, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthRole } from "../../generated/prisma/enums";
import type { AuthService } from "../auth/auth.service";
import { AuthenticationGuard } from "../auth/authentication.guard";
import { PermissionGuard } from "../auth/permission.guard";
import { PERMISSIONS } from "../auth/permissions";
import type { AuthenticatedPrincipal } from "../auth/auth.types";
import { AuditReadController } from "./audit-read.controller";
import type { AuditReadService } from "./audit-read.service";

const handler = AuditReadController.prototype.list;
function principal(role: AuthRole, mustChangePassword = false): AuthenticatedPrincipal { return { id: "00000000-0000-4000-8000-000000000001", login: "operator", role, permissions: role === AuthRole.USER ? PERMISSIONS : [], mustChangePassword, sessionTokenHash: new Uint8Array(32) }; }
function context(request: object) { return { getHandler: () => handler, getClass: () => AuditReadController, switchToHttp: () => ({ getRequest: () => request }) } as never; }

test("unauthenticated, revoked, must-change, USER, and fully-permitted USER are denied before query", async () => {
  let queryCalls = 0;
  void new AuditReadController({ list: async () => { queryCalls += 1; return { items: [], nextCursor: null, hasMore: false }; } } as unknown as AuditReadService);
  const missing = new AuthenticationGuard(new Reflector(), { authenticate: async () => null } as unknown as AuthService);
  await assert.rejects(missing.canActivate(context({ headers: {} })), UnauthorizedException);
  await assert.rejects(missing.canActivate(context({ headers: { cookie: `taxi_session=${"a".repeat(43)}` } })), UnauthorizedException);
  const mustChange = new AuthenticationGuard(new Reflector(), { authenticate: async () => principal(AuthRole.ADMIN, true) } as unknown as AuthService);
  await assert.rejects(mustChange.canActivate(context({ headers: { cookie: `taxi_session=${"a".repeat(43)}` } })), ForbiddenException);
  const permissions = new PermissionGuard(new Reflector());
  assert.throws(() => permissions.canActivate(context({ auth: principal(AuthRole.USER) })), ForbiddenException);
  assert.equal(queryCalls, 0);
});

test("ADMIN is authorized and receives the no-store read response", async () => {
  assert.equal(new PermissionGuard(new Reflector()).canActivate(context({ auth: principal(AuthRole.ADMIN) })), true);
  let calls = 0;
  const headers = new Map<string, string>();
  const controller = new AuditReadController({ list: async () => { calls += 1; return { items: [], nextCursor: null, hasMore: false }; } } as unknown as AuditReadService);
  assert.deepEqual(await controller.list({}, { setHeader: (name, value) => headers.set(name, value) }), { items: [], nextCursor: null, hasMore: false });
  assert.equal(calls, 1);
  assert.equal(headers.get("Cache-Control"), "no-store");
});

test("controller maps malformed queries and internal failures to stable safe responses", async () => {
  const response = { setHeader: () => undefined };
  const controller = new AuditReadController({ list: async () => { throw new Error("private Prisma SQL password"); } } as unknown as AuditReadService);
  await assert.rejects(controller.list({ limit: "50" }, response), (error) => error instanceof HttpException && error.getStatus() === 400 && JSON.stringify(error.getResponse()) === JSON.stringify({ statusCode: 400, error: "Bad Request" }));
  await assert.rejects(controller.list({}, response), (error) => error instanceof HttpException && error.getStatus() === 500 && !JSON.stringify(error.getResponse()).includes("private"));
});

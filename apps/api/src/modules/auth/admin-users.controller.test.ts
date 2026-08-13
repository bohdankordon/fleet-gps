import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthRole } from "../../generated/prisma/enums";
import { AuthenticationGuard } from "./authentication.guard";
import { PermissionGuard } from "./permission.guard";
import type { AuthService } from "./auth.service";
import type { AuthenticatedPrincipal } from "./auth.types";
import { resolvePermissions } from "./permissions";

const handler = (() => { class AdminUsersController { public async disable(): Promise<void> {} } return AdminUsersController.prototype.disable; })();
function principal(role: AuthRole): AuthenticatedPrincipal {
  return { id: "00000000-0000-4000-8000-000000000001", login: "operator", role, permissions: role === AuthRole.USER ? resolvePermissions(["historyAdmin.view"]) : [], mustChangePassword: false, sessionTokenHash: new Uint8Array(32) };
}
function context(request: object) { return { getHandler: () => handler, getClass: () => (() => {}), switchToHttp: () => ({ getRequest: () => request }) } as never; }

test("unauthenticated and revoked disable requests are rejected before the service can audit", async () => {
  let calls = 0;
  const guard = new AuthenticationGuard(new Reflector(), { authenticate: async () => { calls += 1; return null; } } as unknown as AuthService);
  await assert.rejects(guard.canActivate(context({ headers: {} })), UnauthorizedException);
  await assert.rejects(guard.canActivate(context({ headers: { cookie: `taxi_session=${"a".repeat(43)}` } })), UnauthorizedException);
  assert.equal(calls, 1);
});

test("non-ADMIN disable requests are forbidden before the service can audit", () => {
  const guard = new PermissionGuard(new Reflector());
  assert.throws(() => guard.canActivate(context({ auth: principal(AuthRole.USER) })), ForbiddenException);
});

test("ADMIN disable requests pass the permission guard", () => {
  assert.equal(new PermissionGuard(new Reflector()).canActivate(context({ auth: principal(AuthRole.ADMIN) })), true);
});

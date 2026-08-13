import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthRole } from "../../generated/prisma/enums";
import { AUTH_ADMIN_ONLY, AUTHENTICATED_ONLY, AUTH_PERMISSIONS } from "./auth.decorators";
import { PermissionGuard } from "./permission.guard";
function context(principal: object) { return { getHandler: () => function handler() {}, getClass: () => class Controller {}, switchToHttp: () => ({ getRequest: () => ({ auth: principal }) }) } as never; }
test("USER needs an assigned permission while ADMIN bypasses rows", () => { const reflector = { getAllAndOverride: (key: string) => key === AUTH_PERMISSIONS ? ["fleet.view"] : false } as unknown as Reflector; const guard = new PermissionGuard(reflector); assert.throws(() => guard.canActivate(context({ role: AuthRole.USER, permissions: [] })), ForbiddenException); assert.equal(guard.canActivate(context({ role: AuthRole.USER, permissions: ["fleet.view"] })), true); assert.equal(guard.canActivate(context({ role: AuthRole.ADMIN, permissions: [] })), true); });
test("authenticated-only account routes need no product permission", () => { const reflector = { getAllAndOverride: (key: string) => key === AUTHENTICATED_ONLY } as unknown as Reflector; assert.equal(new PermissionGuard(reflector).canActivate(context({ role: AuthRole.USER, permissions: [] })), true); });
test("admin-only routes reject USER regardless of product permissions", () => { const reflector = { getAllAndOverride: (key: string) => key === AUTH_ADMIN_ONLY } as unknown as Reflector; const guard = new PermissionGuard(reflector); assert.throws(() => guard.canActivate(context({ role: AuthRole.USER, permissions: ["historyAdmin.populate"] })), ForbiddenException); assert.equal(guard.canActivate(context({ role: AuthRole.ADMIN, permissions: [] })), true); });

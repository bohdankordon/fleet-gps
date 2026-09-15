import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthRole } from "../../generated/prisma/enums";
import { PermissionGuard } from "../auth/permission.guard";
import type { AuthenticatedPrincipal } from "../auth/auth.types";
import { VehicleGroupsController } from "./vehicle-groups.controller";

function principal(role: AuthRole): AuthenticatedPrincipal {
  return { id: "00000000-0000-4000-8000-000000000001", login: "operator", role, permissions: [], mustChangePassword: false, sessionTokenHash: new Uint8Array(32) };
}

function context(role: AuthRole) {
  return { getHandler: () => VehicleGroupsController.prototype.list, getClass: () => VehicleGroupsController, switchToHttp: () => ({ getRequest: () => ({ auth: principal(role) }) }) } as never;
}

test("vehicle group administration is ADMIN-only", () => {
  const guard = new PermissionGuard(new Reflector());
  assert.throws(() => guard.canActivate(context(AuthRole.USER)), ForbiddenException);
  assert.equal(guard.canActivate(context(AuthRole.ADMIN)), true);
});

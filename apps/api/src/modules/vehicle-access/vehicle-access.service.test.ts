import assert from "node:assert/strict";
import test from "node:test";
import { AuthRole, VehicleAccessMode } from "../../generated/prisma/enums";
import type { DatabaseService } from "../database/database.service";
import { applyVehicleScope, selectedVehicleWhere, VehicleScopeService, VehicleScopeSubjectNotFoundError } from "./vehicle-access.service";

const userId = "00000000-0000-4000-8000-000000000001";
const vehicleId = "00000000-0000-4000-8000-000000000002";

function service(role: AuthRole | null, mode: VehicleAccessMode = VehicleAccessMode.ALL, count = 0) {
  const queries: unknown[] = [];
  const client = {
    authUser: { findUnique: async () => role === null ? null : ({ role, vehicleAccessMode: mode }) },
    vehicle: { count: async (query: unknown) => { queries.push(query); return count; } },
  };
  return { authority: new VehicleScopeService({ getClient: () => client } as unknown as DatabaseService), queries };
}

test("ADMIN and USER + ALL resolve to unrestricted scope", async () => {
  assert.deepEqual(await service(AuthRole.ADMIN, VehicleAccessMode.SELECTED).authority.resolve(userId), { kind: "UNRESTRICTED" });
  assert.deepEqual(await service(AuthRole.USER, VehicleAccessMode.ALL).authority.resolve(userId), { kind: "UNRESTRICTED" });
});

test("USER + SELECTED has one canonical group-or-direct relational predicate", async () => {
  const scope = await service(AuthRole.USER, VehicleAccessMode.SELECTED).authority.resolve(userId);
  assert.deepEqual(scope, { kind: "FILTERED", where: selectedVehicleWhere(userId) });
  assert.deepEqual(scope.kind === "FILTERED" ? scope.where : null, {
    OR: [
      { accessGrants: { some: { userId } } },
      { group: { is: { userGrants: { some: { userId } } } } },
    ],
  });
});

test("scope composition and point checks use the same authority", async () => {
  const fixture = service(AuthRole.USER, VehicleAccessMode.SELECTED, 1);
  assert.equal(await fixture.authority.canAccess(userId, vehicleId), true);
  assert.deepEqual(fixture.queries, [{ where: applyVehicleScope({ kind: "FILTERED", where: selectedVehicleWhere(userId) }, { id: vehicleId }) }]);
  assert.deepEqual(applyVehicleScope({ kind: "UNRESTRICTED" }, { disabled: false }), { disabled: false });
});

test("missing scope subjects fail closed", async () => {
  await assert.rejects(service(null).authority.resolve(userId), VehicleScopeSubjectNotFoundError);
});

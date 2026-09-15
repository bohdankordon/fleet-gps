import assert from "node:assert/strict";
import test from "node:test";
import type { DatabaseService } from "../database/database.service";
import { VehicleGroupsService } from "./vehicle-groups.service";

test("admin vehicle projection lists every vehicle with its group assignment", async () => {
  let args: unknown;
  const rows = [
    { id: "b", name: "Beta", disabled: true, groupId: null },
    { id: "a", name: "Alpha", disabled: false, groupId: "00000000-0000-4000-8000-000000000001" },
  ];
  const client = { vehicle: { findMany: async (value: unknown) => { args = value; return rows; } } };
  const service = new VehicleGroupsService({ getClient: () => client } as unknown as DatabaseService, {} as never);
  assert.deepEqual(await service.listVehiclesForAdmin(), rows);
  assert.deepEqual(args, { orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, name: true, disabled: true, groupId: true } });
  const serialized = JSON.stringify(args);
  for (const forbidden of ["externalDeviceId", "create", "update", "delete"]) assert.equal(serialized.includes(forbidden), false);
});

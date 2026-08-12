import assert from "node:assert/strict";
import test from "node:test";
import { isPermission, PERMISSIONS, resolvePermissions } from "./permissions";
test("registry recognizes only source-controlled keys", () => { assert.equal(PERMISSIONS.length, 8); assert.equal(isPermission("fleet.view"), true); assert.equal(isPermission("unknown.permission"), false); assert.deepEqual(resolvePermissions(["unknown.permission"]), []); });
test("permission dependencies are applied without inventing additional grants", () => { assert.deepEqual(resolvePermissions(["trips.view"]), ["vehicles.view", "trips.view"]); assert.deepEqual(resolvePermissions(["historyAdmin.populate"]), ["historyAdmin.view", "historyAdmin.populate"]); });

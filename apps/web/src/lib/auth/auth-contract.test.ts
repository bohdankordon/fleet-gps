import assert from "node:assert/strict";
import test from "node:test";
import { hasPermission, landingFor, parseAuthUser } from "./auth-contract";
const user = (permissions: string[] = [], mustChangePassword = false) => parseAuthUser({ id: "id", login: "user", role: "USER", permissions, mustChangePassword })!;
test("landing uses deterministic permission order and safe no-access fallback", () => { assert.equal(landingFor(user(["events.view", "map.view"])), "/map"); assert.equal(landingFor(user([])), "/account/no-access"); assert.equal(landingFor(user(["fleet.view"], true)), "/account/change-password"); });
test("ADMIN has all effective UI permissions and unknown keys fail parsing", () => { const admin = parseAuthUser({ id: "id", login: "admin", role: "ADMIN", permissions: [], mustChangePassword: false })!; assert.equal(hasPermission(admin, "historyAdmin.view"), true); assert.equal(parseAuthUser({ id: "id", login: "x", role: "USER", permissions: ["unknown"], mustChangePassword: false }), null); });

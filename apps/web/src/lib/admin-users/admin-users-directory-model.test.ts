import assert from "node:assert/strict";
import test from "node:test";
import type { AdminManagedUser } from "./admin-users-contract";
import { adminUserAuthoritySummary, EMPTY_ADMIN_USERS_QUERY, filterAdminUsers, hasAdminUsersQuery, parseAdminUsersQuery, serializeAdminUsersQuery } from "./admin-users-directory-model";

const admin: AdminManagedUser = { id: "admin-id", login: "owner", role: "ADMIN", disabled: false, mustChangePassword: false, permissions: [], telegramStatus: "CONNECTED", createdAt: "2026-08-01T10:00:00Z", updatedAt: "2026-09-01T10:00:00Z" };
const operator: AdminManagedUser = { id: "operator-id", login: "operator", role: "USER", disabled: false, mustChangePassword: true, permissions: ["fleet.view", "map.view", "vehicles.view", "trips.view", "reports.view"], telegramStatus: "NOT_CONNECTED", createdAt: "2026-08-02T10:00:00Z", updatedAt: "2026-09-02T10:00:00Z" };
const disabled: AdminManagedUser = { ...operator, id: "disabled-id", login: "former", disabled: true, mustChangePassword: false, permissions: [], telegramStatus: "BROKEN" };
const users = [admin, operator, disabled];

test("query parsing and serialization keep only q role and state with no paging", () => {
  assert.deepEqual(parseAdminUsersQuery({ q: " operator ", role: "USER", state: "ACTIVE", page: "4" }), { q: "operator", role: "USER", state: "ACTIVE" });
  assert.deepEqual(parseAdminUsersQuery({ role: "OWNER", state: "RISK" }), EMPTY_ADMIN_USERS_QUERY);
  assert.equal(serializeAdminUsersQuery({ q: "operator", role: "USER", state: "PASSWORD_CHANGE_REQUIRED" }), "q=operator&role=USER&state=PASSWORD_CHANGE_REQUIRED");
  assert.equal(serializeAdminUsersQuery(EMPTY_ADMIN_USERS_QUERY), "");
});

test("authority summary is utilitarian and distinguishes ADMIN from selected USER permissions", () => {
  assert.equal(adminUserAuthoritySummary(admin, "en"), "Full administrative authority");
  assert.equal(adminUserAuthoritySummary(operator, "en"), "Permissions: 5");
  assert.equal(adminUserAuthoritySummary(disabled, "en"), "No access");
});

test("local search and factual role and state filters use readable data", () => {
  assert.deepEqual(filterAdminUsers(users, { ...EMPTY_ADMIN_USERS_QUERY, q: "vehicles" }, "en").map((user) => user.login), ["operator"]);
  assert.deepEqual(filterAdminUsers(users, { ...EMPTY_ADMIN_USERS_QUERY, q: "administrator" }, "en").map((user) => user.login), ["owner"]);
  assert.deepEqual(filterAdminUsers(users, { ...EMPTY_ADMIN_USERS_QUERY, role: "USER", state: "DISABLED" }, "en").map((user) => user.login), ["former"]);
  assert.deepEqual(filterAdminUsers(users, { ...EMPTY_ADMIN_USERS_QUERY, state: "PASSWORD_CHANGE_REQUIRED" }, "en").map((user) => user.login), ["operator"]);
  assert.equal(hasAdminUsersQuery(EMPTY_ADMIN_USERS_QUERY), false);
  assert.equal(hasAdminUsersQuery({ ...EMPTY_ADMIN_USERS_QUERY, role: "ADMIN" }), true);
});

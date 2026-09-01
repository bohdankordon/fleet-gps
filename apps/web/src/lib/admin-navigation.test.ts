import assert from "node:assert/strict";
import test from "node:test";
import { activeAdminNavigationPath, adminNavigationFor } from "./admin-navigation";

test("ADMIN sees Audit while USER with every permission never does", () => {
  const admin = { id: "a", login: "admin", role: "ADMIN", permissions: [], mustChangePassword: false } as const;
  const user = { id: "u", login: "user", role: "USER", permissions: ["fleet.view", "map.view", "events.view", "vehicles.view", "trips.view", "reports.view", "historyAdmin.view", "historyAdmin.populate"], mustChangePassword: false } as const;
  assert.equal(adminNavigationFor(admin).some((item) => item.href === "/admin/audit" && item.label === "Аудит"), true);
  assert.equal(adminNavigationFor(user).some((item) => item.href === "/admin/audit"), false);
  assert.equal(adminNavigationFor(user).some((item) => item.href === "/admin/history"), true);
});

test("administration children remain permission-filtered and select only their own nested routes", () => {
  const admin = { id: "a", login: "admin", role: "ADMIN", permissions: [], mustChangePassword: false } as const;
  const historyUser = { id: "u", login: "user", role: "USER", permissions: ["historyAdmin.view"], mustChangePassword: false } as const;
  const adminItems = adminNavigationFor(admin, "en");
  assert.deepEqual(adminItems.map((item) => item.href), ["/admin/users", "/admin/settings", "/admin/audit", "/admin/history"]);
  assert.equal(activeAdminNavigationPath(adminItems, "/admin/users/user-1"), "/admin/users");
  assert.equal(activeAdminNavigationPath(adminItems, "/admin/settings"), "/admin/settings");
  assert.equal(activeAdminNavigationPath(adminItems, "/admin/history"), "/admin/history");
  assert.deepEqual(adminNavigationFor(historyUser, "en").map((item) => item.href), ["/admin/history"]);
});

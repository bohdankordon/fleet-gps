import assert from "node:assert/strict";
import test from "node:test";
import { adminNavigationFor } from "./admin-navigation";

test("ADMIN sees Audit while USER with every permission never does", () => {
  const admin = { id: "a", login: "admin", role: "ADMIN", permissions: [], mustChangePassword: false } as const;
  const user = { id: "u", login: "user", role: "USER", permissions: ["fleet.view", "map.view", "events.view", "vehicles.view", "trips.view", "reports.view", "historyAdmin.view", "historyAdmin.populate"], mustChangePassword: false } as const;
  assert.equal(adminNavigationFor(admin).some((item) => item.href === "/admin/audit" && item.label === "Аудит"), true);
  assert.equal(adminNavigationFor(user).some((item) => item.href === "/admin/audit"), false);
  assert.equal(adminNavigationFor(user).some((item) => item.href === "/admin/history"), true);
});

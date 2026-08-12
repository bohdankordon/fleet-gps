import assert from "node:assert/strict";
import test from "node:test";
import { APP_NAVIGATION, isActiveAppNavigationPath } from "./app-navigation";
test("navigation exposes one global administration destination with nested active behavior", () => { assert.deepEqual(APP_NAVIGATION, [{ href: "/", label: "Автопарк" }, { href: "/map", label: "Карта" }, { href: "/events", label: "События" }, { href: "/reports", label: "Отчёты" }, { href: "/admin/history", label: "Администрирование" }]); assert.equal(isActiveAppNavigationPath("/admin/history", "/admin/history"), true); assert.equal(isActiveAppNavigationPath("/", "/admin/history"), false); });

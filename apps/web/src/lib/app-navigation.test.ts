import assert from "node:assert/strict";
import test from "node:test";
import { APP_NAVIGATION, isActiveAppNavigationPath } from "./app-navigation";
test("navigation exposes fleet, map, events, and reports with exact active behavior", () => { assert.deepEqual(APP_NAVIGATION, [{ href: "/", label: "Автопарк" }, { href: "/map", label: "Карта" }, { href: "/events", label: "События" }, { href: "/reports", label: "Отчёты" }]); assert.equal(isActiveAppNavigationPath("/reports", "/reports"), true); assert.equal(isActiveAppNavigationPath("/", "/reports"), false); });

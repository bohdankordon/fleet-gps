import assert from "node:assert/strict";
import test from "node:test";
import { APP_NAVIGATION, isActiveAppNavigationPath } from "./app-navigation";
test("navigation exposes fleet, map, and events routes with exact active behavior", () => { assert.deepEqual(APP_NAVIGATION, [{ href: "/", label: "Автопарк" }, { href: "/map", label: "Карта" }, { href: "/events", label: "События" }]); assert.equal(isActiveAppNavigationPath("/map", "/map"), true); assert.equal(isActiveAppNavigationPath("/", "/map"), false); });

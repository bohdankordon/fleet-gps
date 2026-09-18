import assert from "node:assert/strict";
import test from "node:test";
import { activeAlertDetails } from "./open-alert-map-formatters";

test("details model represents no alert, SPEEDING, and both active types without IDs", () => {
  assert.deepEqual(activeAlertDetails([], "ru"), []);
  assert.deepEqual(activeAlertDetails([{ type: "SPEEDING", openedAt: "2026-08-10T10:00:00.000Z" }], "ru"), [{ type: "SPEEDING", label: "Превышение скорости", openedAt: "2026-08-10T10:00:00.000Z" }]);
  assert.deepEqual(activeAlertDetails([{ type: "SPEEDING", openedAt: "2026-08-10T10:00:00.000Z" }, { type: "INACTIVITY", openedAt: "2026-08-10T11:00:00.000Z" }], "ru").map((item) => item.label), ["Превышение скорости", "Неактивность"]);
});

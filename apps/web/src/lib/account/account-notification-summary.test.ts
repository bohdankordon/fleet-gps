import assert from "node:assert/strict";
import test from "node:test";
import { parseAccountNotificationSummary, readAccountNotificationSummary } from "./account-notification-summary";

const upstream = (status = "CONNECTED") => ({
  status,
  pendingExpiresAt: null,
  telegramChatId: "must-not-survive",
  telegramUserId: "must-not-survive",
  tokenHash: "must-not-survive",
  preferences: {
    enabled: true,
    speedingEnabled: true,
    inactivityEnabled: false,
    vehicleScope: "SELECTED",
    selectedVehicleIds: ["vehicle-secret-a", "vehicle-secret-b"],
    revision: 7,
    canSelectVehicles: true,
    vehicles: [{ id: "vehicle-secret-a", name: "Car", disabled: false }],
  },
});

test("safe Account summary keeps factual states and projects away identifiers and secrets", () => {
  for (const status of ["NOT_CONNECTED", "LINK_PENDING", "CONNECTED", "BROKEN"]) {
    const parsed = parseAccountNotificationSummary(upstream(status));
    assert.equal(parsed?.telegramStatus, status);
    assert.equal(parsed?.preferences.selectedVehicleCount, 2);
    const serialized = JSON.stringify(parsed);
    for (const sensitive of ["telegramChatId", "telegramUserId", "tokenHash", "vehicle-secret", "vehicles", "revision"]) assert.doesNotMatch(serialized, new RegExp(sensitive));
  }
});

test("failed, non-successful, and malformed reads stay unavailable instead of becoming defaults", async () => {
  const failed = await readAccountNotificationSummary(async () => { throw new Error("upstream details"); });
  const forbidden = await readAccountNotificationSummary(async () => Response.json({ status: "NOT_CONNECTED" }, { status: 403 }));
  const malformed = await readAccountNotificationSummary(async () => Response.json({ ...upstream(), preferences: { enabled: false } }));
  assert.deepEqual(failed, { availability: "unavailable" });
  assert.deepEqual(forbidden, { availability: "unavailable" });
  assert.deepEqual(malformed, { availability: "unavailable" });
  for (const state of [failed, forbidden, malformed]) assert.equal("summary" in state, false);
});

test("a valid read preserves master, event, and vehicle-scope facts", async () => {
  const state = await readAccountNotificationSummary(async () => Response.json(upstream("BROKEN")));
  assert.equal(state.availability, "available");
  assert.deepEqual(state.summary, {
    telegramStatus: "BROKEN",
    preferences: { enabled: true, speedingEnabled: true, inactivityEnabled: false, vehicleScope: "SELECTED", selectedVehicleCount: 2, canSelectVehicles: true },
  });
});

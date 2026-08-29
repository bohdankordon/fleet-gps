import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/components/telegram-notifications-panel.tsx", "utf8");
test("Telegram preferences keep connection separate and expose only the approved future-delivery controls", () => {
  for (const key of ["preferences.enabled", "preferences.speeding", "preferences.inactivity", "preferences.allVehicles", "preferences.selectedVehicles", "expectedRevision", "vehicleScope", "selectedVehicleIds", "setPreferenceError(\"conflict\")"]) assert.ok(source.includes(key), key);
  for (const forbidden of ["telegramUserId", "telegramChatId", "test notification", "quiet hours", "digest", "AlertNotificationDelivery"]) assert.equal(source.includes(forbidden), false, forbidden);
});

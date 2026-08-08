import assert from "node:assert/strict";
import test from "node:test";
import { alertEventsHistoryPath, shouldUpdateAlertEventsHistory } from "./alert-events-navigation";

test("events navigation uses /events filters and only user changes create history", () => {
  assert.equal(alertEventsHistoryPath({}), "/events"); assert.equal(alertEventsHistoryPath({ status: "OPEN", type: "INACTIVITY" }), "/events?status=OPEN&type=INACTIVITY");
  assert.equal(shouldUpdateAlertEventsHistory("user"), true); assert.equal(shouldUpdateAlertEventsHistory("popstate"), false); assert.equal(shouldUpdateAlertEventsHistory("refresh"), false); assert.equal(shouldUpdateAlertEventsHistory("retry"), false);
});

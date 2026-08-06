import assert from "node:assert/strict";
import test from "node:test";
import { validSchedulerStatus } from "./scheduler-fixture";
import { parseSchedulerRefreshPayload, schedulerInitialErrorLabel, schedulerRefreshUpdatesHistory, schedulerStateLabel } from "./scheduler-ui-model";

test("disabled scheduler has an explicit normal label", () => { assert.equal(schedulerStateLabel({ ...validSchedulerStatus, enabled: false }), "Отключено"); });
test("scheduler failure leaves dashboard render model available", () => { assert.equal(schedulerInitialErrorLabel(null), "Не удалось загрузить состояние обновления."); assert.equal(schedulerInitialErrorLabel(validSchedulerStatus), null); });
test("scheduler refresh does not create a history entry", () => { assert.equal(schedulerRefreshUpdatesHistory(), false); });
test("invalid scheduler refresh payload is rejected without exposing details", () => { assert.equal(parseSchedulerRefreshPayload({ enabled: true }), null); assert.deepEqual(parseSchedulerRefreshPayload(validSchedulerStatus), validSchedulerStatus); });

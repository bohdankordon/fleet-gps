import assert from "node:assert/strict";
import test from "node:test";
import { alertEventsListFixture } from "./alert-events-fixture";
import { appendAlertEventsPage, emptyAlertEventsMessage, replaceAlertEventsPage } from "./alert-events-ui-model";

test("pagination preserves first page, appends only new events, and adopts the new cursor", () => {
  const next = { items: [{ ...alertEventsListFixture.items[0] }, { ...alertEventsListFixture.items[0], id: "00000000-0000-4000-8000-000000000004" }], nextCursor: null };
  const appended = appendAlertEventsPage(alertEventsListFixture, next); assert.deepEqual(appended.items.map((item) => item.id), ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000004"]); assert.equal(appended.nextCursor, null);
  assert.deepEqual(replaceAlertEventsPage(next).items, next.items);
});
test("returns distinct empty messages for unfiltered and filtered pages", () => { assert.equal(emptyAlertEventsMessage(false).heading, "Событий пока нет"); assert.equal(emptyAlertEventsMessage(true).heading, "По выбранным фильтрам событий нет."); });

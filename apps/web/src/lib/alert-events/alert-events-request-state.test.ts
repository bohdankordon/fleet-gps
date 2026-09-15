import assert from "node:assert/strict";
import test from "node:test";
import { abortAlertEventsLoadMore, beginAlertEventsFirstPage, beginAlertEventsLoadMore, canLoadMoreAlertEvents, failAlertEventsFirstPage, failAlertEventsLoadMore, initialAlertEventsListState, isCurrentAlertEventsGeneration, sameAlertEventsFilters, succeedAlertEventsFirstPage, succeedAlertEventsLoadMore } from "./alert-events-request-state";
import { alertEventsListFixture } from "./alert-events-fixture";

test("aborting active load-more clears its loading state", () => {
  const active = beginAlertEventsLoadMore(initialAlertEventsListState(alertEventsListFixture, {}));
  assert.equal(active.moreLoading, true); assert.equal(abortAlertEventsLoadMore(active).moreLoading, false);
});

test("successful load-more retry clears only its own more error", () => {
  const failed = failAlertEventsLoadMore(initialAlertEventsListState(alertEventsListFixture, {}));
  const retried = beginAlertEventsLoadMore(failed); const succeeded = succeedAlertEventsLoadMore(retried, { items: [], nextCursor: null });
  assert.equal(failed.error, "more"); assert.equal(succeeded.error, null); assert.equal(succeeded.moreLoading, false);
});

test("filter change invalidates the old cursor and failed new first page cannot load it", () => {
  const changed = beginAlertEventsFirstPage(initialAlertEventsListState(alertEventsListFixture, {}), { status: "OPEN" });
  assert.equal(changed.paginationValid, false); assert.equal(canLoadMoreAlertEvents(changed), false);
  const failed = failAlertEventsFirstPage(changed);
  assert.equal(failed.data.nextCursor, null); assert.deepEqual(failed.data.items, []); assert.equal(failed.paginationValid, false); assert.equal(canLoadMoreAlertEvents(failed), false);
});

test("refresh failure for the same filters preserves successful rows and cursor", () => {
  const initial = initialAlertEventsListState(alertEventsListFixture, { status: "OPEN" }); const failed = failAlertEventsFirstPage(beginAlertEventsFirstPage(initial, { status: "OPEN" }));
  assert.deepEqual(failed.data, alertEventsListFixture); assert.equal(failed.paginationValid, true); assert.equal(canLoadMoreAlertEvents(failed), true);
});

test("stale request generations cannot replace a newer first-page result", () => {
  const newer = succeedAlertEventsFirstPage(initialAlertEventsListState(alertEventsListFixture, {}), { type: "INACTIVITY" }, { items: [], nextCursor: null });
  assert.equal(isCurrentAlertEventsGeneration(4, 5), false); assert.equal(isCurrentAlertEventsGeneration(5, 5), true); assert.equal(newer.filters.type, "INACTIVITY");
});

test("every context change clears old rows immediately, while same-context refresh keeps them", () => {
  const initial = initialAlertEventsListState(alertEventsListFixture, { status: "OPEN" });
  for (const filters of [{ status: "RESOLVED" as const }, { status: "OPEN" as const, vehicleId: "vehicle" }, { status: "OPEN" as const, type: "INACTIVITY" as const }, { status: "OPEN" as const, from: "2026-08-01" }]) {
    const loading = beginAlertEventsFirstPage(initial, filters); assert.deepEqual(loading.data, { items: [], nextCursor: null }); assert.equal(loading.loading, true);
  }
  assert.equal(beginAlertEventsFirstPage(initial, initial.filters).data, initial.data);
});
test("load-more appends without duplicate IDs within or across pages and errors keep all rows", () => {
  const initial = initialAlertEventsListState(alertEventsListFixture, {}); const extra = { ...alertEventsListFixture.items[0], id: "new" };
  const appended = succeedAlertEventsLoadMore(beginAlertEventsLoadMore(initial), { items: [alertEventsListFixture.items[0], extra, extra], nextCursor: "next" });
  assert.equal(appended.data.items.length, 2); assert.equal(appended.data.nextCursor, "next");
  assert.deepEqual(failAlertEventsLoadMore(appended).data, appended.data);
});
test("changing only the group filter invalidates first-page data and blocks stale load-more", () => {
  const groupId = "11111111-1111-4111-8111-111111111111";
  const initial = initialAlertEventsListState(alertEventsListFixture, {});
  assert.equal(sameAlertEventsFilters({}, { group: groupId }), false);
  assert.equal(sameAlertEventsFilters({ group: groupId }, { group: groupId }), true);
  assert.equal(sameAlertEventsFilters({ group: "ungrouped" }, {}), false);
  const changed = beginAlertEventsFirstPage(initial, { group: groupId });
  assert.deepEqual(changed.data, { items: [], nextCursor: null });
  assert.equal(changed.paginationValid, false);
  assert.equal(canLoadMoreAlertEvents({ ...initial, data: { items: [], nextCursor: "cursor" }, filters: { group: groupId } }), false);
  const succeeded = succeedAlertEventsFirstPage(initial, { group: groupId }, alertEventsListFixture);
  assert.equal(canLoadMoreAlertEvents({ ...succeeded, data: { items: [], nextCursor: "cursor" } }), true);
});
test("switching group retains mode, type and vehicle filter semantics", () => {
  const groupId = "11111111-1111-4111-8111-111111111111";
  assert.equal(sameAlertEventsFilters({ mode: "history", status: "RESOLVED", type: "INACTIVITY", vehicleId: "v", group: groupId }, { mode: "history", status: "RESOLVED", type: "INACTIVITY", vehicleId: "v", group: "ungrouped" }), false);
  assert.equal(sameAlertEventsFilters({ mode: "active", status: "OPEN", type: "SPEEDING", vehicleId: "v", group: groupId }, { mode: "active", status: "OPEN", type: "SPEEDING", vehicleId: "v", group: groupId }), true);
});

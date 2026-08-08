import assert from "node:assert/strict";
import test from "node:test";
import { abortAlertEventsLoadMore, beginAlertEventsFirstPage, beginAlertEventsLoadMore, canLoadMoreAlertEvents, failAlertEventsFirstPage, failAlertEventsLoadMore, initialAlertEventsListState, isCurrentAlertEventsGeneration, succeedAlertEventsFirstPage, succeedAlertEventsLoadMore } from "./alert-events-request-state";
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
  assert.equal(failed.data.nextCursor, "opaque-next-cursor"); assert.equal(failed.paginationValid, false); assert.equal(canLoadMoreAlertEvents(failed), false);
});

test("refresh failure for the same filters preserves successful rows and cursor", () => {
  const initial = initialAlertEventsListState(alertEventsListFixture, { status: "OPEN" }); const failed = failAlertEventsFirstPage(beginAlertEventsFirstPage(initial, { status: "OPEN" }));
  assert.deepEqual(failed.data, alertEventsListFixture); assert.equal(failed.paginationValid, true); assert.equal(canLoadMoreAlertEvents(failed), true);
});

test("stale request generations cannot replace a newer first-page result", () => {
  const newer = succeedAlertEventsFirstPage(initialAlertEventsListState(alertEventsListFixture, {}), { type: "INACTIVITY" }, { items: [], nextCursor: null });
  assert.equal(isCurrentAlertEventsGeneration(4, 5), false); assert.equal(isCurrentAlertEventsGeneration(5, 5), true); assert.equal(newer.filters.type, "INACTIVITY");
});

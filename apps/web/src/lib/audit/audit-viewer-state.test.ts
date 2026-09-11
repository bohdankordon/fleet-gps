import assert from "node:assert/strict";
import test from "node:test";
import { auditResponseFixture } from "./audit-fixture";
import { serializeAuditRequestQuery } from "./audit-query";
import { beginAuditFirstPage, beginAuditLoadMore, canLoadMoreAudit, failAuditFirstPage, failAuditLoadMore, initialAuditViewerState, succeedAuditFirstPage, succeedAuditLoadMore } from "./audit-viewer-state";

test("first-page, filter, and refresh transitions clear items and cursor", () => {
  const loaded = succeedAuditFirstPage(initialAuditViewerState(), { ...auditResponseFixture(), nextCursor: "cursor_one", hasMore: true });
  const filtered = beginAuditFirstPage(loaded, { actorType: "SYSTEM" });
  assert.deepEqual(filtered.data, { items: [], nextCursor: null, hasMore: false });
  assert.deepEqual(filtered.filters, { actorType: "SYSTEM" });
  assert.equal(serializeAuditRequestQuery(filtered.filters).includes("cursor"), false);
  const refreshed = beginAuditFirstPage(loaded, loaded.filters);
  assert.equal(refreshed.data.nextCursor, null);
});

test("initial, first-page failure, and retained refresh failure stay truthful", () => {
  const initial = initialAuditViewerState({ actorType: "SYSTEM" });
  assert.deepEqual({ loading: initial.loading, initialized: initial.initialized, items: initial.data.items.length }, { loading: true, initialized: false, items: 0 });
  const firstFailure = failAuditFirstPage(beginAuditFirstPage(initial, initial.filters));
  assert.equal(firstFailure.error, "first");
  const loaded = succeedAuditFirstPage(initial, auditResponseFixture());
  const refreshing = beginAuditFirstPage(loaded, loaded.filters, true);
  assert.equal(refreshing.data.items.length, loaded.data.items.length);
  assert.equal(refreshing.refreshing, true);
  const refreshFailure = failAuditFirstPage(refreshing);
  assert.equal(refreshFailure.error, "refresh");
  assert.equal(refreshFailure.data.items.length, loaded.data.items.length);
});

test("load-more failure retains accumulated pages", () => {
  const page = { ...auditResponseFixture(), nextCursor: "cursor_one", hasMore: true };
  const loaded = succeedAuditFirstPage(initialAuditViewerState(), page);
  const failed = failAuditLoadMore(beginAuditLoadMore(loaded));
  assert.equal(failed.error, "more");
  assert.deepEqual(failed.data, loaded.data);
});

test("load more uses a cursor page, appends unique rows, and stops on final page", () => {
  const first = { ...auditResponseFixture(), items: auditResponseFixture().items.slice(0, 2), nextCursor: "cursor_one", hasMore: true };
  let state = succeedAuditFirstPage(initialAuditViewerState(), first);
  assert.equal(canLoadMoreAudit(state), true);
  state = beginAuditLoadMore(state);
  assert.equal(canLoadMoreAudit(state), false);
  const page = { items: [first.items[1]!, auditResponseFixture().items[2]!], nextCursor: null, hasMore: false };
  state = succeedAuditLoadMore(state, page);
  assert.equal(state.data.items.length, 3);
  assert.equal(new Set(state.data.items.map((item) => item.id)).size, 3);
  assert.equal(canLoadMoreAudit(state), false);
});

test("deduplicates repeated IDs within first and continuation pages", () => {
  const fixture = auditResponseFixture();
  let state = succeedAuditFirstPage(initialAuditViewerState(), { items: [fixture.items[0]!, fixture.items[0]!], nextCursor: "cursor_one", hasMore: true });
  assert.deepEqual(state.data.items.map((item) => item.id), [fixture.items[0]!.id]);
  state = succeedAuditLoadMore(beginAuditLoadMore(state), { items: [fixture.items[1]!, fixture.items[1]!], nextCursor: null, hasMore: false });
  assert.deepEqual(state.data.items.map((item) => item.id), [fixture.items[0]!.id, fixture.items[1]!.id]);
});

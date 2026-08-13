import assert from "node:assert/strict";
import test from "node:test";
import { auditResponseFixture } from "./audit-fixture";
import { serializeAuditRequestQuery } from "./audit-query";
import { beginAuditFirstPage, beginAuditLoadMore, canLoadMoreAudit, initialAuditViewerState, succeedAuditFirstPage, succeedAuditLoadMore } from "./audit-viewer-state";

test("first-page, filter, and refresh transitions clear items and cursor", () => {
  const loaded = succeedAuditFirstPage(initialAuditViewerState(), { ...auditResponseFixture(), nextCursor: "cursor_one", hasMore: true });
  const filtered = beginAuditFirstPage(loaded, { actorType: "SYSTEM" });
  assert.deepEqual(filtered.data, { items: [], nextCursor: null, hasMore: false });
  assert.deepEqual(filtered.filters, { actorType: "SYSTEM" });
  assert.equal(serializeAuditRequestQuery(filtered.filters).includes("cursor"), false);
  const refreshed = beginAuditFirstPage(loaded, loaded.filters);
  assert.equal(refreshed.data.nextCursor, null);
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

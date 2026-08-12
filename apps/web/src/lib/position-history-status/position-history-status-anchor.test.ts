import assert from "node:assert/strict";
import test from "node:test";
import { positionHistoryAnchorHref, resolvePositionHistoryAnchor } from "./position-history-status-anchor";

test("restores the exact explicit absolute anchor from URL state", () => { const anchor = "2026-08-11T05:00:00.000+03:00"; assert.deepEqual(resolvePositionHistoryAnchor({ to: anchor }), { anchor, input: anchor, absent: false }); assert.equal(positionHistoryAnchorHref(anchor), "/admin/history?to=2026-08-11T05%3A00%3A00.000%2B03%3A00"); });
test("distinguishes an absent anchor and preserves malformed text without treating it as valid", () => { assert.deepEqual(resolvePositionHistoryAnchor({}), { anchor: null, input: "", absent: true }); assert.deepEqual(resolvePositionHistoryAnchor({ to: "2026-08-11T02:00" }), { anchor: null, input: "2026-08-11T02:00", absent: false }); assert.deepEqual(resolvePositionHistoryAnchor({ to: ["a", "b"] }), { anchor: null, input: "", absent: false }); assert.equal(positionHistoryAnchorHref("not-absolute"), null); });

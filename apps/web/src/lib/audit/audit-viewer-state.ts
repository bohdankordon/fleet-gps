import type { AuditReadResponse } from "./audit-contract";
import type { AuditFilters } from "./audit-query";

export type AuditViewerError = "first" | "refresh" | "more" | null;
export type AuditViewerState = Readonly<{ data: AuditReadResponse; filters: AuditFilters; loading: boolean; refreshing: boolean; moreLoading: boolean; initialized: boolean; error: AuditViewerError }>;
export const EMPTY_AUDIT_RESPONSE: AuditReadResponse = { items: [], nextCursor: null, hasMore: false };
function uniqueAuditItems(items: readonly AuditReadResponse["items"][number][], known = new Set<string>()): AuditReadResponse["items"] {
  const unique: AuditReadResponse["items"] = [];
  for (const item of items) { if (!known.has(item.id)) { known.add(item.id); unique.push(item); } }
  return unique;
}
export function initialAuditViewerState(filters: AuditFilters = {}): AuditViewerState { return { data: EMPTY_AUDIT_RESPONSE, filters, loading: true, refreshing: false, moreLoading: false, initialized: false, error: null }; }
export function beginAuditFirstPage(state: AuditViewerState, filters: AuditFilters, retainData = false): AuditViewerState {
  return { ...state, data: retainData ? state.data : EMPTY_AUDIT_RESPONSE, filters, loading: true, refreshing: retainData && state.data.items.length > 0, moreLoading: false, error: null };
}
export function succeedAuditFirstPage(state: AuditViewerState, data: AuditReadResponse): AuditViewerState { return { ...state, data: { ...data, items: uniqueAuditItems(data.items) }, loading: false, refreshing: false, initialized: true, error: null }; }
export function failAuditFirstPage(state: AuditViewerState): AuditViewerState { return { ...state, loading: false, refreshing: false, initialized: true, error: state.data.items.length > 0 ? "refresh" : "first" }; }
export function beginAuditLoadMore(state: AuditViewerState): AuditViewerState { return { ...state, moreLoading: true, error: null }; }
export function succeedAuditLoadMore(state: AuditViewerState, page: AuditReadResponse): AuditViewerState { const known = new Set(state.data.items.map((item) => item.id)); return { ...state, data: { items: [...state.data.items, ...uniqueAuditItems(page.items, known)], nextCursor: page.nextCursor, hasMore: page.hasMore }, moreLoading: false, error: null }; }
export function failAuditLoadMore(state: AuditViewerState): AuditViewerState { return { ...state, moreLoading: false, error: "more" }; }
export function canLoadMoreAudit(state: AuditViewerState): boolean { return !state.loading && !state.moreLoading && state.data.hasMore && state.data.nextCursor !== null; }

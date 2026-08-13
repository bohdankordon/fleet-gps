import type { AuditReadResponse } from "./audit-contract";
import type { AuditFilters } from "./audit-query";

export type AuditViewerError = "first" | "more" | null;
export type AuditViewerState = Readonly<{ data: AuditReadResponse; filters: AuditFilters; loading: boolean; moreLoading: boolean; error: AuditViewerError }>;
export const EMPTY_AUDIT_RESPONSE: AuditReadResponse = { items: [], nextCursor: null, hasMore: false };
export function initialAuditViewerState(): AuditViewerState { return { data: EMPTY_AUDIT_RESPONSE, filters: {}, loading: false, moreLoading: false, error: null }; }
export function beginAuditFirstPage(state: AuditViewerState, filters: AuditFilters): AuditViewerState { return { ...state, data: EMPTY_AUDIT_RESPONSE, filters, loading: true, moreLoading: false, error: null }; }
export function succeedAuditFirstPage(state: AuditViewerState, data: AuditReadResponse): AuditViewerState { return { ...state, data, loading: false, error: null }; }
export function failAuditFirstPage(state: AuditViewerState): AuditViewerState { return { ...state, loading: false, error: "first" }; }
export function beginAuditLoadMore(state: AuditViewerState): AuditViewerState { return { ...state, moreLoading: true, error: null }; }
export function succeedAuditLoadMore(state: AuditViewerState, page: AuditReadResponse): AuditViewerState { const known = new Set(state.data.items.map((item) => item.id)); return { ...state, data: { items: [...state.data.items, ...page.items.filter((item) => !known.has(item.id))], nextCursor: page.nextCursor, hasMore: page.hasMore }, moreLoading: false, error: null }; }
export function failAuditLoadMore(state: AuditViewerState): AuditViewerState { return { ...state, moreLoading: false, error: "more" }; }
export function canLoadMoreAudit(state: AuditViewerState): boolean { return !state.loading && !state.moreLoading && state.data.hasMore && state.data.nextCursor !== null; }

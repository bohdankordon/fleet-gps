import type { AlertEventsListResponse } from "./alert-events-contract";
import type { AlertEventsFilters } from "./alert-events-query";
import { appendAlertEventsPage } from "./alert-events-ui-model";

export type AlertEventsListError = "first" | "more" | null;
export type AlertEventsListState = Readonly<{
  data: AlertEventsListResponse;
  filters: AlertEventsFilters;
  dataFilters: AlertEventsFilters;
  loading: boolean;
  moreLoading: boolean;
  error: AlertEventsListError;
  paginationValid: boolean;
}>;

export function sameAlertEventsFilters(left: AlertEventsFilters, right: AlertEventsFilters): boolean { return (["mode", "status", "type", "vehicleId", "group", "period", "from", "to"] as const).every((key) => left[key] === right[key]); }
export function initialAlertEventsListState(data: AlertEventsListResponse, filters: AlertEventsFilters): AlertEventsListState { return { data, filters, dataFilters: filters, loading: false, moreLoading: false, error: null, paginationValid: true }; }
export function beginAlertEventsFirstPage(state: AlertEventsListState, filters: AlertEventsFilters): AlertEventsListState { const changed = !sameAlertEventsFilters(state.dataFilters, filters); return { ...state, data: changed ? { items: [], nextCursor: null } : state.data, filters, loading: true, moreLoading: false, error: null, paginationValid: changed ? false : state.paginationValid }; }
export function succeedAlertEventsFirstPage(state: AlertEventsListState, filters: AlertEventsFilters, data: AlertEventsListResponse): AlertEventsListState { return { ...state, filters, dataFilters: filters, data, loading: false, moreLoading: false, error: null, paginationValid: true }; }
export function failAlertEventsFirstPage(state: AlertEventsListState): AlertEventsListState { return { ...state, loading: false, moreLoading: false, error: "first" }; }
export function beginAlertEventsLoadMore(state: AlertEventsListState): AlertEventsListState { return { ...state, moreLoading: true }; }
export function abortAlertEventsLoadMore(state: AlertEventsListState): AlertEventsListState { return { ...state, moreLoading: false }; }
export function succeedAlertEventsLoadMore(state: AlertEventsListState, page: AlertEventsListResponse): AlertEventsListState { return { ...state, data: appendAlertEventsPage(state.data, page), moreLoading: false, error: null }; }
export function failAlertEventsLoadMore(state: AlertEventsListState): AlertEventsListState { return { ...state, moreLoading: false, error: "more" }; }
export function canLoadMoreAlertEvents(state: AlertEventsListState): boolean { return !state.loading && !state.moreLoading && state.paginationValid && sameAlertEventsFilters(state.filters, state.dataFilters) && state.data.nextCursor !== null; }
export function isCurrentAlertEventsGeneration(expected: number, current: number): boolean { return expected === current; }

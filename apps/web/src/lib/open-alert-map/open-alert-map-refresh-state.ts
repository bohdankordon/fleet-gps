import type { FleetMapResponse } from "@/lib/fleet-map/fleet-map-contract";
import type { OpenAlertMapResponse } from "./open-alert-map-contract";

export type MapRefreshResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false }>;
export type CoordinatedMapRefreshState = Readonly<{
  fleet: FleetMapResponse;
  alerts: OpenAlertMapResponse | null;
  loading: boolean;
  fleetError: boolean;
  alertError: boolean;
  generation: number;
}>;

export function initialCoordinatedMapRefreshState(fleet: FleetMapResponse, alerts: OpenAlertMapResponse | null, alertError: boolean): CoordinatedMapRefreshState {
  return { fleet, alerts, loading: false, fleetError: false, alertError, generation: 0 };
}

export function beginCoordinatedMapRefresh(state: CoordinatedMapRefreshState): CoordinatedMapRefreshState {
  return state.loading ? state : { ...state, loading: true, generation: state.generation + 1 };
}

export function settleCoordinatedMapRefresh(state: CoordinatedMapRefreshState, generation: number, fleet: MapRefreshResult<FleetMapResponse>, alerts: MapRefreshResult<OpenAlertMapResponse>): CoordinatedMapRefreshState {
  if (!state.loading || generation !== state.generation) return state;
  return {
    ...state,
    fleet: fleet.ok ? fleet.value : state.fleet,
    alerts: alerts.ok ? alerts.value : state.alerts,
    loading: false,
    fleetError: !fleet.ok,
    alertError: !alerts.ok,
  };
}

export function abortCoordinatedMapRefresh(state: CoordinatedMapRefreshState, generation: number): CoordinatedMapRefreshState {
  return state.loading && generation === state.generation ? { ...state, loading: false } : state;
}

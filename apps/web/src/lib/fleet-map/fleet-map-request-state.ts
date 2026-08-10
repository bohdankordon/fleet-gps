import type { FleetMapResponse } from "./fleet-map-contract";

export type FleetMapRequestState = Readonly<{ snapshot: FleetMapResponse; loading: boolean; refreshError: boolean; generation: number }>;
export function initialFleetMapRequestState(snapshot: FleetMapResponse): FleetMapRequestState { return { snapshot, loading: false, refreshError: false, generation: 0 }; }
export function beginFleetMapRefresh(state: FleetMapRequestState): FleetMapRequestState { return state.loading ? state : { ...state, loading: true, refreshError: false, generation: state.generation + 1 }; }
export function succeedFleetMapRefresh(state: FleetMapRequestState, generation: number, snapshot: FleetMapResponse): FleetMapRequestState { return generation === state.generation ? { ...state, snapshot, loading: false, refreshError: false } : state; }
export function failFleetMapRefresh(state: FleetMapRequestState, generation: number): FleetMapRequestState { return generation === state.generation ? { ...state, loading: false, refreshError: true } : state; }
export function abortFleetMapRefresh(state: FleetMapRequestState, generation: number): FleetMapRequestState { return generation === state.generation ? { ...state, loading: false } : state; }

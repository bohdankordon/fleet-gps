import type { VehicleDetailsResponse } from "./vehicle-details-contract";
export type VehicleDetailsRequestState = Readonly<{ data: VehicleDetailsResponse; loading: boolean; refreshError: boolean; generation: number }>;
export function initialVehicleDetailsRequestState(data: VehicleDetailsResponse): VehicleDetailsRequestState { return { data, loading: false, refreshError: false, generation: 0 }; }
export function beginVehicleDetailsRefresh(state: VehicleDetailsRequestState): VehicleDetailsRequestState { return state.loading ? state : { ...state, loading: true, generation: state.generation + 1 }; }
export function succeedVehicleDetailsRefresh(state: VehicleDetailsRequestState, generation: number, data: VehicleDetailsResponse): VehicleDetailsRequestState { return generation === state.generation ? { data, loading: false, refreshError: false, generation } : state; }
export function failVehicleDetailsRefresh(state: VehicleDetailsRequestState, generation: number): VehicleDetailsRequestState { return generation === state.generation ? { ...state, loading: false, refreshError: true } : state; }
export function abortVehicleDetailsRefresh(state: VehicleDetailsRequestState, generation: number): VehicleDetailsRequestState { return generation === state.generation ? { ...state, loading: false } : state; }

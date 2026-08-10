import type { VehicleTrackResponse } from "./vehicle-track-contract";
import type { VehicleTrackRange } from "./vehicle-track-range";

export type VehicleTrackLoadError = "INVALID_RANGE" | "NOT_FOUND" | "TOO_DENSE" | "MALFORMED" | "UNAVAILABLE" | null;
export type VehicleTrackRequestState = Readonly<{ data: VehicleTrackResponse | null; range: VehicleTrackRange | null; loading: boolean; error: VehicleTrackLoadError; generation: number; rangeChanged: boolean }>;
export function initialVehicleTrackRequestState(data: VehicleTrackResponse | null, range: VehicleTrackRange | null, error: VehicleTrackLoadError): VehicleTrackRequestState { return { data, range, loading: false, error, generation: 0, rangeChanged: false }; }
export function beginVehicleTrackRequest(state: VehicleTrackRequestState, range: VehicleTrackRange, rangeChanged: boolean): VehicleTrackRequestState { return state.loading ? state : { ...state, range, loading: true, error: null, generation: state.generation + 1, rangeChanged }; }
export function succeedVehicleTrackRequest(state: VehicleTrackRequestState, generation: number, data: VehicleTrackResponse): VehicleTrackRequestState { return generation === state.generation ? { data, range: data.range, loading: false, error: null, generation, rangeChanged: state.rangeChanged } : state; }
export function failVehicleTrackRequest(state: VehicleTrackRequestState, generation: number, error: Exclude<VehicleTrackLoadError, null>): VehicleTrackRequestState { return generation === state.generation ? { ...state, loading: false, error } : state; }
export function abortVehicleTrackRequest(state: VehicleTrackRequestState, generation: number): VehicleTrackRequestState { return generation === state.generation ? { ...state, loading: false } : state; }

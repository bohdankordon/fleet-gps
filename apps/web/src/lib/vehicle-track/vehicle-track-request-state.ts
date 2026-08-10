import { vehicleTrackLoadedRange, type VehicleTrackLoadedData } from "./vehicle-track-load";
import type { VehicleTrackRange } from "./vehicle-track-range";

export type VehicleTrackLoadError = "INVALID_RANGE" | "NOT_FOUND" | "TOO_DENSE_EXACT" | "TOO_FRAGMENTED_OVERVIEW" | "MALFORMED" | "UNAVAILABLE" | null;
export type VehicleTrackRequestState = Readonly<{
  data: VehicleTrackLoadedData | null;
  range: VehicleTrackRange | null;
  pendingRange: VehicleTrackRange | null;
  loading: boolean;
  error: VehicleTrackLoadError;
  generation: number;
  rangeChanged: boolean;
}>;
export function initialVehicleTrackRequestState(data: VehicleTrackLoadedData | null, range: VehicleTrackRange | null, error: VehicleTrackLoadError): VehicleTrackRequestState {
  return { data, range: data ? vehicleTrackLoadedRange(data) : range, pendingRange: null, loading: false, error, generation: 0, rangeChanged: false };
}
export function beginVehicleTrackRequest(state: VehicleTrackRequestState, range: VehicleTrackRange, rangeChanged: boolean): VehicleTrackRequestState {
  return state.loading ? state : { ...state, pendingRange: range, loading: true, error: null, generation: state.generation + 1, rangeChanged };
}
export function succeedVehicleTrackRequest(state: VehicleTrackRequestState, generation: number, data: VehicleTrackLoadedData): VehicleTrackRequestState {
  return generation === state.generation ? { data, range: vehicleTrackLoadedRange(data), pendingRange: null, loading: false, error: null, generation, rangeChanged: state.rangeChanged } : state;
}
export function failVehicleTrackRequest(state: VehicleTrackRequestState, generation: number, error: Exclude<VehicleTrackLoadError, null>): VehicleTrackRequestState {
  return generation === state.generation ? { ...state, pendingRange: null, loading: false, error } : state;
}
export function abortVehicleTrackRequest(state: VehicleTrackRequestState, generation: number): VehicleTrackRequestState {
  return generation === state.generation ? { ...state, pendingRange: null, loading: false } : state;
}

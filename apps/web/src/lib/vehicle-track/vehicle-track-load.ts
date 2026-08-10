import type { VehicleTrackResponse } from "./vehicle-track-contract";
import type { VehicleTrackOverviewResponse } from "./vehicle-track-overview-contract";
import { vehicleTrackModeForRange, vehicleTrackRangeKey, type VehicleTrackMode, type VehicleTrackRange } from "./vehicle-track-range";

export type ExactVehicleTrackLoad = Readonly<{ mode: "EXACT"; response: VehicleTrackResponse }>;
export type OverviewVehicleTrackLoad = Readonly<{ mode: "OVERVIEW"; response: VehicleTrackOverviewResponse }>;
export type VehicleTrackLoadedData = ExactVehicleTrackLoad | OverviewVehicleTrackLoad;

export function vehicleTrackLoadedRange(data: VehicleTrackLoadedData): VehicleTrackRange { return data.response.range; }
export function vehicleTrackLoadedKey(data: VehicleTrackLoadedData): string { return `${data.mode}:${vehicleTrackRangeKey(vehicleTrackLoadedRange(data))}`; }
export function createVehicleTrackLoadedData(mode: VehicleTrackMode, response: VehicleTrackResponse | VehicleTrackOverviewResponse): VehicleTrackLoadedData | null {
  const responseMode = vehicleTrackModeForRange(response.range);
  if (responseMode !== mode) return null;
  return mode === "EXACT" ? { mode, response: response as VehicleTrackResponse } : { mode, response: response as VehicleTrackOverviewResponse };
}

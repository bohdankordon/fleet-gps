import type { VehicleTrackLoadedData } from "./vehicle-track-load";
import { buildVehicleTrackOverviewPresentation } from "./vehicle-track-overview-presentation";
import { buildVehicleTrackPresentation, type VehicleTrackPresentationModel } from "./vehicle-track-presentation";

export function buildVehicleTrackLoadPresentation(data: VehicleTrackLoadedData): VehicleTrackPresentationModel {
  return data.mode === "EXACT" ? buildVehicleTrackPresentation(data.response) : buildVehicleTrackOverviewPresentation(data.response);
}

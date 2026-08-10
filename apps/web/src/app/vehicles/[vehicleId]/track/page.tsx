import { VehicleTrackClient } from "@/components/vehicle-track-client";
import { fetchCityGeofenceMap } from "@/lib/city-geofence/city-geofence-client";
import { fetchVehicleTrack } from "@/lib/vehicle-track/vehicle-track-client";
import { isVehicleTrackId, VehicleTrackContractError, type VehicleTrackResponse } from "@/lib/vehicle-track/vehicle-track-contract";
import { VehicleTrackBackendBadRequestError, VehicleTrackBackendNotFoundError, VehicleTrackBackendTooDenseError } from "@/lib/vehicle-track/vehicle-track-errors";
import { buildVehicleTrackPresentation, VehicleTrackPresentationError } from "@/lib/vehicle-track/vehicle-track-presentation";
import { resolveInitialVehicleTrackRange } from "@/lib/vehicle-track/vehicle-track-range";
import type { VehicleTrackLoadError } from "@/lib/vehicle-track/vehicle-track-request-state";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function VehicleTrackPage({ params, searchParams }: Readonly<{ params: Promise<{ vehicleId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  const [{ vehicleId }, query] = await Promise.all([params, searchParams]);
  const idValid = isVehicleTrackId(vehicleId);
  const resolved = resolveInitialVehicleTrackRange(query, new Date());
  let initialData: VehicleTrackResponse | null = null;
  let initialError: VehicleTrackLoadError = !idValid || !resolved.range ? "INVALID_RANGE" : null;
  const trackPromise = idValid && resolved.range ? fetchVehicleTrack(vehicleId, resolved.range) : Promise.resolve(null);
  const [trackResult, geofenceResult] = await Promise.allSettled([trackPromise, fetchCityGeofenceMap()]);
  if (trackResult.status === "fulfilled" && trackResult.value) {
    try { buildVehicleTrackPresentation(trackResult.value); initialData = trackResult.value; }
    catch (error) { initialError = error instanceof VehicleTrackPresentationError ? "MALFORMED" : "UNAVAILABLE"; }
  } else if (trackResult.status === "rejected") {
    const error = trackResult.reason;
    initialError = error instanceof VehicleTrackBackendBadRequestError ? "INVALID_RANGE" : error instanceof VehicleTrackBackendNotFoundError ? "NOT_FOUND" : error instanceof VehicleTrackBackendTooDenseError ? "TOO_DENSE" : error instanceof VehicleTrackContractError ? "MALFORMED" : "UNAVAILABLE";
  }
  return <main><VehicleTrackClient
    vehicleId={vehicleId}
    initialData={initialData}
    initialRange={resolved.range}
    initialError={initialError}
    initialGeofence={geofenceResult.status === "fulfilled" ? geofenceResult.value : null}
    initialGeofenceUnavailable={geofenceResult.status === "rejected"}
  /></main>;
}

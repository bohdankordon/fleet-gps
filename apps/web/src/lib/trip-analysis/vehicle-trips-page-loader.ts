import { isTripAnalysisVehicleId, type TripAnalysisResponse } from "./trip-analysis-contract";
import { TripAnalysisBackendNotFoundError } from "./trip-analysis-errors";
import type { VehicleTrackRange } from "../vehicle-track/vehicle-track-range";
import { VehicleDetailsBackendNotFoundError } from "../vehicle-details/vehicle-details-errors";
import type { VehicleDetailsResponse } from "../vehicle-details/vehicle-details-contract";

export type VehicleTripsInitialRange = Readonly<{
  range: VehicleTrackRange;
  restoredFromUrl: boolean;
  openEnded: boolean;
}>;

export type VehicleTripsPageState =
  | Readonly<{
      kind: "ready";
      range: VehicleTrackRange;
      restoredFromUrl: boolean;
      openEnded: boolean;
      initialData: TripAnalysisResponse | null;
      initialError: boolean;
      timezone: string;
      vehicleName: string | null;
      vehicleGroup: Readonly<{ id: string; name: string }> | null;
      shellGeneratedAt: string | null;
    }>
  | Readonly<{ kind: "context-unavailable"; vehicleName: string | null; generatedAt: string | null }>
  | Readonly<{ kind: "not-found" }>;

export type VehicleTripsPageDeps = Readonly<{
  fetchSettings: () => Promise<Readonly<{ timezone: string }>>;
  resolveRange: (
    query: Readonly<Record<string, string | string[] | undefined>>,
    now: Date,
    timezone: string,
  ) => VehicleTripsInitialRange | null;
  fetchDetails: (vehicleId: string) => Promise<VehicleDetailsResponse>;
  fetchAnalysis: (vehicleId: string, range: VehicleTrackRange) => Promise<TripAnalysisResponse>;
  now?: () => Date;
}>;

export async function loadVehicleTripsPageState(
  vehicleId: string,
  query: Readonly<Record<string, string | string[] | undefined>>,
  deps: VehicleTripsPageDeps,
): Promise<VehicleTripsPageState> {
  if (!isTripAnalysisVehicleId(vehicleId)) return Object.freeze({ kind: "not-found" });
  const now = deps.now ? deps.now() : new Date();
  const detailsFlight = deps.fetchDetails(vehicleId);
  let timezone: string | null = null;
  try {
    const settings = await deps.fetchSettings();
    if (typeof settings?.timezone === "string" && settings.timezone !== "") timezone = settings.timezone;
  } catch {
    timezone = null;
  }
  let initial: VehicleTripsInitialRange | null = null;
  if (timezone !== null) {
    try {
      initial = deps.resolveRange(query, now, timezone);
    } catch {
      initial = null;
    }
  }
  if (timezone === null || initial === null) {
    let details: VehicleDetailsResponse | null = null;
    try {
      details = await detailsFlight;
    } catch (error) {
      if (error instanceof VehicleDetailsBackendNotFoundError) return Object.freeze({ kind: "not-found" });
      details = null;
    }
    return Object.freeze({
      kind: "context-unavailable",
      vehicleName: details?.vehicle.name ?? null,
      generatedAt: details?.generatedAt ?? null,
    });
  }
  const [analysisResult, detailsResult] = await Promise.allSettled([
    deps.fetchAnalysis(vehicleId, initial.range),
    detailsFlight,
  ]);
  if (analysisResult.status === "rejected" && analysisResult.reason instanceof TripAnalysisBackendNotFoundError) {
    return Object.freeze({ kind: "not-found" });
  }
  return Object.freeze({
    kind: "ready",
    range: initial.range,
    restoredFromUrl: initial.restoredFromUrl,
    openEnded: initial.openEnded,
    initialData: analysisResult.status === "fulfilled" ? analysisResult.value : null,
    initialError: analysisResult.status === "rejected",
    timezone,
    vehicleName: detailsResult.status === "fulfilled" ? detailsResult.value.vehicle.name : null,
    vehicleGroup: detailsResult.status === "fulfilled" ? detailsResult.value.vehicle.group : null,
    shellGeneratedAt: detailsResult.status === "fulfilled" ? detailsResult.value.generatedAt : null,
  });
}

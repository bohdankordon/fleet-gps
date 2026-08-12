import type { VehicleTrackRange } from "../vehicle-track/vehicle-track-range";

export function tripAnalysisRequestInit(signal: AbortSignal): RequestInit { return { cache: "no-store", signal, headers: { Accept: "application/json" } }; }
export function tripAnalysisRequestUrl(apiInternalBaseUrl: string, vehicleId: string, range: VehicleTrackRange): URL { const url = new URL(`${apiInternalBaseUrl}/api/vehicles/${vehicleId}/trip-analysis`); url.searchParams.set("from", range.from); url.searchParams.set("to", range.to); return url; }

import { notFound } from "next/navigation";
import { VehicleTripsClient } from "@/components/vehicle-trips-client";
import { fetchTripAnalysis } from "@/lib/trip-analysis/trip-analysis-client";
import { isTripAnalysisVehicleId } from "@/lib/trip-analysis/trip-analysis-contract";
import { TripAnalysisBackendNotFoundError } from "@/lib/trip-analysis/trip-analysis-errors";
import { resolveInitialTripAnalysisRange } from "@/lib/trip-analysis/trip-analysis-range";
import { fetchRuntimeSettings } from "@/lib/runtime-settings/runtime-settings-client";
import { fetchVehicleDetails } from "@/lib/vehicle-details/vehicle-details-client";
export const dynamic = "force-dynamic"; export const revalidate = 0;
export default async function VehicleTripsPage({ params, searchParams }: Readonly<{ params: Promise<{ vehicleId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  const [{ vehicleId }, query, runtime] = await Promise.all([params, searchParams, fetchRuntimeSettings()]); if (!isTripAnalysisVehicleId(vehicleId)) notFound();
  const resolved = resolveInitialTripAnalysisRange(query, new Date(), runtime.timezone); if (!resolved) throw new Error("Unable to create initial trip-analysis range"); const range = resolved.range;
  const [analysisResult, detailsResult] = await Promise.allSettled([fetchTripAnalysis(vehicleId, range), fetchVehicleDetails(vehicleId)]);
  if (analysisResult.status === "rejected" && analysisResult.reason instanceof TripAnalysisBackendNotFoundError) notFound();
  return <div><VehicleTripsClient vehicleId={vehicleId} vehicleName={detailsResult.status === "fulfilled" ? detailsResult.value.vehicle.name : null} shellGeneratedAt={detailsResult.status === "fulfilled" ? detailsResult.value.generatedAt : null} initialData={analysisResult.status === "fulfilled" ? analysisResult.value : null} initialRange={range} initialPreset={resolved.restoredFromUrl ? null : "TODAY"} initialOpenEnded={resolved.openEnded} initialError={analysisResult.status === "rejected"} timezone={runtime.timezone} /></div>;
}

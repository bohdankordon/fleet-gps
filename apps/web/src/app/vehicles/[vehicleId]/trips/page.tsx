import { notFound } from "next/navigation";
import { VehicleTripsClient } from "@/components/vehicle-trips-client";
import { fetchTripAnalysis } from "@/lib/trip-analysis/trip-analysis-client";
import { isTripAnalysisVehicleId } from "@/lib/trip-analysis/trip-analysis-contract";
import { TripAnalysisBackendNotFoundError } from "@/lib/trip-analysis/trip-analysis-errors";
import { resolveInitialTripAnalysisRange } from "@/lib/trip-analysis/trip-analysis-range";
export const dynamic = "force-dynamic"; export const revalidate = 0;
export default async function VehicleTripsPage({ params, searchParams }: Readonly<{ params: Promise<{ vehicleId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  const [{ vehicleId }, query] = await Promise.all([params, searchParams]); if (!isTripAnalysisVehicleId(vehicleId)) notFound();
  const resolved = resolveInitialTripAnalysisRange(query, new Date()); if (!resolved) throw new Error("Unable to create initial trip-analysis range"); const range = resolved.range;
  let initialData = null; let initialError = false;
  try { initialData = await fetchTripAnalysis(vehicleId, range); } catch (error) { if (error instanceof TripAnalysisBackendNotFoundError) notFound(); initialError = true; }
  return <main><VehicleTripsClient vehicleId={vehicleId} initialData={initialData} initialRange={range} initialError={initialError} /></main>;
}

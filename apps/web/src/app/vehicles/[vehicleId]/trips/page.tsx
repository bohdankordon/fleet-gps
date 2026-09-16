import { notFound } from "next/navigation";
import { VehicleDetailShell } from "@/components/vehicle-detail-shell";
import { VehicleTripsClient } from "@/components/vehicle-trips-client";
import { VehicleTripsUnavailable } from "@/components/vehicle-trips-unavailable";
import { getServerI18n } from "@/i18n/server";
import { fetchRuntimeSettings } from "@/lib/runtime-settings/runtime-settings-client";
import { fetchTripAnalysis } from "@/lib/trip-analysis/trip-analysis-client";
import { resolveInitialTripAnalysisRange } from "@/lib/trip-analysis/trip-analysis-range";
import { loadVehicleTripsPageState } from "@/lib/trip-analysis/vehicle-trips-page-loader";
import { fetchVehicleDetails } from "@/lib/vehicle-details/vehicle-details-client";
import { fetchSpeedingEventInvestigation } from "@/lib/alert-events/alert-events-client";
export const dynamic = "force-dynamic"; export const revalidate = 0;
export default async function VehicleTripsPage({ params, searchParams }: Readonly<{ params: Promise<{ vehicleId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  const [{ vehicleId }, query] = await Promise.all([params, searchParams]);
  const resolved = await loadVehicleTripsPageState(vehicleId, query, { fetchSettings: fetchRuntimeSettings, resolveRange: resolveInitialTripAnalysisRange, fetchDetails: (id) => fetchVehicleDetails(id), fetchAnalysis: (id, range) => fetchTripAnalysis(id, range), fetchEventInvestigation: (eventId) => fetchSpeedingEventInvestigation(eventId) });
  if (resolved.kind === "not-found") notFound();
  if (resolved.kind === "context-unavailable") { const { t } = await getServerI18n(); return <VehicleDetailShell vehicleId={vehicleId} vehicleName={resolved.vehicleName ?? t("trips.title")} activeTab="trips" generatedAt={resolved.generatedAt}><VehicleTripsUnavailable /></VehicleDetailShell>; }
  const range = resolved.range;
  return <div><VehicleTripsClient vehicleId={vehicleId} vehicleName={resolved.vehicleName} vehicleGroup={resolved.vehicleGroup} shellGeneratedAt={resolved.shellGeneratedAt} initialData={resolved.initialData} initialRange={range} initialPreset={resolved.restoredFromUrl ? null : "TODAY"} initialOpenEnded={resolved.openEnded} initialError={resolved.initialError} initialEventFocus={resolved.eventFocus} timezone={resolved.timezone} /></div>;
}

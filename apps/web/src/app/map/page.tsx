import { FleetMapClient } from "@/components/fleet-map-client";
import { InitialFleetMapError } from "@/components/initial-fleet-map-error";
import { fetchCityGeofenceMap } from "@/lib/city-geofence/city-geofence-client";
import { fetchFleetMapSnapshot } from "@/lib/fleet-map/fleet-map-client";
import { fetchOpenAlertMap } from "@/lib/open-alert-map/open-alert-map-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function FleetMapPage() {
  const [fleetResult, geofenceResult, alertsResult] = await Promise.allSettled([
    fetchFleetMapSnapshot(),
    fetchCityGeofenceMap(),
    fetchOpenAlertMap(),
  ]);
  if (fleetResult.status === "rejected") return <InitialFleetMapError />;
  return <div><FleetMapClient
    initialSnapshot={fleetResult.value}
    initialGeofence={geofenceResult.status === "fulfilled" ? geofenceResult.value : null}
    initialGeofenceUnavailable={geofenceResult.status === "rejected"}
    initialAlerts={alertsResult.status === "fulfilled" ? alertsResult.value : null}
    initialAlertsUnavailable={alertsResult.status === "rejected"}
  /></div>;
}

import { FleetMapClient } from "@/components/fleet-map-client";
import { InitialFleetMapError } from "@/components/initial-fleet-map-error";
import { fetchFleetMapSnapshot } from "@/lib/fleet-map/fleet-map-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function FleetMapPage() {
  let snapshot;
  try { snapshot = await fetchFleetMapSnapshot(); } catch { return <InitialFleetMapError />; }
  return <main><FleetMapClient initialSnapshot={snapshot} /></main>;
}

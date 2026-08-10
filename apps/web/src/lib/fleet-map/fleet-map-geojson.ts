import type { Feature, FeatureCollection, Point } from "geojson";
import type { FleetMapResponse } from "./fleet-map-contract";

export type FleetMapFeatureProperties = Readonly<{ vehicleId: string; freshness: "FRESH" | "STALE" }>;
export type FleetMapFeatureCollection = FeatureCollection<Point, FleetMapFeatureProperties>;

export function fleetMapToGeoJson(snapshot: FleetMapResponse): FleetMapFeatureCollection {
  return {
    type: "FeatureCollection",
    features: snapshot.vehicles.map((vehicle): Feature<Point, FleetMapFeatureProperties> => ({
      type: "Feature",
      id: vehicle.vehicle.id,
      properties: { vehicleId: vehicle.vehicle.id, freshness: vehicle.freshness },
      geometry: { type: "Point", coordinates: [vehicle.position.longitude, vehicle.position.latitude] },
    })),
  };
}

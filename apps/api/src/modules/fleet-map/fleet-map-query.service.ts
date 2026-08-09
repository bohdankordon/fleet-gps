import { Inject, Injectable } from "@nestjs/common";
import type { FleetMapQueryRepository, FleetMapStoredVehicle } from "./fleet-map-query.repository";
import type { FleetMapPositionFreshness, FleetMapResponse, FleetMapVehicleReadModel } from "./fleet-map-read-models";
import { FLEET_MAP_CLOCK, FLEET_MAP_QUERY_REPOSITORY } from "./fleet-map.tokens";
import { FleetMapQueryInternalError, type FleetMapClock } from "./fleet-map.types";

function isValidDate(value: Date): boolean {
  return Number.isFinite(value.getTime());
}

function hasAnyPositionData(vehicle: FleetMapStoredVehicle): boolean {
  const state = vehicle.currentState;
  return state !== null && (state.fixTime !== null || state.latitude !== null || state.longitude !== null);
}

function validCoordinates(latitude: number | null, longitude: number | null): Readonly<{ latitude: number; longitude: number }> | null {
  const valid = latitude !== null && longitude !== null
    && Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= -90 && latitude <= 90
    && longitude >= -180 && longitude <= 180;
  return valid ? { latitude, longitude } : null;
}

function mapSpeed(value: number | null, providerValid: boolean | null): number | null {
  return providerValid === true && value !== null && Number.isFinite(value) && value >= 0 ? value : null;
}

function freshness(observedAt: Date, providerValid: boolean | null, outdated: boolean | null, generatedAt: Date, thresholdSeconds: number): FleetMapPositionFreshness {
  const ageMilliseconds = generatedAt.getTime() - observedAt.getTime();
  const fresh = providerValid === true
    && outdated === false
    && ageMilliseconds >= 0
    && ageMilliseconds <= thresholdSeconds * 1_000;
  return fresh ? "FRESH" : "STALE";
}

function toReadModel(vehicle: FleetMapStoredVehicle, generatedAt: Date, thresholdSeconds: number): FleetMapVehicleReadModel | null {
  const state = vehicle.currentState;
  if (!state || !state.fixTime || !isValidDate(state.fixTime)) return null;
  const coordinates = validCoordinates(state.latitude, state.longitude);
  if (!coordinates) return null;
  return {
    vehicle: { id: vehicle.id, name: vehicle.name },
    position: { ...coordinates, observedAt: state.fixTime.toISOString() },
    speedKph: mapSpeed(state.speedKph, state.valid),
    freshness: freshness(state.fixTime, state.valid, state.outdated, generatedAt, thresholdSeconds),
  };
}

@Injectable()
export class FleetMapQueryService {
  public constructor(
    @Inject(FLEET_MAP_QUERY_REPOSITORY) private readonly repository: FleetMapQueryRepository,
    @Inject(FLEET_MAP_CLOCK) private readonly clock: FleetMapClock,
  ) {}

  public async getSnapshot(): Promise<FleetMapResponse> {
    const snapshot = await this.repository.getSnapshot();
    const generatedAt = this.clock.now();
    if (!isValidDate(generatedAt)) throw new FleetMapQueryInternalError();
    if (!Number.isSafeInteger(snapshot.positionFreshnessSeconds) || snapshot.positionFreshnessSeconds <= 0) throw new FleetMapQueryInternalError();

    const vehicles: FleetMapVehicleReadModel[] = [];
    let withoutPosition = 0;
    let invalidPosition = 0;
    for (const row of snapshot.vehicles) {
      const vehicle = toReadModel(row, generatedAt, snapshot.positionFreshnessSeconds);
      if (vehicle) vehicles.push(vehicle);
      else if (hasAnyPositionData(row)) invalidPosition += 1;
      else withoutPosition += 1;
    }
    const fresh = vehicles.filter((vehicle) => vehicle.freshness === "FRESH").length;
    const stale = vehicles.length - fresh;
    return {
      generatedAt: generatedAt.toISOString(),
      positionFreshnessSeconds: snapshot.positionFreshnessSeconds,
      summary: {
        totalVehicles: snapshot.vehicles.length,
        withPosition: vehicles.length,
        withoutPosition,
        invalidPosition,
        fresh,
        stale,
      },
      vehicles,
    };
  }
}

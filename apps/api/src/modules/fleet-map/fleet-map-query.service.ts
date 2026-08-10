import { Inject, Injectable } from "@nestjs/common";
import { hasAnyFleetMapPositionData, projectFleetMapCurrentState } from "./fleet-map-current-state.projection";
import type { FleetMapQueryRepository, FleetMapStoredVehicle } from "./fleet-map-query.repository";
import type { FleetMapResponse, FleetMapVehicleReadModel } from "./fleet-map-read-models";
import { FLEET_MAP_CLOCK, FLEET_MAP_QUERY_REPOSITORY } from "./fleet-map.tokens";
import { FleetMapQueryInternalError, type FleetMapClock } from "./fleet-map.types";

function isValidDate(value: Date): boolean {
  return Number.isFinite(value.getTime());
}

function toReadModel(vehicle: FleetMapStoredVehicle, generatedAt: Date, thresholdSeconds: number): FleetMapVehicleReadModel | null {
  const state = projectFleetMapCurrentState(vehicle.currentState, generatedAt, thresholdSeconds);
  if (!state) return null;
  return {
    vehicle: { id: vehicle.id, name: vehicle.name },
    ...state,
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
      else if (hasAnyFleetMapPositionData(row.currentState)) invalidPosition += 1;
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

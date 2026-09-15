import { Inject, Injectable } from "@nestjs/common";
import { VehicleScopeService } from "../vehicle-access/vehicle-access.service";
import { MAX_TRACK_POINTS, type StoredVehicleTrackPoint, type VehicleTrackQueryRepository } from "./vehicle-track-query.repository";
import type { VehicleTrackResponse } from "./vehicle-track-read-models";
import { VEHICLE_TRACK_CLOCK, VEHICLE_TRACK_QUERY_REPOSITORY } from "./vehicle-track.tokens";
import { VehicleTrackNotFoundError, VehicleTrackStateError, VehicleTrackTooDenseError, type VehicleTrackClock } from "./vehicle-track.types";

function projectPoint(point: StoredVehicleTrackPoint) {
  if (!(point.observedAt instanceof Date) || !Number.isFinite(point.observedAt.getTime())
    || !Number.isFinite(point.latitude) || point.latitude < -90 || point.latitude > 90
    || !Number.isFinite(point.longitude) || point.longitude < -180 || point.longitude > 180
    || (point.speedKph !== null && (!Number.isFinite(point.speedKph) || point.speedKph < 0))
    || (point.valid !== null && typeof point.valid !== "boolean")
    || (point.outdated !== null && typeof point.outdated !== "boolean")) throw new VehicleTrackStateError();
  return Object.freeze({
    latitude: point.latitude,
    longitude: point.longitude,
    observedAt: point.observedAt.toISOString(),
    speedKph: point.speedKph,
    valid: point.valid,
    outdated: point.outdated,
  });
}

@Injectable()
export class VehicleTrackQueryService {
  public constructor(
    @Inject(VEHICLE_TRACK_QUERY_REPOSITORY) private readonly repository: VehicleTrackQueryRepository,
    @Inject(VEHICLE_TRACK_CLOCK) private readonly clock: VehicleTrackClock,
    private readonly scopes: VehicleScopeService,
  ) {}

  public async getTrack(vehicleId: string, from: Date, to: Date, userId: string): Promise<VehicleTrackResponse> {
    const snapshot = await this.repository.getSnapshot(vehicleId, from, to, await this.scopes.resolve(userId));
    if (!snapshot.vehicle) throw new VehicleTrackNotFoundError();
    if (snapshot.points.length > MAX_TRACK_POINTS) throw new VehicleTrackTooDenseError();
    const generatedAt = this.clock.now();
    if (!(generatedAt instanceof Date) || !Number.isFinite(generatedAt.getTime())) throw new VehicleTrackStateError();
    const points = Object.freeze(snapshot.points.map(projectPoint));
    if (points.some((point, index) => index > 0 && point.observedAt < points[index - 1]!.observedAt)) throw new VehicleTrackStateError();
    return Object.freeze({
      generatedAt: generatedAt.toISOString(),
      vehicle: Object.freeze({ id: snapshot.vehicle.id, name: snapshot.vehicle.name, group: snapshot.vehicle.group ? Object.freeze({ id: snapshot.vehicle.group.id, name: snapshot.vehicle.group.name, color: snapshot.vehicle.group.color }) : null }),
      range: Object.freeze({ from: from.toISOString(), to: to.toISOString() }),
      summary: Object.freeze({
        pointCount: points.length,
        firstObservedAt: points[0]?.observedAt ?? null,
        lastObservedAt: points.at(-1)?.observedAt ?? null,
      }),
      points,
    });
  }
}

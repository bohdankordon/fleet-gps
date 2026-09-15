import { Inject, Injectable } from "@nestjs/common";
import type { VehicleTrackPointReadModel } from "./vehicle-track-read-models";
import type { VehicleTrackOverviewResponse } from "./vehicle-track-overview-read-models";
import {
  MAX_CONNECTED_RAW_GAP_SECONDS,
  MAX_OVERVIEW_POINTS,
  type StoredVehicleTrackOverviewPoint,
  type VehicleTrackOverviewQueryRepository,
} from "./vehicle-track-overview-query.repository";
import { VEHICLE_TRACK_CLOCK, VEHICLE_TRACK_OVERVIEW_QUERY_REPOSITORY } from "./vehicle-track.tokens";
import { VehicleScopeService } from "../vehicle-access/vehicle-access.service";
import {
  VehicleTrackOverviewNotFoundError,
  VehicleTrackOverviewStateError,
  VehicleTrackOverviewTooFragmentedError,
} from "./vehicle-track-overview.types";
import type { VehicleTrackClock } from "./vehicle-track.types";

function isNonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

type SegmentBuilder = {
  rawPointCount: number;
  firstObservedAt: string;
  lastObservedAt: string;
  points: VehicleTrackPointReadModel[];
};

function projectPoint(point: StoredVehicleTrackOverviewPoint): VehicleTrackPointReadModel {
  if (!isValidDate(point.observedAt)
    || !Number.isFinite(point.latitude) || point.latitude < -90 || point.latitude > 90
    || !Number.isFinite(point.longitude) || point.longitude < -180 || point.longitude > 180
    || (point.speedKph !== null && (!Number.isFinite(point.speedKph) || point.speedKph < 0))
    || (point.valid !== null && typeof point.valid !== "boolean")
    || (point.outdated !== null && typeof point.outdated !== "boolean")) throw new VehicleTrackOverviewStateError();
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
export class VehicleTrackOverviewQueryService {
  public constructor(
    @Inject(VEHICLE_TRACK_OVERVIEW_QUERY_REPOSITORY) private readonly repository: VehicleTrackOverviewQueryRepository,
    @Inject(VEHICLE_TRACK_CLOCK) private readonly clock: VehicleTrackClock,
    private readonly scopes: VehicleScopeService,
  ) {}

  public async getOverview(vehicleId: string, from: Date, to: Date, userId: string): Promise<VehicleTrackOverviewResponse> {
    const snapshot = await this.repository.getOverviewSnapshot(vehicleId, from, to, await this.scopes.resolve(userId));
    if (!snapshot.vehicle) throw new VehicleTrackOverviewNotFoundError();
    if (snapshot.tooFragmented) throw new VehicleTrackOverviewTooFragmentedError();
    if (!isNonNegativeInteger(snapshot.rawPointCount)
      || !isNonNegativeInteger(snapshot.segmentCount)
      || !isNonNegativeInteger(snapshot.qualityWarningCount)
      || snapshot.qualityWarningCount > snapshot.rawPointCount
      || snapshot.points.length > MAX_OVERVIEW_POINTS
      || snapshot.points.length > snapshot.rawPointCount) throw new VehicleTrackOverviewStateError();

    if (snapshot.rawPointCount === 0) {
      if (snapshot.segmentCount !== 0 || snapshot.qualityWarningCount !== 0
        || snapshot.firstObservedAt !== null || snapshot.lastObservedAt !== null
        || snapshot.points.length !== 0) throw new VehicleTrackOverviewStateError();
    } else if (snapshot.segmentCount < 1 || snapshot.segmentCount > snapshot.rawPointCount
      || !isValidDate(snapshot.firstObservedAt) || !isValidDate(snapshot.lastObservedAt)
      || snapshot.firstObservedAt > snapshot.lastObservedAt || snapshot.points.length < snapshot.segmentCount) {
      throw new VehicleTrackOverviewStateError();
    }

    const segments: SegmentBuilder[] = [];
    let returnedPointCount = 0;
    let rawPointCountAcrossSegments = 0;
    let previousProjectedObservedAt: string | null = null;
    for (const point of snapshot.points) {
      if (!Number.isSafeInteger(point.segmentOrdinal) || point.segmentOrdinal < 1 || point.segmentOrdinal > snapshot.segmentCount
        || !Number.isSafeInteger(point.segmentRawPointCount) || point.segmentRawPointCount < 1
        || !isValidDate(point.segmentFirstObservedAt) || !isValidDate(point.segmentLastObservedAt)
        || point.segmentFirstObservedAt > point.segmentLastObservedAt
        || !isValidDate(point.observedAt)
        || point.observedAt < point.segmentFirstObservedAt || point.observedAt > point.segmentLastObservedAt) throw new VehicleTrackOverviewStateError();

      let segment = segments.at(-1);
      if (!segment || point.segmentOrdinal !== segments.length) {
        if (point.segmentOrdinal !== segments.length + 1) throw new VehicleTrackOverviewStateError();
        const previousSegment = segments.at(-1);
        if (previousSegment && point.segmentFirstObservedAt.getTime() - Date.parse(previousSegment.lastObservedAt) <= MAX_CONNECTED_RAW_GAP_SECONDS * 1_000) throw new VehicleTrackOverviewStateError();
        segment = {
          rawPointCount: point.segmentRawPointCount,
          firstObservedAt: point.segmentFirstObservedAt.toISOString(),
          lastObservedAt: point.segmentLastObservedAt.toISOString(),
          points: [],
        };
        segments.push(segment);
        rawPointCountAcrossSegments += point.segmentRawPointCount;
      } else if (segment.rawPointCount !== point.segmentRawPointCount
        || segment.firstObservedAt !== point.segmentFirstObservedAt.toISOString()
        || segment.lastObservedAt !== point.segmentLastObservedAt.toISOString()) throw new VehicleTrackOverviewStateError();

      const projected = projectPoint(point);
      const previous = segment.points.at(-1);
      if (previous && projected.observedAt < previous.observedAt) throw new VehicleTrackOverviewStateError();
      if (previousProjectedObservedAt && projected.observedAt < previousProjectedObservedAt) throw new VehicleTrackOverviewStateError();
      segment.points.push(projected);
      previousProjectedObservedAt = projected.observedAt;
      returnedPointCount += 1;
    }

    if (segments.length !== snapshot.segmentCount || rawPointCountAcrossSegments !== snapshot.rawPointCount
      || (snapshot.rawPointCount > 0 && (
        segments[0]!.points[0]!.observedAt !== snapshot.firstObservedAt!.toISOString()
        || segments.at(-1)!.points.at(-1)!.observedAt !== snapshot.lastObservedAt!.toISOString()
      ))) throw new VehicleTrackOverviewStateError();

    const generatedAt = this.clock.now();
    if (!isValidDate(generatedAt)) throw new VehicleTrackOverviewStateError();
    const immutableSegments = Object.freeze(segments.map((segment) => Object.freeze({ ...segment, points: Object.freeze(segment.points) })));
    return Object.freeze({
      generatedAt: generatedAt.toISOString(),
      vehicle: Object.freeze({ id: snapshot.vehicle.id, name: snapshot.vehicle.name, group: snapshot.vehicle.group ? Object.freeze({ id: snapshot.vehicle.group.id, name: snapshot.vehicle.group.name }) : null }),
      range: Object.freeze({ from: from.toISOString(), to: to.toISOString() }),
      summary: Object.freeze({
        rawPointCount: snapshot.rawPointCount,
        returnedPointCount,
        segmentCount: snapshot.segmentCount,
        gapCount: Math.max(0, snapshot.segmentCount - 1),
        qualityWarningCount: snapshot.qualityWarningCount,
        firstObservedAt: snapshot.firstObservedAt?.toISOString() ?? null,
        lastObservedAt: snapshot.lastObservedAt?.toISOString() ?? null,
        sampled: true as const,
      }),
      segments: immutableSegments,
    });
  }
}

import type { Feature, LineString, Point } from "geojson";
import type { VehicleTrackOverviewResponse } from "./vehicle-track-overview-contract";
import {
  isVehicleTrackQualityWarning,
  VehicleTrackPresentationError,
  type VehicleTrackBounds,
  type VehicleTrackLineCollection,
  type VehicleTrackPointCollection,
  type VehicleTrackPointProperties,
  type VehicleTrackPresentationModel,
  type VehicleTrackPresentationPoint,
  type VehicleTrackPresentationSegment,
  type VehicleTrackPresentationGap,
} from "./vehicle-track-presentation";

export function buildVehicleTrackOverviewPresentation(response: VehicleTrackOverviewResponse): VehicleTrackPresentationModel {
  const sourcePoints = response.segments.flatMap((segment) => segment.points);
  const points = sourcePoints.map((point, index): VehicleTrackPresentationPoint => {
    const endpoint = sourcePoints.length === 1 ? "single" : index === 0 ? "start" : index === sourcePoints.length - 1 ? "end" : "none";
    return Object.freeze({ key: String(index), index, point, qualityWarning: isVehicleTrackQualityWarning(point), endpoint });
  });
  let previousTime = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    const time = Date.parse(point.point.observedAt);
    if (!Number.isFinite(time) || time < previousTime) throw new VehicleTrackPresentationError();
    previousTime = time;
  }

  const pointGeoJson: VehicleTrackPointCollection = {
    type: "FeatureCollection",
    features: points.map((item): Feature<Point, VehicleTrackPointProperties> => ({
      type: "Feature",
      properties: { key: item.key, qualityWarning: item.qualityWarning, endpoint: item.endpoint },
      geometry: { type: "Point", coordinates: [item.point.longitude, item.point.latitude] },
    })),
  };
  let pointOffset = 0;
  const lineFeatures: Array<Feature<LineString, Record<string, never>>> = [];
  const segments: VehicleTrackPresentationSegment[] = [];
  const gaps: VehicleTrackPresentationGap[] = [];
  for (const [segmentIndex, segment] of response.segments.entries()) {
    const segmentPoints = points.slice(pointOffset, pointOffset + segment.points.length);
    const firstPointIndex = pointOffset;
    pointOffset += segment.points.length;
    segments.push(Object.freeze({ key: `segment-${segmentIndex}`, firstObservedAt: segment.firstObservedAt, lastObservedAt: segment.lastObservedAt, firstPointIndex, lastPointIndex: pointOffset - 1 }));
    const next = response.segments[segmentIndex + 1];
    if (next) gaps.push(Object.freeze({ key: `gap-${segmentIndex}`, from: segment.lastObservedAt, to: next.firstObservedAt, durationSeconds: (Date.parse(next.firstObservedAt) - Date.parse(segment.lastObservedAt)) / 1_000 }));
    if (segmentPoints.length >= 2) lineFeatures.push({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: segmentPoints.map((item) => [item.point.longitude, item.point.latitude]) },
    });
  }
  const longitudes = points.map((item) => item.point.longitude); const latitudes = points.map((item) => item.point.latitude);
  const bounds: VehicleTrackBounds | null = points.length === 0 ? null : [[Math.min(...longitudes), Math.min(...latitudes)], [Math.max(...longitudes), Math.max(...latitudes)]];
  const lineGeoJson: VehicleTrackLineCollection = { type: "FeatureCollection", features: lineFeatures };
  return Object.freeze({ points: Object.freeze(points), segments: Object.freeze(segments), gaps: Object.freeze(gaps), pointGeoJson, lineGeoJson, bounds, gapCount: response.summary.gapCount, start: points[0] ?? null, end: points.at(-1) ?? null });
}

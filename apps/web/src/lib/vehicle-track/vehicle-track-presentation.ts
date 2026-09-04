import type { Feature, FeatureCollection, LineString, Point } from "geojson";
import type { VehicleTrackPoint, VehicleTrackResponse } from "./vehicle-track-contract";

export const MAX_CONNECTED_GAP_SECONDS = 300;
export type VehicleTrackPointProperties = Readonly<{ key: string; qualityWarning: boolean; endpoint: "none" | "start" | "end" | "single" }>;
export type VehicleTrackPointCollection = FeatureCollection<Point, VehicleTrackPointProperties>;
export type VehicleTrackLineCollection = FeatureCollection<LineString, Record<string, never>>;
export type VehicleTrackBounds = readonly [readonly [number, number], readonly [number, number]];
export type VehicleTrackPresentationPoint = Readonly<{ key: string; index: number; point: VehicleTrackPoint; qualityWarning: boolean; endpoint: VehicleTrackPointProperties["endpoint"] }>;
export type VehicleTrackPresentationSegment = Readonly<{ key: string; firstObservedAt: string; lastObservedAt: string; firstPointIndex: number; lastPointIndex: number }>;
export type VehicleTrackPresentationGap = Readonly<{ key: string; from: string; to: string; durationSeconds: number }>;
export type VehicleTrackPresentationModel = Readonly<{
  points: readonly VehicleTrackPresentationPoint[];
  segments: readonly VehicleTrackPresentationSegment[];
  gaps: readonly VehicleTrackPresentationGap[];
  pointGeoJson: VehicleTrackPointCollection;
  lineGeoJson: VehicleTrackLineCollection;
  bounds: VehicleTrackBounds | null;
  gapCount: number;
  start: VehicleTrackPresentationPoint | null;
  end: VehicleTrackPresentationPoint | null;
}>;

export class VehicleTrackPresentationError extends Error { public constructor() { super("Invalid ordered vehicle track."); this.name = "VehicleTrackPresentationError"; } }
export function isVehicleTrackQualityWarning(point: VehicleTrackPoint): boolean { return point.valid === false || point.outdated === true; }
export const EMPTY_VEHICLE_TRACK_PRESENTATION: VehicleTrackPresentationModel = Object.freeze({ points: Object.freeze([]), segments: Object.freeze([]), gaps: Object.freeze([]), pointGeoJson: { type: "FeatureCollection", features: [] } as VehicleTrackPointCollection, lineGeoJson: { type: "FeatureCollection", features: [] } as VehicleTrackLineCollection, bounds: null, gapCount: 0, start: null, end: null });

export function buildVehicleTrackPresentation(response: VehicleTrackResponse): VehicleTrackPresentationModel {
  const times = response.points.map((point) => Date.parse(point.observedAt));
  if (times.some((time) => !Number.isFinite(time))) throw new VehicleTrackPresentationError();
  for (let index = 1; index < times.length; index += 1) if (times[index]! < times[index - 1]!) throw new VehicleTrackPresentationError();
  const points = response.points.map((point, index): VehicleTrackPresentationPoint => {
    const endpoint = response.points.length === 1 ? "single" : index === 0 ? "start" : index === response.points.length - 1 ? "end" : "none";
    return Object.freeze({ key: String(index), index, point, qualityWarning: isVehicleTrackQualityWarning(point), endpoint });
  });
  const pointGeoJson: VehicleTrackPointCollection = { type: "FeatureCollection", features: points.map((item): Feature<Point, VehicleTrackPointProperties> => ({ type: "Feature", properties: { key: item.key, qualityWarning: item.qualityWarning, endpoint: item.endpoint }, geometry: { type: "Point", coordinates: [item.point.longitude, item.point.latitude] } })) };
  const lineFeatures: Array<Feature<LineString, Record<string, never>>> = [];
  const segments: VehicleTrackPresentationSegment[] = [];
  const gaps: VehicleTrackPresentationGap[] = [];
  let segment: number[][] = [];
  let segmentStartIndex = 0;
  for (let index = 0; index < points.length; index += 1) {
    const item = points[index]!; const coordinate = [item.point.longitude, item.point.latitude];
    if (index === 0) { segment = [coordinate]; continue; }
    const gapSeconds = (times[index]! - times[index - 1]!) / 1_000;
    if (gapSeconds > MAX_CONNECTED_GAP_SECONDS) {
      if (segment.length > 1) lineFeatures.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: segment } });
      segments.push(Object.freeze({ key: `segment-${segments.length}`, firstObservedAt: points[segmentStartIndex]!.point.observedAt, lastObservedAt: points[index - 1]!.point.observedAt, firstPointIndex: segmentStartIndex, lastPointIndex: index - 1 }));
      gaps.push(Object.freeze({ key: `gap-${gaps.length}`, from: points[index - 1]!.point.observedAt, to: item.point.observedAt, durationSeconds: gapSeconds }));
      segmentStartIndex = index;
      segment = [coordinate];
    } else segment.push(coordinate);
  }
  if (points.length > 0) {
    if (segment.length > 1) lineFeatures.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: segment } });
    segments.push(Object.freeze({ key: `segment-${segments.length}`, firstObservedAt: points[segmentStartIndex]!.point.observedAt, lastObservedAt: points.at(-1)!.point.observedAt, firstPointIndex: segmentStartIndex, lastPointIndex: points.length - 1 }));
  }
  const longitudes = points.map((item) => item.point.longitude); const latitudes = points.map((item) => item.point.latitude);
  const bounds: VehicleTrackBounds | null = points.length === 0 ? null : [[Math.min(...longitudes), Math.min(...latitudes)], [Math.max(...longitudes), Math.max(...latitudes)]];
  const lineGeoJson: VehicleTrackLineCollection = { type: "FeatureCollection", features: lineFeatures };
  return Object.freeze({ points: Object.freeze(points), segments: Object.freeze(segments), gaps: Object.freeze(gaps), pointGeoJson, lineGeoJson, bounds, gapCount: gaps.length, start: points[0] ?? null, end: points.at(-1) ?? null });
}

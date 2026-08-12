import type { Feature, Point } from "geojson";
import type { VehicleTrackPoint } from "../vehicle-track/vehicle-track-contract";
import { vehicleTrackModeForRange, type VehicleTrackMode, type VehicleTrackRange } from "../vehicle-track/vehicle-track-range";
import type { VehicleTrackLineCollection, VehicleTrackPointCollection, VehicleTrackPointProperties, VehicleTrackPresentationModel, VehicleTrackPresentationPoint } from "../vehicle-track/vehicle-track-presentation";
import type { TripAnalysisSelection } from "./trip-analysis-timeline";
export function selectedTripTrackRequest(selection: TripAnalysisSelection | null): Readonly<{ mode: VehicleTrackMode; range: VehicleTrackRange }> | null { if (!selection || selection.kind !== "TRIP") return null; const range = { from: selection.value.startAt, to: selection.value.endAt }; const mode = vehicleTrackModeForRange(range); return mode ? Object.freeze({ mode, range: Object.freeze(range) }) : null; }
export function selectedStopBoundaryPresentation(selection: TripAnalysisSelection): VehicleTrackPresentationModel | null {
  if (selection.kind !== "STOP") return null;
  const source: VehicleTrackPoint[] = [selection.value.startPosition, selection.value.endPosition].map((point) => ({ ...point, speedKph: null, valid: null, outdated: null }));
  const points: VehicleTrackPresentationPoint[] = source.map((point, index) => Object.freeze({ key: String(index), index, point, qualityWarning: false, endpoint: index === 0 ? "start" : "end" }));
  const pointGeoJson: VehicleTrackPointCollection = { type: "FeatureCollection", features: points.map((item): Feature<Point, VehicleTrackPointProperties> => ({ type: "Feature", properties: { key: item.key, qualityWarning: false, endpoint: item.endpoint }, geometry: { type: "Point", coordinates: [item.point.longitude, item.point.latitude] } })) };
  const lineGeoJson: VehicleTrackLineCollection = { type: "FeatureCollection", features: [] };
  const longitudes = points.map((item) => item.point.longitude); const latitudes = points.map((item) => item.point.latitude);
  const bounds: VehicleTrackPresentationModel["bounds"] = [[Math.min(...longitudes), Math.min(...latitudes)], [Math.max(...longitudes), Math.max(...latitudes)]];
  return Object.freeze({ points: Object.freeze(points), pointGeoJson, lineGeoJson, bounds, gapCount: 0, start: points[0]!, end: points[1]! });
}

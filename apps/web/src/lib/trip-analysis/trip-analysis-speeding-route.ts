import type { Feature, FeatureCollection, LineString } from "geojson";
import type { SpeedingEventInvestigation } from "../alert-events/alert-events-contract";
import { MAX_CONNECTED_GAP_SECONDS, type VehicleTrackPresentationModel } from "../vehicle-track/vehicle-track-presentation";
import type { TripAnalysisTrip } from "./trip-analysis-contract";

export type SpeedingRouteFeatureProperties = Readonly<{ segmentIndex: number }>;
export type SpeedingRouteGeoJson = FeatureCollection<LineString, SpeedingRouteFeatureProperties>;
export type SpeedingRoutePresentation = Readonly<{
  geoJson: SpeedingRouteGeoJson;
  hasEvidence: boolean;
  hasDrawableGeometry: boolean;
  partial: boolean;
}>;

type Candidate = Readonly<{ time: number; longitude: number; latitude: number; trackEvidence: boolean }>;

function collection(features: Array<Feature<LineString, SpeedingRouteFeatureProperties>>): SpeedingRouteGeoJson {
  return { type: "FeatureCollection", features };
}

function validTime(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new TypeError("Invalid speeding route timestamp");
  return parsed;
}

export function buildSpeedingSegmentGeoJson(segments: SpeedingEventInvestigation["speedingSegments"], selectedTrip: TripAnalysisTrip | null, track: VehicleTrackPresentationModel): SpeedingRoutePresentation {
  const features: Array<Feature<LineString, SpeedingRouteFeatureProperties>> = [];
  if (segments.length === 0) return Object.freeze({ geoJson: collection(features), hasEvidence: false, hasDrawableGeometry: false, partial: false });
  if (selectedTrip === null) return Object.freeze({ geoJson: collection(features), hasEvidence: true, hasDrawableGeometry: false, partial: true });
  const tripStart = validTime(selectedTrip.startAt); const tripEnd = validTime(selectedTrip.endAt);
  let partial = false;
  for (const [segmentIndex, segment] of segments.entries()) {
    const segmentStart = validTime(segment.startedAt); const segmentEnd = validTime(segment.lastSpeedingObservedAt);
    if (segmentStart > segmentEnd) throw new TypeError("Invalid speeding route interval");
    const overlapStart = Math.max(segmentStart, tripStart); const overlapEnd = Math.min(segmentEnd, tripEnd);
    if (segmentStart < tripStart || segmentEnd > tripEnd) partial = true;
    if (overlapStart > overlapEnd) continue;

    const byTime = new Map<number, Candidate>();
    for (const item of track.points) {
      const time = validTime(item.point.observedAt);
      if (time < overlapStart || time > overlapEnd) continue;
      if (!byTime.has(time)) byTime.set(time, { time, longitude: item.point.longitude, latitude: item.point.latitude, trackEvidence: true });
    }
    const addBoundary = (time: number, position: Readonly<{ latitude: number; longitude: number }>) => {
      if (time < tripStart || time > tripEnd) return;
      const existing = byTime.get(time);
      byTime.set(time, { time, longitude: position.longitude, latitude: position.latitude, trackEvidence: existing?.trackEvidence ?? false });
    };
    addBoundary(segmentStart, segment.startPosition);
    addBoundary(segmentEnd, segment.lastSpeedingPosition);

    const candidates = [...byTime.values()].sort((left, right) => left.time - right.time);
    const runs: Candidate[][] = [];
    let run: Candidate[] = [];
    for (const candidate of candidates) {
      if (run.length > 0 && candidate.time - run.at(-1)!.time > MAX_CONNECTED_GAP_SECONDS * 1_000) {
        runs.push(run); run = []; partial = true;
      }
      run.push(candidate);
    }
    if (run.length > 0) runs.push(run);
    let segmentRendered = false;
    for (const connected of runs) {
      if (connected.length < 2 || !connected.some((candidate) => candidate.trackEvidence)) continue;
      segmentRendered = true;
      features.push({ type: "Feature", properties: { segmentIndex }, geometry: { type: "LineString", coordinates: connected.map((candidate) => [candidate.longitude, candidate.latitude]) } });
    }
    const first = candidates[0];
    const last = candidates.at(-1);
    if (!segmentRendered || first === undefined || last === undefined || first.time > overlapStart || last.time < overlapEnd) partial = true;
  }
  return Object.freeze({ geoJson: collection(features), hasEvidence: true, hasDrawableGeometry: features.length > 0, partial });
}

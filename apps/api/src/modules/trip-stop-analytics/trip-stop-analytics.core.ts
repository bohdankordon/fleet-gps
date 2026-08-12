import {
  DATA_GAP_SECONDS,
  MOVEMENT_CONFIRMATION_SECONDS,
  MOVEMENT_THRESHOLD_KPH,
  STOP_CONFIRMATION_SECONDS,
} from "./trip-stop-analytics.constants";
import type {
  DerivedDataGap,
  DerivedStop,
  DerivedStopTerminationReason,
  DerivedTrip,
  DerivedTripTerminationReason,
  TripStopAnalyticsCoreResult,
  TripStopAnalyticsObservation,
  TripStopAnalyticsPosition,
  TripStopAnalyticsRange,
} from "./trip-stop-analytics.types";

const EARTH_RADIUS_METERS = 6_371_000;

type IndexedObservation = Readonly<{ observation: TripStopAnalyticsObservation; originalIndex: number }>;
type Candidate = Readonly<{ startIndex: number; latestIndex: number }>;
type ActiveEvent = Readonly<{ startIndex: number }>;

function cloneDate(value: Date): Date { return new Date(value.getTime()); }
function seconds(milliseconds: number): number { return milliseconds / 1_000; }
function radians(degrees: number): number { return degrees * Math.PI / 180; }

function position(observation: TripStopAnalyticsObservation): TripStopAnalyticsPosition {
  return Object.freeze({ observedAt: cloneDate(observation.observedAt), latitude: observation.latitude, longitude: observation.longitude });
}

function validCoordinate(latitude: number, longitude: number): boolean {
  return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}

function validateRange(range: TripStopAnalyticsRange): void {
  const from = range.from.getTime();
  const to = range.to.getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) throw new Error("Invalid trip/stop analytics range");
}

function orderedInRange(observations: readonly TripStopAnalyticsObservation[], range: TripStopAnalyticsRange): TripStopAnalyticsObservation[] {
  const from = range.from.getTime();
  const to = range.to.getTime();
  const indexed: IndexedObservation[] = [];
  observations.forEach((observation, originalIndex) => {
    const observedAt = observation.observedAt.getTime();
    if (!Number.isFinite(observedAt)) throw new Error("Trip/stop analytics observation has an invalid timestamp");
    if (!validCoordinate(observation.latitude, observation.longitude)) throw new Error("Trip/stop analytics observation has invalid coordinates");
    if (observation.fixFingerprint.length === 0) throw new Error("Trip/stop analytics observation has an empty fingerprint");
    if (observedAt >= from && observedAt <= to) indexed.push({ observation, originalIndex });
  });
  indexed.sort((left, right) => {
    const time = left.observation.observedAt.getTime() - right.observation.observedAt.getTime();
    if (time !== 0) return time;
    if (left.observation.fixFingerprint < right.observation.fixFingerprint) return -1;
    if (left.observation.fixFingerprint > right.observation.fixFingerprint) return 1;
    return left.originalIndex - right.originalIndex;
  });
  return indexed.map(({ observation }) => observation);
}

export function calculateObservedDistanceMeters(from: Pick<TripStopAnalyticsObservation, "latitude" | "longitude">, to: Pick<TripStopAnalyticsObservation, "latitude" | "longitude">): number {
  if (!validCoordinate(from.latitude, from.longitude) || !validCoordinate(to.latitude, to.longitude)) throw new Error("Cannot calculate distance for invalid coordinates");
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const firstLatitude = radians(from.latitude);
  const secondLatitude = radians(to.latitude);
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function observedPathDistance(observations: readonly TripStopAnalyticsObservation[], startIndex: number, endIndex: number): number {
  let distance = 0;
  for (let index = startIndex + 1; index <= endIndex; index += 1) {
    const previous = observations[index - 1];
    const current = observations[index];
    if (!previous || !current) throw new Error("Invalid trip observation interval");
    const elapsed = current.observedAt.getTime() - previous.observedAt.getTime();
    if (elapsed > 0 && elapsed <= DATA_GAP_SECONDS * 1_000) distance += calculateObservedDistanceMeters(previous, current);
  }
  return distance;
}

function candidateWith(candidate: Candidate | null, index: number): Candidate {
  return candidate === null ? { startIndex: index, latestIndex: index } : { startIndex: candidate.startIndex, latestIndex: index };
}

function candidateElapsed(observations: readonly TripStopAnalyticsObservation[], candidate: Candidate): number {
  const first = observations[candidate.startIndex];
  const latest = observations[candidate.latestIndex];
  if (!first || !latest) throw new Error("Invalid analytics candidate");
  return latest.observedAt.getTime() - first.observedAt.getTime();
}

function signal(observation: TripStopAnalyticsObservation): "MOVEMENT" | "STOPPED" | "UNKNOWN" {
  if (observation.speedKph === null || !Number.isFinite(observation.speedKph)) return "UNKNOWN";
  return observation.speedKph >= MOVEMENT_THRESHOLD_KPH ? "MOVEMENT" : "STOPPED";
}

function createTrip(observations: readonly TripStopAnalyticsObservation[], range: TripStopAnalyticsRange, active: ActiveEvent, endIndex: number, endAt: Date, terminationReason: DerivedTripTerminationReason): DerivedTrip {
  const start = observations[active.startIndex];
  const end = observations[endIndex];
  if (!start || !end) throw new Error("Invalid trip interval");
  return Object.freeze({
    startAt: cloneDate(start.observedAt),
    endAt: cloneDate(endAt),
    durationSeconds: seconds(endAt.getTime() - start.observedAt.getTime()),
    observedDistanceMeters: observedPathDistance(observations, active.startIndex, endIndex),
    startPosition: position(start),
    endPosition: position(end),
    terminationReason,
    startsAtRangeBoundary: start.observedAt.getTime() === range.from.getTime(),
    endsAtRangeBoundary: terminationReason === "RANGE_END",
    observationCount: endIndex - active.startIndex + 1,
  });
}

function createStop(observations: readonly TripStopAnalyticsObservation[], range: TripStopAnalyticsRange, active: ActiveEvent, endIndex: number, endAt: Date, terminationReason: DerivedStopTerminationReason): DerivedStop {
  const start = observations[active.startIndex];
  const end = observations[endIndex];
  if (!start || !end) throw new Error("Invalid stop interval");
  return Object.freeze({
    startAt: cloneDate(start.observedAt),
    endAt: cloneDate(endAt),
    durationSeconds: seconds(endAt.getTime() - start.observedAt.getTime()),
    startPosition: position(start),
    endPosition: position(end),
    terminationReason,
    startsAtRangeBoundary: start.observedAt.getTime() === range.from.getTime(),
    endsAtRangeBoundary: terminationReason === "RANGE_END",
    observationCount: endIndex - active.startIndex + 1,
  });
}

export function analyzeTripStopObservations(input: readonly TripStopAnalyticsObservation[], range: TripStopAnalyticsRange): TripStopAnalyticsCoreResult {
  validateRange(range);
  const observations = orderedInRange(input, range);
  const trips: DerivedTrip[] = [];
  const stops: DerivedStop[] = [];
  const gaps: DerivedDataGap[] = [];
  let continuitySegmentCount = observations.length === 0 ? 0 : 1;
  let movementCandidate: Candidate | null = null;
  let stopCandidate: Candidate | null = null;
  let activeTrip: ActiveEvent | null = null;
  let activeStop: ActiveEvent | null = null;

  for (let index = 0; index < observations.length; index += 1) {
    const observation = observations[index];
    if (!observation) throw new Error("Missing analytics observation");
    if (index > 0) {
      const previous = observations[index - 1];
      if (!previous) throw new Error("Missing previous analytics observation");
      const gapMilliseconds = observation.observedAt.getTime() - previous.observedAt.getTime();
      if (gapMilliseconds > DATA_GAP_SECONDS * 1_000) {
        gaps.push(Object.freeze({ fromObservedAt: cloneDate(previous.observedAt), toObservedAt: cloneDate(observation.observedAt), durationSeconds: seconds(gapMilliseconds) }));
        continuitySegmentCount += 1;
        if (activeTrip !== null) trips.push(createTrip(observations, range, activeTrip, index - 1, previous.observedAt, "DATA_GAP"));
        if (activeStop !== null) stops.push(createStop(observations, range, activeStop, index - 1, previous.observedAt, "DATA_GAP"));
        activeTrip = null;
        activeStop = null;
        movementCandidate = null;
        stopCandidate = null;
      }
    }

    const evidence = signal(observation);
    if (activeTrip !== null) {
      if (evidence === "STOPPED") {
        stopCandidate = candidateWith(stopCandidate, index);
        if (candidateElapsed(observations, stopCandidate) >= STOP_CONFIRMATION_SECONDS * 1_000) {
          trips.push(createTrip(observations, range, activeTrip, stopCandidate.startIndex, observations[stopCandidate.startIndex]!.observedAt, "STOP"));
          activeTrip = null;
          activeStop = { startIndex: stopCandidate.startIndex };
          stopCandidate = null;
        }
      } else {
        stopCandidate = null;
      }
      continue;
    }

    if (activeStop !== null) {
      if (evidence === "MOVEMENT") {
        movementCandidate = candidateWith(movementCandidate, index);
        if (candidateElapsed(observations, movementCandidate) >= MOVEMENT_CONFIRMATION_SECONDS * 1_000) {
          stops.push(createStop(observations, range, activeStop, movementCandidate.startIndex, observations[movementCandidate.startIndex]!.observedAt, "MOVEMENT"));
          activeStop = null;
          activeTrip = { startIndex: movementCandidate.startIndex };
          movementCandidate = null;
        }
      } else {
        movementCandidate = null;
      }
      continue;
    }

    if (evidence === "MOVEMENT") {
      stopCandidate = null;
      movementCandidate = candidateWith(movementCandidate, index);
      if (candidateElapsed(observations, movementCandidate) >= MOVEMENT_CONFIRMATION_SECONDS * 1_000) {
        activeTrip = { startIndex: movementCandidate.startIndex };
        movementCandidate = null;
      }
    } else if (evidence === "STOPPED") {
      movementCandidate = null;
      stopCandidate = candidateWith(stopCandidate, index);
      if (candidateElapsed(observations, stopCandidate) >= STOP_CONFIRMATION_SECONDS * 1_000) {
        activeStop = { startIndex: stopCandidate.startIndex };
        stopCandidate = null;
      }
    } else {
      movementCandidate = null;
      stopCandidate = null;
    }
  }

  const finalIndex = observations.length - 1;
  const finalObservation = observations[finalIndex];
  if (finalObservation !== undefined && activeTrip !== null) trips.push(createTrip(observations, range, activeTrip, finalIndex, finalObservation.observedAt, "RANGE_END"));
  if (finalObservation !== undefined && activeStop !== null) stops.push(createStop(observations, range, activeStop, finalIndex, finalObservation.observedAt, "RANGE_END"));
  const first = observations[0];
  const last = observations[finalIndex];
  const totalObservedTripDistanceMeters = trips.reduce((total, trip) => total + trip.observedDistanceMeters, 0);

  return Object.freeze({
    range: Object.freeze({ from: cloneDate(range.from), to: cloneDate(range.to), inclusive: true as const }),
    rawObservationCount: observations.length,
    continuitySegmentCount,
    firstObservationAt: first ? cloneDate(first.observedAt) : null,
    lastObservationAt: last ? cloneDate(last.observedAt) : null,
    trips: Object.freeze(trips),
    stops: Object.freeze(stops),
    gaps: Object.freeze(gaps),
    totalObservedTripDistanceMeters,
  });
}

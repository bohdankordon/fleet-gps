import type { TripAnalysisGap, TripAnalysisResponse, TripAnalysisStop, TripAnalysisTrip } from "./trip-analysis-contract";
export type TripAnalysisTimelineItem = Readonly<{ key: string; kind: "TRIP"; startAt: string; endAt: string; value: TripAnalysisTrip } | { key: string; kind: "STOP"; startAt: string; endAt: string; value: TripAnalysisStop } | { key: string; kind: "GAP"; startAt: string; endAt: string; value: TripAnalysisGap }>;
export type TripAnalysisSelection = Extract<TripAnalysisTimelineItem, { kind: "TRIP" | "STOP" }>;
export function buildTripAnalysisTimeline(response: TripAnalysisResponse): readonly TripAnalysisTimelineItem[] {
  const items: TripAnalysisTimelineItem[] = [
    ...response.trips.map((value, index) => ({ key: `trip-${index}`, kind: "TRIP" as const, startAt: value.startAt, endAt: value.endAt, value })),
    ...response.stops.map((value, index) => ({ key: `stop-${index}`, kind: "STOP" as const, startAt: value.startAt, endAt: value.endAt, value })),
    ...response.gaps.map((value, index) => ({ key: `gap-${index}`, kind: "GAP" as const, startAt: value.fromObservedAt, endAt: value.toObservedAt, value })),
  ];
  items.sort((left, right) => Date.parse(left.startAt) - Date.parse(right.startAt) || (left.kind === "TRIP" ? 0 : left.kind === "STOP" ? 1 : 2) - (right.kind === "TRIP" ? 0 : right.kind === "STOP" ? 1 : 2));
  return Object.freeze(items);
}


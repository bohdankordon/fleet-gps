import type { TripAnalysisSelection } from "./trip-analysis-timeline";
export type TripAnalysisInteractionState = Readonly<{ selection: TripAnalysisSelection | null; trackError: boolean }>;
export function initialTripAnalysisInteractionState(): TripAnalysisInteractionState { return Object.freeze({ selection: null, trackError: false }); }
export function clearTripAnalysisInteraction(): TripAnalysisInteractionState { return initialTripAnalysisInteractionState(); }
export function selectTripAnalysisItem(selection: TripAnalysisSelection): TripAnalysisInteractionState { return Object.freeze({ selection, trackError: false }); }
export function failSelectedTrack(state: TripAnalysisInteractionState): TripAnalysisInteractionState { return Object.freeze({ ...state, trackError: true }); }

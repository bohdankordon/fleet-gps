import type { AlertEvaluationResult } from "../alert-evaluation";
import type { NormalizedSpeedingObservation } from "../speeding-detector";

export type AlertObservationJournalOutcome = "CREATED" | "EXISTING" | "ALREADY_PROCESSED" | "INVALID";

export type AlertObservationIngestionResult = Readonly<{
  vehicleId: string;
  observedAt: string | null;
  journalOutcome: AlertObservationJournalOutcome;
  processingPerformed: boolean;
  evaluation: AlertEvaluationResult | null;
  processed: boolean;
}>;

export type AlertEvaluationJournalObservation = Readonly<{
  id: string;
  vehicleId: string;
  observedAt: Date;
  latitude: number;
  longitude: number;
  speedKph: number;
  processedAt: Date | null;
  replayEligible: boolean | null;
  createdAt: Date;
}>;

export type CreateOrFindAlertObservationResult = Readonly<{
  outcome: "CREATED" | "EXISTING";
  observation: AlertEvaluationJournalObservation;
}>;

export class AlertObservationIdentityConflictError extends Error {
  public constructor(public readonly vehicleId: string, public readonly observedAt: string, options?: ErrorOptions) {
    super(`Alert evaluation observation identity conflict for vehicle ${vehicleId} at ${observedAt}`, options);
    this.name = "AlertObservationIdentityConflictError";
  }
}

export class AlertObservationPersistenceStateError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "AlertObservationPersistenceStateError";
  }
}

export type DurableAlertObservation = NormalizedSpeedingObservation;

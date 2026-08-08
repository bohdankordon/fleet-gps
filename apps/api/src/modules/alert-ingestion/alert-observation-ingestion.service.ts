import { Injectable } from "@nestjs/common";
import { normalizeUuid } from "../../common/uuid.validation";
import { AlertEvaluationService, type AlertEvaluationObservation } from "../alert-evaluation";
import { AlertSettingsService } from "../alert-settings";
import { normalizeSpeedingObservation, safeObservedAt, safeVehicleId } from "../speeding-detector";
import type { AlertEvaluationJournalObservation, AlertObservationIngestionResult, DurableAlertObservation } from "./alert-ingestion.types";
import { AlertObservationPersistenceStateError } from "./alert-ingestion.types";
import { AlertObservationRepository } from "./alert-observation.repository";

function replayInput(row: AlertEvaluationJournalObservation): AlertEvaluationObservation {
  return Object.freeze({
    vehicleId: row.vehicleId,
    observedAt: row.observedAt.toISOString(),
    latitude: row.latitude,
    longitude: row.longitude,
    speedKph: row.speedKph,
  });
}

@Injectable()
export class AlertObservationIngestionService {
  private readonly vehicleQueues = new Map<string, Promise<void>>();
  private readonly initializedVehicles = new Set<string>();
  private readonly replayFrontiers = new Map<string, number | null>();

  public constructor(
    private readonly repository: AlertObservationRepository,
    private readonly evaluation: AlertEvaluationService,
    private readonly alertSettings: AlertSettingsService,
  ) {}

  public async ingestObservation(observation: AlertEvaluationObservation): Promise<AlertObservationIngestionResult> {
    // This pure helper is the speeding detector's authoritative validation for
    // every field shared by both alert pipelines. No detector state is touched.
    const normalized = normalizeSpeedingObservation(observation);
    if (normalized === null) {
      const evaluation = await this.evaluation.evaluateObservation(observation);
      return Object.freeze({
        vehicleId: safeVehicleId(observation.vehicleId),
        observedAt: safeObservedAt(observation.observedAt),
        journalOutcome: "INVALID",
        processingPerformed: false,
        evaluation,
        processed: false,
      });
    }
    const vehicleId = normalizeUuid(normalized.vehicleId);
    if (vehicleId === null) {
      return Object.freeze({
        vehicleId: normalized.vehicleId,
        observedAt: normalized.observedAt,
        journalOutcome: "INVALID",
        processingPerformed: false,
        evaluation: null,
        processed: false,
      });
    }
    const durableObservation = Object.freeze({ ...normalized, vehicleId });
    return this.enqueueVehicle(vehicleId, () => this.ingestValidObservation(durableObservation));
  }

  public activeVehicleQueueCount(): number { return this.vehicleQueues.size; }
  public initializedVehicleCount(): number { return this.initializedVehicles.size; }

  public resetVehicle(vehicleId: string): void {
    this.initializedVehicles.delete(vehicleId);
    this.replayFrontiers.delete(vehicleId);
    this.evaluation.resetVehicle(vehicleId);
  }

  /** Clears only in-memory queues/bootstrap markers and detector state. Journal rows remain durable. */
  public clearAll(): void {
    this.vehicleQueues.clear();
    this.initializedVehicles.clear();
    this.replayFrontiers.clear();
    this.evaluation.clearAll();
  }

  private async ingestValidObservation(observation: DurableAlertObservation): Promise<AlertObservationIngestionResult> {
    // Durable insert/find is deliberately the first stateful operation.
    const journal = await this.repository.createOrFindObservation(observation);
    if (journal.observation.processedAt !== null) {
      return Object.freeze({
        vehicleId: observation.vehicleId,
        observedAt: observation.observedAt,
        journalOutcome: "ALREADY_PROCESSED",
        processingPerformed: false,
        evaluation: null,
        processed: true,
      });
    }

    try {
      const pending = await this.repository.findPendingThrough(observation.vehicleId, journal.observation.observedAt);
      let evaluation = null;
      for (const pendingObservation of pending) {
        const currentEvaluation = await this.processJournalObservation(pendingObservation);
        if (pendingObservation.id === journal.observation.id) evaluation = currentEvaluation;
      }
      if (evaluation === null) throw new AlertObservationPersistenceStateError("Pending target was not returned by ordered journal drain");
      return Object.freeze({
        vehicleId: observation.vehicleId,
        observedAt: observation.observedAt,
        journalOutcome: journal.outcome,
        processingPerformed: true,
        evaluation,
        processed: true,
      });
    } catch (error) {
      // The failed target is still pending. Drop both detector states so its exact
      // timestamp can be applied again after replaying processed predecessors.
      this.resetVehicle(observation.vehicleId);
      throw error;
    }
  }

  private async processJournalObservation(observation: AlertEvaluationJournalObservation) {
    await this.bootstrapVehicleIfRequired(observation.vehicleId);
    const frontier = this.replayFrontiers.get(observation.vehicleId);
    if (frontier === undefined) throw new AlertObservationPersistenceStateError("Replay frontier was not initialized");
    const replayEligible = frontier === null || observation.observedAt.getTime() > frontier;
    const evaluation = await this.evaluation.evaluateObservation(replayInput(observation));
    await this.repository.markProcessed(observation.id, replayEligible);
    if (replayEligible) this.replayFrontiers.set(observation.vehicleId, observation.observedAt.getTime());
    return evaluation;
  }

  private async bootstrapVehicleIfRequired(vehicleId: string): Promise<void> {
    if (this.initializedVehicles.has(vehicleId)) return;
    this.evaluation.resetVehicle(vehicleId);
    const latestReplayEligible = await this.repository.findLatestReplayEligibleObservation(vehicleId);
    if (latestReplayEligible === null) {
      this.replayFrontiers.set(vehicleId, null);
      this.initializedVehicles.add(vehicleId);
      return;
    }
    const settings = await this.alertSettings.getSettings();
    const cutoff = new Date(latestReplayEligible.observedAt.getTime() - settings.inactivityDurationMinutes * 60_000);
    const history = await this.repository.findReplayState(vehicleId, cutoff, latestReplayEligible.observedAt, settings.speedingConfirmationUpdates);
    for (const observation of history) await this.evaluation.primeObservation(replayInput(observation), settings);
    // Replay intentionally uses current-settings semantics. Historical settings
    // versions are not persisted in this Stage 6C.2A journal. A future settings
    // mutation workflow must reset this marker so the vehicle is re-bootstrapped.
    this.replayFrontiers.set(vehicleId, latestReplayEligible.observedAt.getTime());
    this.initializedVehicles.add(vehicleId);
  }

  private enqueueVehicle<T>(vehicleId: string, task: () => Promise<T>): Promise<T> {
    const predecessor = this.vehicleQueues.get(vehicleId) ?? Promise.resolve();
    const current = predecessor.catch(() => undefined).then(task);
    const tail = current.then(() => undefined, () => undefined);
    this.vehicleQueues.set(vehicleId, tail);
    return current.finally(() => {
      if (this.vehicleQueues.get(vehicleId) === tail) this.vehicleQueues.delete(vehicleId);
    });
  }
}

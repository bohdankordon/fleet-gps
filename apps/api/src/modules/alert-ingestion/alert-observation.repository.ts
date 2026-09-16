import { Injectable } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client";
import { DatabaseService } from "../database";
import type { AlertEvaluationJournalObservation, CreateOrFindAlertObservationResult, DurableAlertObservation, DurableSpeedingDetectorCheckpoint } from "./alert-ingestion.types";
import { AlertObservationIdentityConflictError, AlertObservationPersistenceStateError } from "./alert-ingestion.types";

const journalSelect = {
  id: true,
  vehicleId: true,
  observedAt: true,
  latitude: true,
  longitude: true,
  speedKph: true,
  processedAt: true,
  replayEligible: true,
  createdAt: true,
} satisfies Prisma.AlertEvaluationObservationSelect;

function conflictTargets(error: Prisma.PrismaClientKnownRequestError): string[] {
  const target = error.meta?.target;
  if (typeof target === "string") return [target];
  if (Array.isArray(target)) return target.filter((value): value is string => typeof value === "string");
  const driverAdapterError = error.meta?.driverAdapterError;
  if (typeof driverAdapterError !== "object" || driverAdapterError === null) return [];
  const cause = (driverAdapterError as { cause?: unknown }).cause;
  if (typeof cause !== "object" || cause === null) return [];
  const constraint = (cause as { constraint?: unknown }).constraint;
  if (typeof constraint !== "object" || constraint === null) return [];
  const fields = (constraint as { fields?: unknown }).fields;
  return Array.isArray(fields) ? fields.filter((value): value is string => typeof value === "string") : [];
}

function isObservationIdentityConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;
  const targets = conflictTargets(error);
  return targets.includes("alert_evaluation_observations_vehicle_id_observed_at_key")
    || (targets.some((target) => target === "vehicleId" || target === "vehicle_id")
      && targets.some((target) => target === "observedAt" || target === "observed_at"));
}

function sameImmutablePayload(row: AlertEvaluationJournalObservation, observation: DurableAlertObservation): boolean {
  return row.vehicleId === observation.vehicleId
    && row.observedAt.getTime() === observation.observedAtMs
    && row.latitude === observation.latitude
    && row.longitude === observation.longitude
    && row.speedKph === observation.speedKph;
}

@Injectable()
export class AlertObservationRepository {
  public constructor(private readonly database: DatabaseService) {}

  public async createOrFindObservation(observation: DurableAlertObservation): Promise<CreateOrFindAlertObservationResult> {
    const client = this.database.getClient();
    const identity = { vehicleId: observation.vehicleId, observedAt: new Date(observation.observedAtMs) };
    const existingBeforeCreate = await client.alertEvaluationObservation.findUnique({
      where: { vehicleId_observedAt: identity },
      select: journalSelect,
    });
    if (existingBeforeCreate !== null) {
      if (!sameImmutablePayload(existingBeforeCreate, observation)) {
        throw new AlertObservationIdentityConflictError(observation.vehicleId, observation.observedAt);
      }
      return Object.freeze({ outcome: "EXISTING", observation: Object.freeze(existingBeforeCreate) });
    }
    try {
      const created = await client.alertEvaluationObservation.create({
        data: {
          ...identity,
          latitude: observation.latitude,
          longitude: observation.longitude,
          speedKph: observation.speedKph,
        },
        select: journalSelect,
      });
      return Object.freeze({ outcome: "CREATED", observation: Object.freeze(created) });
    } catch (error) {
      if (!isObservationIdentityConflict(error)) throw error;
      const existing = await client.alertEvaluationObservation.findUnique({
        where: { vehicleId_observedAt: identity },
        select: journalSelect,
      });
      if (existing === null) throw new AlertObservationPersistenceStateError("Observation identity conflict row was not found");
      if (!sameImmutablePayload(existing, observation)) {
        throw new AlertObservationIdentityConflictError(observation.vehicleId, observation.observedAt, { cause: error });
      }
      return Object.freeze({ outcome: "EXISTING", observation: Object.freeze(existing) });
    }
  }

  public async findPendingThrough(vehicleId: string, targetObservedAt: Date): Promise<readonly AlertEvaluationJournalObservation[]> {
    const rows = await this.database.getClient().alertEvaluationObservation.findMany({
      where: { vehicleId, processedAt: null, observedAt: { lte: targetObservedAt } },
      orderBy: { observedAt: "asc" },
      select: journalSelect,
    });
    return Object.freeze(rows.map((row) => Object.freeze(row)));
  }

  public async findLatestReplayEligibleObservation(vehicleId: string): Promise<AlertEvaluationJournalObservation | null> {
    const row = await this.database.getClient().alertEvaluationObservation.findFirst({
      where: { vehicleId, processedAt: { not: null }, replayEligible: true },
      orderBy: { observedAt: "desc" },
      select: journalSelect,
    });
    return row === null ? null : Object.freeze(row);
  }

  public async findSpeedingCheckpoint(vehicleId: string): Promise<DurableSpeedingDetectorCheckpoint | null> {
    const row = await this.database.getClient().speedingDetectorCheckpoint.findUnique({ where: { vehicleId } });
    if (row === null) return null;
    const context = row.contextZone === null ? null : Object.freeze({ zone: row.contextZone, thresholdKph: row.contextThresholdKph!, confirmationRequired: row.contextConfirmationRequired! });
    const streakStart = row.streakStartedAt === null ? null : Object.freeze({ observedAt: row.streakStartedAt.toISOString(), latitude: row.streakStartLatitude!, longitude: row.streakStartLongitude! });
    return Object.freeze({ vehicleId: row.vehicleId, lastAcceptedObservedAt: row.lastAcceptedObservedAt.toISOString(), settingsFingerprint: row.settingsFingerprint, context, consecutiveCount: row.consecutiveCount, confirmed: row.confirmed, streakStart, confirmationObservedAt: row.confirmationObservedAt?.toISOString() ?? null });
  }

  public async findInactivityReplayState(vehicleId: string, cutoff: Date, throughObservedAt: Date): Promise<readonly AlertEvaluationJournalObservation[]> {
    const client = this.database.getClient();
    const replayable = { vehicleId, processedAt: { not: null } as const, replayEligible: true } as const;
    const [anchor, recent] = await Promise.all([
      client.alertEvaluationObservation.findFirst({ where: { ...replayable, observedAt: { lt: cutoff } }, orderBy: { observedAt: "desc" }, select: journalSelect }),
      client.alertEvaluationObservation.findMany({ where: { ...replayable, observedAt: { gte: cutoff, lte: throughObservedAt } }, orderBy: { observedAt: "asc" }, select: journalSelect }),
    ]);
    const union = new Map<string, AlertEvaluationJournalObservation>();
    if (anchor !== null) union.set(anchor.id, anchor);
    for (const row of recent) union.set(row.id, row);
    return Object.freeze([...union.values()].sort((left, right) => left.observedAt.getTime() - right.observedAt.getTime()).map((row) => Object.freeze(row)));
  }

  public async markProcessed(id: string, replayEligible: boolean): Promise<void> {
    return this.markProcessedWithClient(this.database.getClient(), id, replayEligible);
  }

  public async completeObservation(id: string, replayEligible: boolean, checkpoint: DurableSpeedingDetectorCheckpoint): Promise<void> {
    const client = this.database.getClient();
    await client.$transaction(async (transaction) => {
      const context = checkpoint.context;
      const streak = checkpoint.streakStart;
      const confirmationObservedAt = checkpoint.confirmationObservedAt === null ? null : new Date(checkpoint.confirmationObservedAt);
      const rows = await transaction.$queryRaw<Array<Readonly<{ vehicleId: string }>>>(Prisma.sql`
        INSERT INTO "speeding_detector_checkpoints" (
          "vehicle_id", "last_accepted_observed_at", "settings_fingerprint",
          "context_zone", "context_threshold_kph", "context_confirmation_required",
          "consecutive_count", "confirmed", "streak_started_at",
          "streak_start_latitude", "streak_start_longitude", "confirmation_observed_at", "updated_at"
        ) VALUES (
          ${checkpoint.vehicleId}::uuid, ${new Date(checkpoint.lastAcceptedObservedAt)}, ${checkpoint.settingsFingerprint},
          ${context?.zone ?? null}::"AlertEventSpeedZone", ${context?.thresholdKph ?? null}, ${context?.confirmationRequired ?? null},
          ${checkpoint.consecutiveCount}, ${checkpoint.confirmed}, ${streak === null ? null : new Date(streak.observedAt)},
          ${streak?.latitude ?? null}, ${streak?.longitude ?? null}, ${confirmationObservedAt}, clock_timestamp()
        )
        ON CONFLICT ("vehicle_id") DO UPDATE SET
          "last_accepted_observed_at" = EXCLUDED."last_accepted_observed_at",
          "settings_fingerprint" = EXCLUDED."settings_fingerprint",
          "context_zone" = EXCLUDED."context_zone",
          "context_threshold_kph" = EXCLUDED."context_threshold_kph",
          "context_confirmation_required" = EXCLUDED."context_confirmation_required",
          "consecutive_count" = EXCLUDED."consecutive_count",
          "confirmed" = EXCLUDED."confirmed",
          "streak_started_at" = EXCLUDED."streak_started_at",
          "streak_start_latitude" = EXCLUDED."streak_start_latitude",
          "streak_start_longitude" = EXCLUDED."streak_start_longitude",
          "confirmation_observed_at" = EXCLUDED."confirmation_observed_at",
          "updated_at" = clock_timestamp()
        WHERE "speeding_detector_checkpoints"."last_accepted_observed_at" < EXCLUDED."last_accepted_observed_at"
          OR (
            "speeding_detector_checkpoints"."last_accepted_observed_at" = EXCLUDED."last_accepted_observed_at" AND
            ROW(
              "speeding_detector_checkpoints"."settings_fingerprint",
              "speeding_detector_checkpoints"."context_zone",
              "speeding_detector_checkpoints"."context_threshold_kph",
              "speeding_detector_checkpoints"."context_confirmation_required",
              "speeding_detector_checkpoints"."consecutive_count",
              "speeding_detector_checkpoints"."confirmed",
              "speeding_detector_checkpoints"."streak_started_at",
              "speeding_detector_checkpoints"."streak_start_latitude",
              "speeding_detector_checkpoints"."streak_start_longitude",
              "speeding_detector_checkpoints"."confirmation_observed_at"
            ) IS NOT DISTINCT FROM ROW(
              EXCLUDED."settings_fingerprint",
              EXCLUDED."context_zone",
              EXCLUDED."context_threshold_kph",
              EXCLUDED."context_confirmation_required",
              EXCLUDED."consecutive_count",
              EXCLUDED."confirmed",
              EXCLUDED."streak_started_at",
              EXCLUDED."streak_start_latitude",
              EXCLUDED."streak_start_longitude",
              EXCLUDED."confirmation_observed_at"
            )
          )
        RETURNING "vehicle_id" AS "vehicleId"
      `);
      if (rows.length !== 1) throw new AlertObservationPersistenceStateError("Speeding checkpoint frontier is stale or contradictory");
      await this.markProcessedWithClient(transaction, id, replayEligible);
    });
  }

  private async markProcessedWithClient(client: Pick<Prisma.TransactionClient, "$executeRaw" | "alertEvaluationObservation">, id: string, replayEligible: boolean): Promise<void> {
    const updated = await client.$executeRaw`
      UPDATE "alert_evaluation_observations"
      SET "processed_at" = clock_timestamp(), "replay_eligible" = ${replayEligible}
      WHERE "id" = ${id}::uuid AND "processed_at" IS NULL AND "replay_eligible" IS NULL
    `;
    if (updated === 1) return;
    const existing = await client.alertEvaluationObservation.findUnique({ where: { id }, select: { processedAt: true, replayEligible: true } });
    if (existing?.processedAt !== null && existing?.processedAt !== undefined && typeof existing.replayEligible === "boolean") {
      if (existing.replayEligible === replayEligible) return;
      throw new AlertObservationPersistenceStateError("Processed alert evaluation observation has contradictory replay eligibility");
    }
    throw new AlertObservationPersistenceStateError("Pending alert evaluation observation could not be marked processed");
  }
}

export const alertObservationRepositoryInternals = Object.freeze({ isObservationIdentityConflict, sameImmutablePayload });

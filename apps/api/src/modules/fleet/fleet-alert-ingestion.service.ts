import { Inject, Injectable } from "@nestjs/common";
import type { ApiConfig } from "../../config/api-config";
import { API_CONFIG } from "../../config/api-config.tokens";
import { isBeyondAllowedPositionFutureSkew } from "../../common/position-time.policy";
import type { AlertEvaluationObservation } from "../alert-evaluation";
import { AlertObservationIngestionService, type AlertObservationIngestionResult } from "../alert-ingestion";
import type { FleetAlertIngestionResult, FleetPersistedVehicleIdentity, FleetSnapshotVehicle } from "./fleet.types";

const disabledResult = Object.freeze({ alertCandidates: 0, alertProcessed: 0, alertAlreadyProcessed: 0, alertSkipped: 0 });

export class FleetAlertIdentityResolutionError extends Error {
  public constructor() {
    super("Persisted vehicle identity is missing for an eligible fleet observation.");
    this.name = "FleetAlertIdentityResolutionError";
  }
}

type EligiblePosition = Readonly<{
  fixTime: Date;
  latitude: number;
  longitude: number;
  speedKph: number;
}>;

function eligiblePosition(vehicle: FleetSnapshotVehicle): EligiblePosition | null {
  const position = vehicle.position;
  if (
    vehicle.disabled
    || position === null
    || position.valid !== true
    || position.outdated !== false
    || position.fixTime === null
    || position.latitude === null
    || position.longitude === null
    || position.speedKph === null
    || isBeyondAllowedPositionFutureSkew(position.fixTime, vehicle.fetchedAt)
  ) return null;
  return Object.freeze({ fixTime: position.fixTime, latitude: position.latitude, longitude: position.longitude, speedKph: position.speedKph });
}

@Injectable()
export class FleetAlertIngestionService {
  public constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly ingestion: AlertObservationIngestionService,
  ) {}

  public async ingestSnapshot(
    vehicles: readonly FleetSnapshotVehicle[],
    identities: readonly FleetPersistedVehicleIdentity[],
  ): Promise<FleetAlertIngestionResult> {
    if (!this.config.alertIngestion.enabled) return disabledResult;

    const identityByExternalDeviceId = new Map(identities.map((identity) => [identity.externalDeviceId, identity.vehicleId]));
    const attempts: Promise<AlertObservationIngestionResult>[] = [];
    let alertSkipped = 0;

    for (const vehicle of vehicles) {
      const position = eligiblePosition(vehicle);
      if (position === null) {
        alertSkipped += 1;
        continue;
      }

      attempts.push(Promise.resolve().then(() => {
        const vehicleId = identityByExternalDeviceId.get(vehicle.externalDeviceId);
        if (vehicleId === undefined) throw new FleetAlertIdentityResolutionError();
        const observation: AlertEvaluationObservation = Object.freeze({
          vehicleId,
          observedAt: position.fixTime.toISOString(),
          latitude: position.latitude,
          longitude: position.longitude,
          speedKph: position.speedKph,
        });
        return this.ingestion.ingestObservation(observation);
      }));
    }

    const settled = await Promise.allSettled(attempts);
    const results: AlertObservationIngestionResult[] = [];
    for (const result of settled) {
      if (result.status === "rejected") throw result.reason;
      results.push(result.value);
    }
    return Object.freeze({
      alertCandidates: attempts.length,
      alertProcessed: results.filter((result) => result.processingPerformed).length,
      alertAlreadyProcessed: results.filter((result) => result.journalOutcome === "ALREADY_PROCESSED").length,
      alertSkipped: alertSkipped + results.filter((result) => result.journalOutcome === "INVALID").length,
    });
  }
}

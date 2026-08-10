import { Injectable } from "@nestjs/common";
import { PositionIngestionSource, VehicleStatus, type Prisma } from "../../generated/prisma/client";
import { DatabaseService } from "../database/database.service";
import { normalizePositionHistoryCandidate } from "../position-history";
import type { FleetRepository } from "./fleet.repository";
import type { FleetPersistedVehicleIdentity, FleetPersistenceResult, FleetSnapshot, FleetSnapshotVehicle } from "./fleet.types";

const transactionTimeoutMs = 30_000;

export class FleetPositionIdentityResolutionError extends Error {
  public constructor() {
    super("Persisted vehicle identity is missing for a fleet position observation.");
    this.name = "FleetPositionIdentityResolutionError";
  }
}

@Injectable()
export class PrismaFleetRepository implements FleetRepository {
  public constructor(private readonly database: DatabaseService) {}

  public async persistSnapshot(snapshot: FleetSnapshot): Promise<FleetPersistenceResult> {
    const client = this.database.getClient();
    return client.$transaction(async (transaction) => {
      const persistedVehicleIdentities: FleetPersistedVehicleIdentity[] = [];
      for (const vehicle of snapshot.vehicles) persistedVehicleIdentities.push(await this.persistVehicle(transaction, vehicle));
      const vehicleIdByExternalDeviceId = new Map(persistedVehicleIdentities.map((identity) => [identity.externalDeviceId, identity.vehicleId]));
      const historyRows: Prisma.VehiclePositionObservationCreateManyInput[] = [];
      let historySkippedInvalid = 0;
      for (const observation of snapshot.positionObservations) {
        const vehicleId = vehicleIdByExternalDeviceId.get(observation.externalDeviceId);
        if (vehicleId === undefined) throw new FleetPositionIdentityResolutionError();
        const candidate = normalizePositionHistoryCandidate({ ...observation, ingestionSource: PositionIngestionSource.FLEET_SYNC });
        if (candidate === null) {
          historySkippedInvalid += 1;
          continue;
        }
        historyRows.push({ vehicleId, ...candidate });
      }
      const historyInserted = historyRows.length === 0
        ? 0
        : (await transaction.vehiclePositionObservation.createMany({ data: historyRows, skipDuplicates: true })).count;
      return {
        vehiclesUpserted: snapshot.vehicles.length,
        currentStatesUpserted: snapshot.vehicles.length,
        historyCandidates: historyRows.length,
        historyInserted,
        historyDuplicates: historyRows.length - historyInserted,
        historySkippedInvalid,
        persistedVehicleIdentities: Object.freeze(persistedVehicleIdentities),
      };
    }, { timeout: transactionTimeoutMs });
  }

  private async persistVehicle(transaction: Parameters<Parameters<ReturnType<DatabaseService["getClient"]>["$transaction"]>[0]>[0], vehicle: FleetSnapshotVehicle): Promise<FleetPersistedVehicleIdentity> {
    const persisted = await transaction.vehicle.upsert({
      where: { externalDeviceId: vehicle.externalDeviceId },
      create: { externalDeviceId: vehicle.externalDeviceId, name: vehicle.name, disabled: vehicle.disabled },
      update: { name: vehicle.name, disabled: vehicle.disabled },
      select: { id: true },
    });
    const base = { status: vehicle.status, externalLastUpdateAt: vehicle.externalLastUpdateAt, fetchedAt: vehicle.fetchedAt };
    if (vehicle.position) {
      await transaction.vehicleCurrentState.upsert({
        where: { vehicleId: persisted.id },
        create: { vehicleId: persisted.id, ...base, ...vehicle.position },
        update: { ...base, ...vehicle.position },
      });
      return Object.freeze({ externalDeviceId: vehicle.externalDeviceId, vehicleId: persisted.id });
    }
    await transaction.vehicleCurrentState.upsert({
      where: { vehicleId: persisted.id },
      create: { vehicleId: persisted.id, ...base, fixTime: null, latitude: null, longitude: null, speedKph: null, valid: null, outdated: null },
      update: base,
    });
    return Object.freeze({ externalDeviceId: vehicle.externalDeviceId, vehicleId: persisted.id });
  }
}

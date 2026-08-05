import { Injectable } from "@nestjs/common";
import { VehicleStatus } from "../../generated/prisma/client";
import { DatabaseService } from "../database/database.service";
import type { FleetRepository } from "./fleet.repository";
import type { FleetPersistenceResult, FleetSnapshot, FleetSnapshotVehicle } from "./fleet.types";

const transactionTimeoutMs = 30_000;

@Injectable()
export class PrismaFleetRepository implements FleetRepository {
  public constructor(private readonly database: DatabaseService) {}

  public async persistSnapshot(snapshot: FleetSnapshot): Promise<FleetPersistenceResult> {
    const client = this.database.getClient();
    return client.$transaction(async (transaction) => {
      for (const vehicle of snapshot.vehicles) await this.persistVehicle(transaction, vehicle);
      return { vehiclesUpserted: snapshot.vehicles.length, currentStatesUpserted: snapshot.vehicles.length };
    }, { timeout: transactionTimeoutMs });
  }

  private async persistVehicle(transaction: Parameters<Parameters<ReturnType<DatabaseService["getClient"]>["$transaction"]>[0]>[0], vehicle: FleetSnapshotVehicle): Promise<void> {
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
      return;
    }
    await transaction.vehicleCurrentState.upsert({
      where: { vehicleId: persisted.id },
      create: { vehicleId: persisted.id, ...base, fixTime: null, latitude: null, longitude: null, speedKph: null, valid: null, outdated: null },
      update: base,
    });
  }
}

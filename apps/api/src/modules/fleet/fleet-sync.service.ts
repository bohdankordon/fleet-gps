import { Inject, Injectable } from "@nestjs/common";
import { EquGpsGatewayService } from "../equgps/equgps-gateway.service";
import { mapFleetSnapshot } from "./fleet-mappers";
import type { FleetRepository } from "./fleet.repository";
import { FLEET_CLOCK, FLEET_REPOSITORY } from "./fleet.tokens";
import type { FleetClock, FleetSyncResult } from "./fleet.types";
import { FleetAlertIngestionService } from "./fleet-alert-ingestion.service";

@Injectable()
export class FleetSyncService {
  public constructor(
    private readonly gateway: EquGpsGatewayService,
    @Inject(FLEET_REPOSITORY) private readonly repository: FleetRepository,
    @Inject(FLEET_CLOCK) private readonly clock: FleetClock,
    private readonly alertIngestion: FleetAlertIngestionService,
  ) {}

  public async syncLatestSnapshot(): Promise<FleetSyncResult> {
    const devices = await this.gateway.getDevices();
    const positions = await this.gateway.getLatestPositions();
    const fetchedAt = this.clock.now();
    const mapped = mapFleetSnapshot(devices, positions, fetchedAt);
    const persisted = await this.repository.persistSnapshot({ vehicles: mapped.vehicles, positionObservations: mapped.positionObservations });
    const alerts = await this.alertIngestion.ingestSnapshot(mapped.vehicles, persisted.persistedVehicleIdentities);
    return Object.freeze({ devicesReceived: devices.length, positionsReceived: positions.length, vehiclesUpserted: persisted.vehiclesUpserted, currentStatesUpserted: persisted.currentStatesUpserted, historyCandidates: persisted.historyCandidates, historyInserted: persisted.historyInserted, historyDuplicates: persisted.historyDuplicates, historySkippedInvalid: persisted.historySkippedInvalid, devicesWithoutPosition: mapped.devicesWithoutPosition, unmatchedPositions: mapped.unmatchedPositions, duplicatePositions: mapped.duplicatePositions, invalidDeviceLastUpdateDates: mapped.invalidDeviceLastUpdateDates, invalidPositionFixDates: mapped.invalidPositionFixDates, ...alerts, fetchedAt: fetchedAt.toISOString() });
  }
}

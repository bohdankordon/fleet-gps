import { Inject, Injectable } from "@nestjs/common";
import { PositionBackfillStatus } from "../../generated/prisma/client";
import { POSITION_HISTORY_BACKFILL_MAX_TARGET_MS } from "../position-history-backfill/position-history-backfill.constants";
import { POSITION_HISTORY_COVERAGE_REPOSITORY } from "./position-history-coverage.tokens";
import type { PositionHistoryCoverageRepository, PositionHistoryCoverageResult, PositionHistoryCoverageTarget } from "./position-history-coverage.types";

function validTarget(target: PositionHistoryCoverageTarget): boolean {
  const from = target.from.getTime();
  const to = target.to.getTime();
  return Number.isFinite(from) && Number.isFinite(to) && from < to && to - from <= POSITION_HISTORY_BACKFILL_MAX_TARGET_MS;
}

@Injectable()
export class PositionHistoryCoverageService {
  public constructor(@Inject(POSITION_HISTORY_COVERAGE_REPOSITORY) private readonly repository: PositionHistoryCoverageRepository) {}

  public async run(target: PositionHistoryCoverageTarget): Promise<PositionHistoryCoverageResult> {
    if (!validTarget(target)) throw new Error("Invalid position history coverage target");
    const vehicles = await this.repository.inspect(target);
    const completed = vehicles.filter((vehicle) => vehicle.exactCheckpointStatus === PositionBackfillStatus.COMPLETED).length;
    const running = vehicles.filter((vehicle) => vehicle.exactCheckpointStatus === PositionBackfillStatus.RUNNING).length;
    const pending = vehicles.filter((vehicle) => vehicle.exactCheckpointStatus === PositionBackfillStatus.PENDING).length;
    const noExactCheckpoint = vehicles.filter((vehicle) => vehicle.exactCheckpointStatus === null).length;
    const vehiclesWithObservations = vehicles.filter((vehicle) => vehicle.observationRows > 0).length;
    const rowsTotal = vehicles.reduce((sum, vehicle) => sum + vehicle.observationRows, 0);
    const fleetSyncRows = vehicles.reduce((sum, vehicle) => sum + vehicle.fleetSyncRows, 0);
    const historicalBackfillRows = vehicles.reduce((sum, vehicle) => sum + vehicle.historicalBackfillRows, 0);
    const observedTimes = vehicles.flatMap((vehicle) => [vehicle.firstObservedAt, vehicle.lastObservedAt]).filter((value): value is Date => value !== null);
    const completedVehicles = vehicles.filter((vehicle) => vehicle.exactCheckpointStatus === PositionBackfillStatus.COMPLETED);
    const incompleteOrNoExactCheckpointVehicles = vehicles.filter((vehicle) => vehicle.exactCheckpointStatus !== PositionBackfillStatus.COMPLETED);

    return Object.freeze({
      range: Object.freeze({ from: new Date(target.from.getTime()), to: new Date(target.to.getTime()), inclusive: true as const }),
      checkpointCoverage: Object.freeze({ vehiclesTotal: vehicles.length, completed, running, pending, noExactCheckpoint }),
      observationPresence: Object.freeze({
        rowsTotal,
        vehiclesWithObservations,
        vehiclesWithoutObservations: vehicles.length - vehiclesWithObservations,
        fleetSyncRows,
        historicalBackfillRows,
        firstObservedAt: observedTimes.length === 0 ? null : new Date(Math.min(...observedTimes.map((value) => value.getTime()))),
        lastObservedAt: observedTimes.length === 0 ? null : new Date(Math.max(...observedTimes.map((value) => value.getTime()))),
      }),
      checkpointObservationCrossSummary: Object.freeze({
        completedWithObservations: completedVehicles.filter((vehicle) => vehicle.observationRows > 0).length,
        completedWithoutObservations: completedVehicles.filter((vehicle) => vehicle.observationRows === 0).length,
        incompleteOrNoExactCheckpointWithObservations: incompleteOrNoExactCheckpointVehicles.filter((vehicle) => vehicle.observationRows > 0).length,
        incompleteOrNoExactCheckpointWithoutObservations: incompleteOrNoExactCheckpointVehicles.filter((vehicle) => vehicle.observationRows === 0).length,
      }),
      providerDisabledVehicles: vehicles.filter((vehicle) => vehicle.providerDisabled).length,
    });
  }
}

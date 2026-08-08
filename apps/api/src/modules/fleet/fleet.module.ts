import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { EquGpsModule } from "../equgps/equgps.module";
import { AlertIngestionModule } from "../alert-ingestion";
import { FleetAlertIngestionService } from "./fleet-alert-ingestion.service";
import { FleetSyncService } from "./fleet-sync.service";
import { PrismaFleetRepository } from "./prisma-fleet.repository";
import { FLEET_CLOCK, FLEET_REPOSITORY } from "./fleet.tokens";
import type { FleetClock } from "./fleet.types";

@Module({
  imports: [EquGpsModule, DatabaseModule, AlertIngestionModule],
  providers: [
    { provide: FLEET_CLOCK, useValue: { now: (): Date => new Date() } satisfies FleetClock },
    { provide: FLEET_REPOSITORY, useExisting: PrismaFleetRepository },
    PrismaFleetRepository,
    FleetAlertIngestionService,
    FleetSyncService,
  ],
  exports: [FleetSyncService],
})
export class FleetModule {}

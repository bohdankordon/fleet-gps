import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { EquGpsModule } from "../equgps/equgps.module";
import { FleetSyncService } from "./fleet-sync.service";
import { PrismaFleetRepository } from "./prisma-fleet.repository";
import { FLEET_CLOCK, FLEET_REPOSITORY } from "./fleet.tokens";
import type { FleetClock } from "./fleet.types";

@Module({
  imports: [EquGpsModule, DatabaseModule],
  providers: [
    { provide: FLEET_CLOCK, useValue: { now: (): Date => new Date() } satisfies FleetClock },
    { provide: FLEET_REPOSITORY, useExisting: PrismaFleetRepository },
    PrismaFleetRepository,
    FleetSyncService,
  ],
  exports: [FleetSyncService],
})
export class FleetModule {}

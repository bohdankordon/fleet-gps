import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { VehicleAccessModule } from "../vehicle-access/vehicle-access.module";
import { FleetMapController } from "./fleet-map.controller";
import { FleetMapQueryService } from "./fleet-map-query.service";
import { FLEET_MAP_CLOCK, FLEET_MAP_QUERY_REPOSITORY } from "./fleet-map.tokens";
import type { FleetMapClock } from "./fleet-map.types";
import { PrismaFleetMapQueryRepository } from "./prisma-fleet-map-query.repository";

@Module({
  imports: [DatabaseModule, VehicleAccessModule],
  controllers: [FleetMapController],
  providers: [
    { provide: FLEET_MAP_CLOCK, useValue: { now: (): Date => new Date() } satisfies FleetMapClock },
    PrismaFleetMapQueryRepository,
    { provide: FLEET_MAP_QUERY_REPOSITORY, useExisting: PrismaFleetMapQueryRepository },
    FleetMapQueryService,
  ],
})
export class FleetMapModule {}

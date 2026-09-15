import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database";
import { VehicleAccessModule } from "../vehicle-access/vehicle-access.module";
import { PrismaVehicleTrackOverviewQueryRepository } from "./prisma-vehicle-track-overview-query.repository";
import { PrismaVehicleTrackQueryRepository } from "./prisma-vehicle-track-query.repository";
import { VehicleTrackOverviewQueryService } from "./vehicle-track-overview-query.service";
import { VehicleTrackOverviewController } from "./vehicle-track-overview.controller";
import { VEHICLE_TRACK_CLOCK, VEHICLE_TRACK_OVERVIEW_QUERY_REPOSITORY, VEHICLE_TRACK_QUERY_REPOSITORY } from "./vehicle-track.tokens";
import { VehicleTrackController } from "./vehicle-track.controller";
import { VehicleTrackQueryService } from "./vehicle-track-query.service";
import type { VehicleTrackClock } from "./vehicle-track.types";

@Module({
  imports: [DatabaseModule, VehicleAccessModule],
  controllers: [VehicleTrackController, VehicleTrackOverviewController],
  providers: [
    { provide: VEHICLE_TRACK_CLOCK, useValue: { now: (): Date => new Date() } satisfies VehicleTrackClock },
    PrismaVehicleTrackQueryRepository,
    { provide: VEHICLE_TRACK_QUERY_REPOSITORY, useExisting: PrismaVehicleTrackQueryRepository },
    VehicleTrackQueryService,
    PrismaVehicleTrackOverviewQueryRepository,
    { provide: VEHICLE_TRACK_OVERVIEW_QUERY_REPOSITORY, useExisting: PrismaVehicleTrackOverviewQueryRepository },
    VehicleTrackOverviewQueryService,
  ],
})
export class VehicleTrackModule {}

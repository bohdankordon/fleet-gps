import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database";
import { PrismaVehicleTrackQueryRepository } from "./prisma-vehicle-track-query.repository";
import { VEHICLE_TRACK_CLOCK, VEHICLE_TRACK_QUERY_REPOSITORY } from "./vehicle-track.tokens";
import { VehicleTrackController } from "./vehicle-track.controller";
import { VehicleTrackQueryService } from "./vehicle-track-query.service";
import type { VehicleTrackClock } from "./vehicle-track.types";

@Module({
  imports: [DatabaseModule],
  controllers: [VehicleTrackController],
  providers: [
    { provide: VEHICLE_TRACK_CLOCK, useValue: { now: (): Date => new Date() } satisfies VehicleTrackClock },
    PrismaVehicleTrackQueryRepository,
    { provide: VEHICLE_TRACK_QUERY_REPOSITORY, useExisting: PrismaVehicleTrackQueryRepository },
    VehicleTrackQueryService,
  ],
})
export class VehicleTrackModule {}

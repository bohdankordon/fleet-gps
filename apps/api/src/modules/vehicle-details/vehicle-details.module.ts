import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database";
import { VehicleAccessModule } from "../vehicle-access/vehicle-access.module";
import { PrismaVehicleDetailsQueryRepository } from "./prisma-vehicle-details-query.repository";
import { VEHICLE_DETAILS_CLOCK, VEHICLE_DETAILS_QUERY_REPOSITORY } from "./vehicle-details.tokens";
import { VehicleDetailsController } from "./vehicle-details.controller";
import { VehicleDetailsQueryService } from "./vehicle-details-query.service";
import type { VehicleDetailsClock } from "./vehicle-details.types";

@Module({
  imports: [DatabaseModule, VehicleAccessModule],
  controllers: [VehicleDetailsController],
  providers: [
    { provide: VEHICLE_DETAILS_CLOCK, useValue: { now: (): Date => new Date() } satisfies VehicleDetailsClock },
    PrismaVehicleDetailsQueryRepository,
    { provide: VEHICLE_DETAILS_QUERY_REPOSITORY, useExisting: PrismaVehicleDetailsQueryRepository },
    VehicleDetailsQueryService,
  ],
})
export class VehicleDetailsModule {}

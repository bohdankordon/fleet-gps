import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { VehicleScopeService } from "./vehicle-access.service";

@Module({ imports: [DatabaseModule], providers: [VehicleScopeService], exports: [VehicleScopeService] })
export class VehicleAccessModule {}

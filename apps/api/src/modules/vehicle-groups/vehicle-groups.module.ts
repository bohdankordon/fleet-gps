import { Module } from "@nestjs/common";
import { AuditModule } from "../audit";
import { DatabaseModule } from "../database/database.module";
import { VehicleGroupsController } from "./vehicle-groups.controller";
import { VehicleGroupsService } from "./vehicle-groups.service";

@Module({ imports: [DatabaseModule, AuditModule], controllers: [VehicleGroupsController], providers: [VehicleGroupsService] })
export class VehicleGroupsModule {}

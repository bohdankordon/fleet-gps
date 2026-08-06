import { Module } from "@nestjs/common";
import { AlertSettingsModule } from "../alert-settings/alert-settings.module";
import { DatabaseModule } from "../database/database.module";
import { CityGeofenceController } from "./city-geofence.controller";
import { CityGeofenceManagementService } from "./city-geofence-management.service";
import { CityGeofenceRepository } from "./city-geofence.repository";
import { CityGeofenceService } from "./city-geofence.service";

@Module({
  imports: [AlertSettingsModule, DatabaseModule],
  controllers: [CityGeofenceController],
  providers: [CityGeofenceRepository, CityGeofenceManagementService, CityGeofenceService],
  exports: [CityGeofenceManagementService, CityGeofenceService],
})
export class CityGeofenceModule {}

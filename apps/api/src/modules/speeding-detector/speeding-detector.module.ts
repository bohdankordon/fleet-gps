import { Module } from "@nestjs/common";
import { AlertSettingsModule } from "../alert-settings/alert-settings.module";
import { CityGeofenceModule } from "../city-geofence/city-geofence.module";
import { SpeedingDetectorService } from "./speeding-detector.service";
import { SpeedingDetectorStateMachine } from "./speeding-detector.state-machine";

@Module({
  imports: [AlertSettingsModule, CityGeofenceModule],
  providers: [SpeedingDetectorStateMachine, SpeedingDetectorService],
  exports: [SpeedingDetectorStateMachine, SpeedingDetectorService],
})
export class SpeedingDetectorModule {}

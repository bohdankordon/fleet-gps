import { Module } from "@nestjs/common";
import { AlertSettingsModule } from "../alert-settings/alert-settings.module";
import { InactivityDetectorService } from "./inactivity-detector.service";
import { InactivityDetectorStateMachine } from "./inactivity-detector.state-machine";

@Module({
  imports: [AlertSettingsModule],
  providers: [InactivityDetectorStateMachine, InactivityDetectorService],
  exports: [InactivityDetectorStateMachine, InactivityDetectorService],
})
export class InactivityDetectorModule {}

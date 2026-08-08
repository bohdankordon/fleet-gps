import { Module } from "@nestjs/common";
import { AlertEventsModule } from "../alert-events";
import { InactivityDetectorModule } from "../inactivity-detector";
import { SpeedingDetectorModule } from "../speeding-detector";
import { AlertEvaluationService } from "./alert-evaluation.service";

@Module({
  imports: [SpeedingDetectorModule, InactivityDetectorModule, AlertEventsModule],
  providers: [AlertEvaluationService],
  exports: [AlertEvaluationService],
})
export class AlertEvaluationModule {}

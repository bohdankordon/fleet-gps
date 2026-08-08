import { Module } from "@nestjs/common";
import { AlertEvaluationModule } from "../alert-evaluation";
import { AlertSettingsModule } from "../alert-settings/alert-settings.module";
import { DatabaseModule } from "../database";
import { AlertObservationIngestionService } from "./alert-observation-ingestion.service";
import { AlertObservationRepository } from "./alert-observation.repository";

@Module({
  imports: [DatabaseModule, AlertSettingsModule, AlertEvaluationModule],
  providers: [AlertObservationRepository, AlertObservationIngestionService],
  exports: [AlertObservationIngestionService],
})
export class AlertIngestionModule {}

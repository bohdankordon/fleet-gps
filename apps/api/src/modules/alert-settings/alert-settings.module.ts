import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AlertSettingsController } from "./alert-settings.controller";
import { AlertSettingsRepository } from "./alert-settings.repository";
import { AlertSettingsService } from "./alert-settings.service";

@Module({
  imports: [DatabaseModule],
  controllers: [AlertSettingsController],
  providers: [AlertSettingsRepository, AlertSettingsService],
  exports: [AlertSettingsService],
})
export class AlertSettingsModule {}

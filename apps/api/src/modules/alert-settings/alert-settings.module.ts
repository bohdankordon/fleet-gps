import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AlertSettingsController } from "./alert-settings.controller";
import { AlertSettingsRepository } from "./alert-settings.repository";
import { AlertSettingsService } from "./alert-settings.service";
import { SettingsChangeNotifier } from "./settings-change-notifier";
import { RuntimeSettingsController } from "./runtime-settings.controller";

@Module({
  imports: [DatabaseModule],
  controllers: [AlertSettingsController, RuntimeSettingsController],
  providers: [AlertSettingsRepository, AlertSettingsService, SettingsChangeNotifier],
  exports: [AlertSettingsService, SettingsChangeNotifier],
})
export class AlertSettingsModule {}

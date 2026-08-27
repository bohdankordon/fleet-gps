import { Module } from "@nestjs/common";
import { AlertSettingsModule } from "../alert-settings/alert-settings.module";
import { AuditModule } from "../audit";
import { DatabaseModule } from "../database/database.module";
import { AdminSettingsController } from "./admin-settings.controller";
import { AdminSettingsService } from "./admin-settings.service";
@Module({ imports: [DatabaseModule, AuditModule, AlertSettingsModule], controllers: [AdminSettingsController], providers: [AdminSettingsService] })
export class AdminSettingsModule {}

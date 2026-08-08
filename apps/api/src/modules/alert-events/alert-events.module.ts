import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database";
import { AlertEventsLifecycleService } from "./alert-events-lifecycle.service";
import { ALERT_EVENTS_REPOSITORY } from "./alert-events.tokens";
import { PrismaAlertEventsRepository } from "./prisma-alert-events.repository";

@Module({
  imports: [DatabaseModule],
  providers: [PrismaAlertEventsRepository, { provide: ALERT_EVENTS_REPOSITORY, useExisting: PrismaAlertEventsRepository }, AlertEventsLifecycleService],
  exports: [AlertEventsLifecycleService],
})
export class AlertEventsModule {}


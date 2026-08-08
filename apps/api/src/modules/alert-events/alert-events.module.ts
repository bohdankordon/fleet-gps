import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database";
import { AlertEventProcessorService } from "./alert-event-processor.service";
import { AlertEventsLifecycleService } from "./alert-events-lifecycle.service";
import { ALERT_EVENTS_REPOSITORY } from "./alert-events.tokens";
import { PrismaAlertEventsRepository } from "./prisma-alert-events.repository";

@Module({
  imports: [DatabaseModule],
  providers: [PrismaAlertEventsRepository, { provide: ALERT_EVENTS_REPOSITORY, useExisting: PrismaAlertEventsRepository }, AlertEventsLifecycleService, AlertEventProcessorService],
  exports: [AlertEventsLifecycleService, AlertEventProcessorService],
})
export class AlertEventsModule {}

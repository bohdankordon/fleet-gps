import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database";
import { AlertEventProcessorService } from "./alert-event-processor.service";
import { AlertEventsLifecycleService } from "./alert-events-lifecycle.service";
import { ALERT_EVENTS_REPOSITORY } from "./alert-events.tokens";
import { PrismaAlertEventsRepository } from "./prisma-alert-events.repository";
import { AlertEventsController } from "./alert-events.controller";
import { AlertEventsQueryService } from "./alert-events-query.service";
import { PrismaAlertEventsQueryRepository } from "./prisma-alert-events-query.repository";
import { ALERT_EVENTS_QUERY_REPOSITORY } from "./alert-events.tokens";

@Module({
  imports: [DatabaseModule],
  controllers: [AlertEventsController],
  providers: [
    PrismaAlertEventsRepository,
    { provide: ALERT_EVENTS_REPOSITORY, useExisting: PrismaAlertEventsRepository },
    PrismaAlertEventsQueryRepository,
    { provide: ALERT_EVENTS_QUERY_REPOSITORY, useExisting: PrismaAlertEventsQueryRepository },
    AlertEventsLifecycleService,
    AlertEventProcessorService,
    AlertEventsQueryService,
  ],
  exports: [AlertEventsLifecycleService, AlertEventProcessorService],
})
export class AlertEventsModule {}

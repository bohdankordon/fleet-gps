import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database";
import { AlertNotificationsModule } from "../alert-notifications/alert-notifications.module";
import { AlertEventProcessorService } from "./alert-event-processor.service";
import { AlertEventsLifecycleService } from "./alert-events-lifecycle.service";
import { ALERT_EVENTS_QUERY_CLOCK, ALERT_EVENTS_QUERY_REPOSITORY, ALERT_EVENTS_REPOSITORY } from "./alert-events.tokens";
import { PrismaAlertEventsRepository } from "./prisma-alert-events.repository";
import { AlertEventsController } from "./alert-events.controller";
import { AlertEventsQueryService } from "./alert-events-query.service";
import { PrismaAlertEventsQueryRepository } from "./prisma-alert-events-query.repository";
import type { AlertEventsQueryClock } from "./alert-events-query.service";

@Module({
  imports: [DatabaseModule, AlertNotificationsModule],
  controllers: [AlertEventsController],
  providers: [
    PrismaAlertEventsRepository,
    { provide: ALERT_EVENTS_REPOSITORY, useExisting: PrismaAlertEventsRepository },
    PrismaAlertEventsQueryRepository,
    { provide: ALERT_EVENTS_QUERY_REPOSITORY, useExisting: PrismaAlertEventsQueryRepository },
    { provide: ALERT_EVENTS_QUERY_CLOCK, useValue: { now: (): Date => new Date() } satisfies AlertEventsQueryClock },
    AlertEventsLifecycleService,
    AlertEventProcessorService,
    AlertEventsQueryService,
  ],
  exports: [AlertEventsLifecycleService, AlertEventProcessorService],
})
export class AlertEventsModule {}

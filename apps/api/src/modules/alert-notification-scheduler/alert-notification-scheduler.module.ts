import { Module } from "@nestjs/common";
import { ApiConfigModule } from "../../config/api-config.module";
import { AlertNotificationsModule } from "../alert-notifications/alert-notifications.module";
import { SystemClock } from "../sync-scheduler/sync-scheduler-clock";
import { AlertNotificationSchedulerStatusService } from "./alert-notification-scheduler-status.service";
import { AlertNotificationSchedulerTimerAdapter } from "./alert-notification-scheduler-timer.adapter";
import { AlertNotificationSchedulerService } from "./alert-notification-scheduler.service";
import { ALERT_NOTIFICATION_SCHEDULER_CLOCK, ALERT_NOTIFICATION_SCHEDULER_TIMER } from "./alert-notification-scheduler.tokens";

@Module({
  imports: [ApiConfigModule, AlertNotificationsModule],
  providers: [
    AlertNotificationSchedulerService,
    AlertNotificationSchedulerStatusService,
    SystemClock,
    { provide: ALERT_NOTIFICATION_SCHEDULER_CLOCK, useExisting: SystemClock },
    AlertNotificationSchedulerTimerAdapter,
    { provide: ALERT_NOTIFICATION_SCHEDULER_TIMER, useExisting: AlertNotificationSchedulerTimerAdapter },
  ],
  exports: [AlertNotificationSchedulerStatusService],
})
export class AlertNotificationSchedulerModule {}


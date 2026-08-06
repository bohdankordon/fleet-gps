import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { ApiConfigModule } from "../../config/api-config.module";
import { DashboardModule } from "../dashboard/dashboard.module";
import { FleetModule } from "../fleet/fleet.module";
import { SchedulerRegistryTimerAdapter } from "./scheduler-registry-timer.adapter";
import { SystemClock } from "./sync-scheduler-clock";
import { SyncSchedulerController } from "./sync-scheduler.controller";
import { SyncSchedulerService } from "./sync-scheduler.service";
import { createShutdownTimeout } from "./sync-scheduler.service";
import { SyncSchedulerStatusQueryService } from "./sync-scheduler-status-query.service";
import { SyncSchedulerStatusService } from "./sync-scheduler-status.service";
import { SCHEDULER_TIMER_ADAPTER, SYNC_SCHEDULER_CLOCK, SYNC_SCHEDULER_TIMEOUT_FACTORY } from "./sync-scheduler.tokens";

@Module({
  imports: [ScheduleModule.forRoot(), ApiConfigModule, FleetModule, DashboardModule],
  controllers: [SyncSchedulerController],
  providers: [
    SyncSchedulerService,
    SyncSchedulerStatusService,
    SyncSchedulerStatusQueryService,
    SystemClock,
    { provide: SYNC_SCHEDULER_CLOCK, useExisting: SystemClock },
    SchedulerRegistryTimerAdapter,
    { provide: SCHEDULER_TIMER_ADAPTER, useExisting: SchedulerRegistryTimerAdapter },
    { provide: SYNC_SCHEDULER_TIMEOUT_FACTORY, useValue: createShutdownTimeout },
  ],
  exports: [SyncSchedulerStatusService],
})
export class SyncSchedulerModule {}

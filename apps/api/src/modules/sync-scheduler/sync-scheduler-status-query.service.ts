import { Inject, Injectable } from "@nestjs/common";
import type { ApiConfig } from "../../config/api-config";
import { API_CONFIG } from "../../config/api-config.tokens";
import type { Clock } from "./sync-scheduler-clock";
import { SYNC_SCHEDULER_CLOCK } from "./sync-scheduler.tokens";
import { SyncSchedulerStatusService } from "./sync-scheduler-status.service";
import { SyncSchedulerStateError, type SyncSchedulerStatus } from "./sync-scheduler.types";

@Injectable()
export class SyncSchedulerStatusQueryService {
  public constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(SYNC_SCHEDULER_CLOCK) private readonly clock: Clock,
    private readonly statusService: SyncSchedulerStatusService,
  ) {}

  public getStatus(): SyncSchedulerStatus {
    let now: Date;
    try {
      const value = this.clock.now();
      const milliseconds = value.getTime();
      if (!Number.isFinite(milliseconds)) throw new SyncSchedulerStateError();
      now = new Date(milliseconds);
    } catch {
      throw new SyncSchedulerStateError();
    }

    try {
      return this.statusService.snapshot(this.config.syncScheduler, now);
    } catch {
      throw new SyncSchedulerStateError();
    }
  }
}

import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { EquGpsModule } from "../equgps/equgps.module";
import { DailyRunsSyncService } from "./daily-runs-sync.service";
import { PrismaDailyStatsRepository } from "./prisma-daily-stats.repository";
import { DASHBOARD_CLOCK, DAILY_STATS_REPOSITORY } from "./dashboard.tokens";
import type { DashboardClock } from "./dashboard.types";

@Module({
  imports: [EquGpsModule, DatabaseModule],
  providers: [
    { provide: DASHBOARD_CLOCK, useValue: { now: (): Date => new Date() } satisfies DashboardClock },
    PrismaDailyStatsRepository,
    { provide: DAILY_STATS_REPOSITORY, useExisting: PrismaDailyStatsRepository },
    DailyRunsSyncService,
  ],
  exports: [DailyRunsSyncService],
})
export class DashboardModule {}

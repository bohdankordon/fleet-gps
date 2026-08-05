import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { EquGpsModule } from "../equgps/equgps.module";
import { DailyRunsSyncService } from "./daily-runs-sync.service";
import { PrismaDailyStatsRepository } from "./prisma-daily-stats.repository";
import { PrismaDashboardQueryRepository } from "./prisma-dashboard-query.repository";
import { DashboardQueryService } from "./dashboard-query.service";
import { DashboardController } from "./dashboard.controller";
import { DASHBOARD_CLOCK, DASHBOARD_QUERY_REPOSITORY, DAILY_STATS_REPOSITORY } from "./dashboard.tokens";
import type { DashboardClock } from "./dashboard.types";

@Module({
  imports: [EquGpsModule, DatabaseModule],
  controllers: [DashboardController],
  providers: [
    { provide: DASHBOARD_CLOCK, useValue: { now: (): Date => new Date() } satisfies DashboardClock },
    PrismaDailyStatsRepository,
    { provide: DAILY_STATS_REPOSITORY, useExisting: PrismaDailyStatsRepository },
    PrismaDashboardQueryRepository,
    { provide: DASHBOARD_QUERY_REPOSITORY, useExisting: PrismaDashboardQueryRepository },
    DailyRunsSyncService,
    DashboardQueryService,
  ],
  exports: [DailyRunsSyncService],
})
export class DashboardModule {}

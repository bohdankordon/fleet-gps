import { Inject, Injectable } from "@nestjs/common";
import { EquGpsGatewayService } from "../equgps/equgps-gateway.service";
import { normalizeDailyRuns } from "./daily-runs-mappers";
import type { DailyStatsRepository } from "./daily-stats.repository";
import { DASHBOARD_CLOCK, DAILY_STATS_REPOSITORY } from "./dashboard.tokens";
import { DailyRunsConfigurationError, type DailyRunsSyncResult, type DashboardClock } from "./dashboard.types";

function currentServiceDate(now: Date, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const date = `${values.year ?? ""}-${values.month ?? ""}-${values.day ?? ""}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("invalid date");
    return date;
  } catch { throw new DailyRunsConfigurationError(); }
}

@Injectable()
export class DailyRunsSyncService {
  public constructor(
    private readonly gateway: EquGpsGatewayService,
    @Inject(DAILY_STATS_REPOSITORY) private readonly repository: DailyStatsRepository,
    @Inject(DASHBOARD_CLOCK) private readonly clock: DashboardClock,
  ) {}

  public async syncCurrentDayRuns(): Promise<DailyRunsSyncResult> {
    const timezone = await this.repository.getTimezone();
    const fetchedAt = this.clock.now();
    const serviceDate = currentServiceDate(fetchedAt, timezone);
    const rawRuns = await this.gateway.getRuns();
    const normalized = normalizeDailyRuns(rawRuns);
    const persisted = await this.repository.persistRunsSnapshot({ serviceDate, fetchedAt, runs: normalized.runs });
    return Object.freeze({ runsReceived: rawRuns.length, uniqueRuns: normalized.runs.length, dailyStatsUpserted: persisted.dailyStatsUpserted, vehiclesWithoutRun: persisted.vehiclesWithoutRun, unmatchedRuns: persisted.unmatchedRuns, duplicateRuns: normalized.duplicateRuns, protectedExactStats: persisted.protectedExactStats, serviceDate, fetchedAt: fetchedAt.toISOString() });
  }
}

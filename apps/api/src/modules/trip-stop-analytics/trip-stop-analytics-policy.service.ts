import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { validateTripStopAnalyticsPolicy, type TripStopAnalyticsPolicy } from "./trip-stop-analytics.constants";
import { validateTimezone } from "../alert-settings/alert-settings.validation";

const SELECT = { tripMovementSpeedKph: true, tripMovementConfirmationSeconds: true, tripStopConfirmationSeconds: true, tripDataGapSeconds: true } as const;

@Injectable()
export class TripStopAnalyticsPolicyService {
  public constructor(private readonly database: DatabaseService) {}

  public async getSnapshot(): Promise<TripStopAnalyticsPolicy> {
    const settings = await this.database.getClient().applicationSettings.findUnique({ where: { id: 1 }, select: SELECT });
    if (!settings) throw new Error("Trip/stop policy unavailable");
    return validateTripStopAnalyticsPolicy(settings);
  }

  /** Reports context is read atomically; existing Trips lookups stay unchanged. */
  public async getReportContext(): Promise<Readonly<{ timezone: string; policy: TripStopAnalyticsPolicy }>> {
    const settings = await this.database.getClient().applicationSettings.findUnique({ where: { id: 1 }, select: { ...SELECT, timezone: true } });
    if (!settings) throw new Error("Report policy unavailable");
    return Object.freeze({ timezone: validateTimezone(settings.timezone), policy: validateTripStopAnalyticsPolicy(settings) });
  }
}

import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { validateTripStopAnalyticsPolicy, type TripStopAnalyticsPolicy } from "./trip-stop-analytics.constants";

const SELECT = { tripMovementSpeedKph: true, tripMovementConfirmationSeconds: true, tripStopConfirmationSeconds: true, tripDataGapSeconds: true } as const;

@Injectable()
export class TripStopAnalyticsPolicyService {
  public constructor(private readonly database: DatabaseService) {}

  public async getSnapshot(): Promise<TripStopAnalyticsPolicy> {
    const settings = await this.database.getClient().applicationSettings.findUnique({ where: { id: 1 }, select: SELECT });
    if (!settings) throw new Error("Trip/stop policy unavailable");
    return validateTripStopAnalyticsPolicy(settings);
  }
}

import { Controller, Get, HttpException, Param, Query, Req } from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { normalizeUuid } from "../../common/uuid.validation";
import { parseAbsoluteTimestamp } from "../vehicle-track/vehicle-track-query-params";
import { TRIP_STOP_ANALYTICS_MAX_RANGE_MS } from "./trip-stop-analytics.constants";
import { TripStopAnalyticsTargetError, TripStopAnalyticsVehicleNotFoundError } from "./trip-stop-analytics.errors";
import { TripStopAnalyticsService } from "./trip-stop-analytics.service";
import { toTripAnalysisResponse, type TripAnalysisResponse } from "./trip-stop-analysis-read-models";
import { RequireAnyPermission } from "../auth/auth.decorators";

function parseRange(rawFrom: unknown, rawTo: unknown): Readonly<{ from: Date; to: Date }> | null {
  const from = parseAbsoluteTimestamp(rawFrom); const to = parseAbsoluteTimestamp(rawTo);
  if (!from || !to) return null;
  const duration = to.getTime() - from.getTime();
  return duration > 0 && duration <= TRIP_STOP_ANALYTICS_MAX_RANGE_MS ? Object.freeze({ from, to }) : null;
}

@Controller("vehicles")
@RequireAnyPermission("trips.view")
export class TripStopAnalysisController {
  public constructor(private readonly analytics: TripStopAnalyticsService) {}
  @Get(":vehicleId/trip-analysis")
  public async getAnalysis(@Param("vehicleId") rawVehicleId: string, @Query("from") rawFrom: unknown, @Query("to") rawTo: unknown, @Req() request: AuthenticatedRequest): Promise<TripAnalysisResponse> {
    const vehicleId = normalizeUuid(rawVehicleId); const range = parseRange(rawFrom, rawTo);
    if (!vehicleId || !range) throw new HttpException({ statusCode: 400, error: "Bad Request" }, 400);
    try { return toTripAnalysisResponse(await this.analytics.analyze(vehicleId, range, request.auth!.id)); }
    catch (error) {
      if (error instanceof TripStopAnalyticsVehicleNotFoundError) throw new HttpException({ statusCode: 404, error: "Not Found" }, 404);
      if (error instanceof TripStopAnalyticsTargetError) throw new HttpException({ statusCode: 400, error: "Bad Request" }, 400);
      throw new HttpException({ statusCode: 500, error: "Internal Server Error" }, 500);
    }
  }
}

import { Controller, Get, HttpException, Query, Req } from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { parseAbsoluteTimestamp } from "../vehicle-track/vehicle-track-query-params";
import { FleetActivityReportService } from "./fleet-activity-report.service";
import { FLEET_ACTIVITY_REPORT_MAX_RANGE_MS, type FleetActivityReport, type FleetActivityVehicleRow } from "./fleet-activity-report.types";
import { RequireAnyPermission } from "../auth/auth.decorators";

export { FLEET_ACTIVITY_REPORT_MAX_RANGE_MS } from "./fleet-activity-report.types";
export type FleetActivityReportResponse = Omit<FleetActivityReport, "from" | "to" | "generatedAt" | "vehicles"> & Readonly<{
  from: string; to: string; generatedAt: string;
  vehicles: readonly (Omit<FleetActivityVehicleRow, "firstObservationAt" | "lastObservationAt"> & Readonly<{ firstObservationAt: string | null; lastObservationAt: string | null }>)[];
}>;

/** Reports alone accepts the empty half-open interval [from, from). */
export function parseFleetActivityReportRange(rawFrom: unknown, rawTo: unknown): Readonly<{ from: Date; to: Date }> | null {
  const from = parseAbsoluteTimestamp(rawFrom); const to = parseAbsoluteTimestamp(rawTo);
  if (!from || !to) return null;
  const duration = to.getTime() - from.getTime();
  return duration >= 0 && duration <= FLEET_ACTIVITY_REPORT_MAX_RANGE_MS ? Object.freeze({ from, to }) : null;
}

@Controller("reports")
@RequireAnyPermission("reports.view")
export class FleetActivityReportController {
  public constructor(private readonly service: FleetActivityReportService) {}
  @Get("fleet-activity")
  public async getReport(@Query("from") rawFrom: unknown, @Query("to") rawTo: unknown, @Req() request: AuthenticatedRequest): Promise<FleetActivityReportResponse> {
    const range = parseFleetActivityReportRange(rawFrom, rawTo);
    if (!range) throw new HttpException({ statusCode: 400, error: "Bad Request" }, 400);
    try {
      const report = await this.service.getReport(range, request.auth!.id);
      return Object.freeze({ ...report, from: report.from.toISOString(), to: report.to.toISOString(), generatedAt: report.generatedAt.toISOString(), vehicles: Object.freeze(report.vehicles.map((row) => Object.freeze({ ...row, firstObservationAt: row.firstObservationAt?.toISOString() ?? null, lastObservationAt: row.lastObservationAt?.toISOString() ?? null }))) });
    } catch { throw new HttpException({ statusCode: 500, error: "Internal Server Error" }, 500); }
  }
}

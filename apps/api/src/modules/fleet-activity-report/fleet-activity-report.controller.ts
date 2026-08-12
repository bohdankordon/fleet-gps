import { Controller, Get, HttpException, Query } from "@nestjs/common";
import { parseAbsoluteTimestamp } from "../vehicle-track/vehicle-track-query-params";
import { FleetActivityReportService } from "./fleet-activity-report.service";
import type { FleetActivityReport } from "./fleet-activity-report.types";

export const FLEET_ACTIVITY_REPORT_MAX_RANGE_MS = 25 * 60 * 60 * 1_000;
export type FleetActivityReportResponse = Omit<FleetActivityReport, "from" | "to"> & Readonly<{ from: string; to: string }>;
export function parseFleetActivityReportRange(rawFrom: unknown, rawTo: unknown): Readonly<{ from: Date; to: Date }> | null { const from = parseAbsoluteTimestamp(rawFrom); const to = parseAbsoluteTimestamp(rawTo); if (!from || !to) return null; const duration = to.getTime() - from.getTime(); return duration > 0 && duration <= FLEET_ACTIVITY_REPORT_MAX_RANGE_MS ? Object.freeze({ from, to }) : null; }

@Controller("reports")
export class FleetActivityReportController {
  public constructor(private readonly service: FleetActivityReportService) {}
  @Get("fleet-activity")
  public async getReport(@Query("from") rawFrom: unknown, @Query("to") rawTo: unknown): Promise<FleetActivityReportResponse> {
    const range = parseFleetActivityReportRange(rawFrom, rawTo); if (!range) throw new HttpException({ statusCode: 400, error: "Bad Request" }, 400);
    try { const report = await this.service.getReport(range); return Object.freeze({ ...report, from: report.from.toISOString(), to: report.to.toISOString() }); }
    catch { throw new HttpException({ statusCode: 500, error: "Internal Server Error" }, 500); }
  }
}

import { resolveInitialFleetActivityReportDate } from "./fleet-activity-report-date";
import type { FleetActivityReportResponse } from "./fleet-activity-report-contract";
import type { VehicleTrackRange } from "../vehicle-track/vehicle-track-range";

export type ReportPageState = Readonly<{
  initialDate: string | null; initialRange: VehicleTrackRange | null;
  initialData: FleetActivityReportResponse | null; initialError: "report" | "context" | null;
  now: string; timezone: string | null;
}>;
type Dependencies = Readonly<{
  runtime: () => Promise<{ timezone: string }>;
  report: (range: VehicleTrackRange) => Promise<FleetActivityReportResponse>;
}>;

/** Keep calendar resolution and returned timezone consistent, including a settings
 * change between the runtime read and report generation. Never guess a timezone. */
export async function loadReportPage(query: Record<string, string | string[] | undefined>, now: Date, deps: Dependencies): Promise<ReportPageState> {
  const empty: ReportPageState = { initialDate: null, initialRange: null, initialData: null, initialError: "context", now: now.toISOString(), timezone: null };
  let timezone: string;
  try { timezone = (await deps.runtime()).timezone; } catch { return empty; }
  let resolved = resolveInitialFleetActivityReportDate(query, now, timezone);
  if (!resolved) return empty;
  try {
    let data = await deps.report(resolved.range);
    if (data.timezone !== timezone) {
      timezone = data.timezone;
      resolved = resolveInitialFleetActivityReportDate(query, now, timezone);
      if (!resolved) return empty;
      data = await deps.report(resolved.range);
      if (data.timezone !== timezone) return empty;
    }
    if (data.from !== resolved.range.from || data.to !== resolved.range.to) throw new Error("Report range mismatch");
    return { initialDate: resolved.date, initialRange: resolved.range, initialData: data, initialError: null, now: now.toISOString(), timezone: data.timezone };
  } catch {
    return { ...empty, initialDate: resolved?.date ?? null, initialRange: resolved?.range ?? null, timezone, initialError: "report" };
  }
}

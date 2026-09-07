import { ReportNavigation } from "@/components/report-navigation";
import { fetchFleetActivityReport } from "@/lib/fleet-activity-report/fleet-activity-report-client";
import { loadReportPage } from "@/lib/fleet-activity-report/fleet-activity-report-page-loader";
import { fetchRuntimeSettings } from "@/lib/runtime-settings/runtime-settings-client";
import "@/styles/reports.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ReportsPage({ searchParams }: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  const state = await loadReportPage(await searchParams, new Date(), { runtime: fetchRuntimeSettings, report: fetchFleetActivityReport });
  return <ReportNavigation {...state} />;
}

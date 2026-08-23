import { DashboardClient } from "@/components/dashboard-client";
import { InitialDashboardError } from "@/components/initial-dashboard-error";
import { fetchDashboardVehicles } from "@/lib/dashboard/dashboard-client";
import { parseDashboardQuery } from "@/lib/dashboard/dashboard-query";
import { fetchSchedulerStatus } from "@/lib/scheduler/scheduler-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function Home({ searchParams }: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  const raw = await searchParams; const params = new URLSearchParams(); for (const [key, value] of Object.entries(raw)) if (typeof value === "string") params.set(key, value);
  let query;
  try { query = parseDashboardQuery(params); } catch { return <InitialDashboardError />; }
  const [dashboardResult, schedulerResult] = await Promise.allSettled([fetchDashboardVehicles(query), fetchSchedulerStatus()]);
  const initialData = dashboardResult.status === "fulfilled" ? dashboardResult.value : null;
  const initialSchedulerStatus = schedulerResult.status === "fulfilled" ? schedulerResult.value : null;
  if (!initialData) return <InitialDashboardError />;
  return <div><DashboardClient initialData={initialData} initialQuery={query} initialSchedulerStatus={initialSchedulerStatus} /></div>;
}

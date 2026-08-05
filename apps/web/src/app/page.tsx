import { DashboardClient } from "@/components/dashboard-client";
import { InitialDashboardError } from "@/components/initial-dashboard-error";
import { fetchDashboardVehicles } from "@/lib/dashboard/dashboard-client";
import { parseDashboardQuery } from "@/lib/dashboard/dashboard-query";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function Home({ searchParams }: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  const raw = await searchParams; const params = new URLSearchParams(); for (const [key, value] of Object.entries(raw)) if (typeof value === "string") params.set(key, value);
  let query;
  try { query = parseDashboardQuery(params); } catch { return <InitialDashboardError />; }
  let initialData;
  try { initialData = await fetchDashboardVehicles(query); } catch { initialData = null; }
  if (!initialData) return <InitialDashboardError />;
  return <main><DashboardClient initialData={initialData} initialQuery={query} /></main>;
}

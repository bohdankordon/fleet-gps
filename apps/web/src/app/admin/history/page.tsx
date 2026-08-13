import { redirect } from "next/navigation";
import { PositionHistoryStatusView } from "@/components/position-history-status-view";
import { fetchPositionHistoryStatus } from "@/lib/position-history-status/position-history-status-client";
import { resolvePositionHistoryAnchor } from "@/lib/position-history-status/position-history-status-anchor";
import { AdminSubnavigation } from "@/components/admin-subnavigation";
import { getAuthUser } from "@/lib/auth/auth-user";
import { hasPermission } from "@/lib/auth/auth-contract";
import { fetchActiveDurableRun, fetchRecentDurableRuns } from "@/lib/position-history-durable-runs/position-history-durable-run-client";
import { fetchPositionHistoryRetentionPlan } from "@/lib/position-history-retention/position-history-retention-client";
import { PositionHistoryRetention } from "@/components/position-history-retention";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminHistoryPage({ searchParams }: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  const [resolved, user] = await Promise.all([searchParams.then(resolvePositionHistoryAnchor), getAuthUser()]);
  if (resolved.absent) redirect(`/admin/history?${new URLSearchParams({ to: new Date().toISOString() })}`);
  if (!resolved.anchor) return <main><AdminSubnavigation /><PositionHistoryStatusView anchor={resolved.input} data={null} error="INVALID_ANCHOR" /></main>;
  let data = null;
  let error: "UNAVAILABLE" | null = null;
  const [statusResult, activeResult, recentResult, retentionResult] = await Promise.allSettled([fetchPositionHistoryStatus(resolved.anchor), fetchActiveDurableRun(), fetchRecentDurableRuns(), fetchPositionHistoryRetentionPlan()]);
  if (statusResult.status === "fulfilled") data = statusResult.value;
  else error = "UNAVAILABLE";
  return <main><AdminSubnavigation /><PositionHistoryStatusView anchor={resolved.anchor} data={data} error={error} canPopulate={user !== null && hasPermission(user, "historyAdmin.populate")} showDurableRuns initialDurableActive={activeResult.status === "fulfilled" ? activeResult.value : null} initialDurableRecent={recentResult.status === "fulfilled" ? recentResult.value : []} /><PositionHistoryRetention data={retentionResult.status === "fulfilled" ? retentionResult.value : null} unavailable={retentionResult.status === "rejected"} /></main>;
}

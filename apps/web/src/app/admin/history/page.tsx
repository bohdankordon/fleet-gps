import { redirect } from "next/navigation";
import { PositionHistoryStatusView } from "@/components/position-history-status-view";
import { fetchPositionHistoryStatus } from "@/lib/position-history-status/position-history-status-client";
import { resolvePositionHistoryAnchor } from "@/lib/position-history-status/position-history-status-anchor";
import { getAuthUser } from "@/lib/auth/auth-user";
import { hasPermission } from "@/lib/auth/auth-contract";
import { fetchActiveDurableRun, fetchRecentDurableRuns } from "@/lib/position-history-durable-runs/position-history-durable-run-client";
import { fetchPositionHistoryRetentionPlan } from "@/lib/position-history-retention/position-history-retention-client";
import { PositionHistoryRetention } from "@/components/position-history-retention";
import { AdminNavigationTabs } from "@/components/admin-navigation-tabs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminHistoryPage({ searchParams }: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  const [resolved, user] = await Promise.all([searchParams.then(resolvePositionHistoryAnchor), getAuthUser()]);
  if (resolved.absent) redirect(`/admin/history?${new URLSearchParams({ to: new Date().toISOString() })}`);
  if (!resolved.anchor) return <div><PositionHistoryStatusView anchor={resolved.input} data={null} error="INVALID_ANCHOR" navigation={<AdminNavigationTabs />} /></div>;
  let data = null;
  let error: "UNAVAILABLE" | null = null;
  const [statusResult, activeResult, recentResult, retentionResult] = await Promise.allSettled([fetchPositionHistoryStatus(resolved.anchor), fetchActiveDurableRun(), fetchRecentDurableRuns(), fetchPositionHistoryRetentionPlan()]);
  if (statusResult.status === "fulfilled") data = statusResult.value;
  else error = "UNAVAILABLE";
  // Truthful read-state: SUCCESS + NONE vs READ FAILURE are distinct.
  // Do NOT conceal durable-run poll failures as ordinary null/empty state.
  const initialDurableActive = activeResult.status === "fulfilled" ? activeResult.value : null;
  const initialDurableActiveUnavailable = activeResult.status === "rejected";
  const initialDurableRecent = recentResult.status === "fulfilled" ? recentResult.value : [];
  const initialDurableRecentUnavailable = recentResult.status === "rejected";
  return <div><PositionHistoryStatusView anchor={resolved.anchor} data={data} error={error} navigation={<AdminNavigationTabs />} canPopulate={user !== null && hasPermission(user, "historyAdmin.populate")} showDurableRuns initialDurableActive={initialDurableActive} initialDurableRecent={initialDurableRecent} initialDurableActiveUnavailable={initialDurableActiveUnavailable} initialDurableRecentUnavailable={initialDurableRecentUnavailable} /><PositionHistoryRetention data={retentionResult.status === "fulfilled" ? retentionResult.value : null} unavailable={retentionResult.status === "rejected"} isAdmin={user?.role === "ADMIN"} /></div>;
}

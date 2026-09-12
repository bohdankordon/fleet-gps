import { redirect } from "next/navigation";
import { AdminNavigationTabs } from "@/components/admin-navigation-tabs";
import { PositionHistoryNavigation } from "@/components/position-history-navigation";
import { PositionHistoryStatusView } from "@/components/position-history-status-view";
import { hasPermission, requireAuthUser } from "@/lib/auth/auth-user";
import { fetchActiveDurableRun, fetchRecentDurableRuns } from "@/lib/position-history-durable-runs/position-history-durable-run-client";
import { resolvePositionHistoryAnchor } from "@/lib/position-history-status/position-history-status-anchor";
import { fetchPositionHistoryStatus } from "@/lib/position-history-status/position-history-status-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PositionHistoryPopulationPage({ searchParams }: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  const [resolved, user] = await Promise.all([searchParams.then(resolvePositionHistoryAnchor), requireAuthUser()]);
  if (user.mustChangePassword) redirect("/account/change-password");
  if (!hasPermission(user, "historyAdmin.view")) redirect("/forbidden");
  if (resolved.absent) redirect(`/admin/history/population?${new URLSearchParams({ to: new Date().toISOString() })}`);
  const [statusResult, activeResult, recentResult] = await Promise.allSettled([
    resolved.anchor ? fetchPositionHistoryStatus(resolved.anchor) : Promise.resolve(null),
    fetchActiveDurableRun(),
    fetchRecentDurableRuns(),
  ]);
  const navigation = <><AdminNavigationTabs /><PositionHistoryNavigation anchor={resolved.anchor} isAdmin={user.role === "ADMIN"} /></>;
  if (!resolved.anchor) return <PositionHistoryStatusView anchor={resolved.input} data={null} error="INVALID_ANCHOR" navigation={navigation} formAction="/admin/history/population" />;
  return <PositionHistoryStatusView anchor={resolved.anchor} data={statusResult.status === "fulfilled" ? statusResult.value : null} error={statusResult.status === "rejected" ? "UNAVAILABLE" : null} navigation={navigation} formAction="/admin/history/population" canPopulate={hasPermission(user, "historyAdmin.populate")} showDurableRuns initialDurableActive={activeResult.status === "fulfilled" ? activeResult.value : null} initialDurableRecent={recentResult.status === "fulfilled" ? recentResult.value : []} initialDurableActiveUnavailable={activeResult.status === "rejected"} initialDurableRecentUnavailable={recentResult.status === "rejected"} />;
}

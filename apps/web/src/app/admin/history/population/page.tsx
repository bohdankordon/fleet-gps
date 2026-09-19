import { redirect } from "next/navigation";
import { AdminNavigationTabs } from "@/components/admin-navigation-tabs";
import { PositionHistoryNavigation } from "@/components/position-history-navigation";
import { PositionHistoryPopulationWorkspace } from "@/components/position-history-population-workspace";
import { hasPermission, requireAuthUser } from "@/lib/auth/auth-user";
import { resolvePositionHistoryAnchor } from "@/lib/position-history-anchor";
import { fetchActiveDurableRun, fetchRecentDurableRuns } from "@/lib/position-history-durable-runs/position-history-durable-run-client";
import { fetchPositionHistoryHorizonPlan } from "@/lib/position-history-horizon-plan/position-history-horizon-plan-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PositionHistoryPopulationPage({ searchParams }: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  const [resolved, user] = await Promise.all([searchParams.then(resolvePositionHistoryAnchor), requireAuthUser()]);
  if (user.mustChangePassword) redirect("/account/change-password");
  if (!hasPermission(user, "historyAdmin.view")) redirect("/forbidden");
  if (resolved.absent) redirect(`/admin/history/population?${new URLSearchParams({ to: new Date().toISOString() })}`);
  const [planResult, activeResult, recentResult] = await Promise.allSettled([
    resolved.anchor ? fetchPositionHistoryHorizonPlan(resolved.anchor) : Promise.resolve(null),
    fetchActiveDurableRun(),
    fetchRecentDurableRuns(),
  ]);
  return <PositionHistoryPopulationWorkspace
    key={resolved.anchor ?? "invalid"}
    anchor={resolved.anchor}
    plan={planResult.status === "fulfilled" ? planResult.value : null}
    planError={resolved.anchor === null ? "INVALID_ANCHOR" : planResult.status === "rejected" ? "UNAVAILABLE" : null}
    canPopulate={hasPermission(user, "historyAdmin.populate")}
    initialActive={activeResult.status === "fulfilled" ? activeResult.value : null}
    initialRecent={recentResult.status === "fulfilled" ? recentResult.value : []}
    initialActiveUnavailable={activeResult.status === "rejected"}
    initialRecentUnavailable={recentResult.status === "rejected"}
    administrationNavigation={<AdminNavigationTabs key="administration-navigation" />}
    historyNavigation={<PositionHistoryNavigation key="history-navigation" anchor={resolved.anchor} isAdmin={user.role === "ADMIN"} />}
  />;
}

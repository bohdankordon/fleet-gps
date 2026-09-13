import { redirect } from "next/navigation";
import { AdminNavigationTabs } from "@/components/admin-navigation-tabs";
import { PositionHistoryNavigation } from "@/components/position-history-navigation";
import { PositionHistoryOverview } from "@/components/position-history-overview";
import { requireAuthUser } from "@/lib/auth/auth-user";
import { fetchActiveDurableRun } from "@/lib/position-history-durable-runs/position-history-durable-run-client";
import { resolvePositionHistoryAnchor } from "@/lib/position-history-status/position-history-status-anchor";
import { fetchPositionHistoryStatus } from "@/lib/position-history-status/position-history-status-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminHistoryPage({ searchParams }: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  const [resolved, user] = await Promise.all([searchParams.then(resolvePositionHistoryAnchor), requireAuthUser()]);
  if (resolved.absent) redirect(`/admin/history?${new URLSearchParams({ to: new Date().toISOString() })}`);
  const [statusResult, activeResult] = await Promise.allSettled([
    resolved.anchor ? fetchPositionHistoryStatus(resolved.anchor) : Promise.resolve(null),
    fetchActiveDurableRun(),
  ]);
  return <PositionHistoryOverview anchor={resolved.anchor} data={statusResult.status === "fulfilled" ? statusResult.value : null} statusError={resolved.anchor === null ? "INVALID_ANCHOR" : statusResult.status === "rejected" ? "UNAVAILABLE" : null} active={activeResult.status === "fulfilled" ? activeResult.value : null} activeUnavailable={activeResult.status === "rejected"} administrationNavigation={<AdminNavigationTabs />} historyNavigation={<PositionHistoryNavigation anchor={resolved.anchor} isAdmin={user.role === "ADMIN"} />} />;
}

import { AdminNavigationTabs } from "@/components/admin-navigation-tabs";
import { PositionHistoryNavigation } from "@/components/position-history-navigation";
import { PositionHistoryOverview } from "@/components/position-history-overview";
import { requireAuthUser } from "@/lib/auth/auth-user";
import { fetchPositionHistoryIngestionStatus } from "@/lib/position-history-ingestion-status/position-history-ingestion-status-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminHistoryPage() {
  const user = await requireAuthUser();
  const [statusResult] = await Promise.allSettled([fetchPositionHistoryIngestionStatus()]);
  return <PositionHistoryOverview
    data={statusResult.status === "fulfilled" ? statusResult.value : null}
    statusError={statusResult.status === "rejected" ? "UNAVAILABLE" : null}
    administrationNavigation={<AdminNavigationTabs />}
    historyNavigation={<PositionHistoryNavigation anchor={null} isAdmin={user.role === "ADMIN"} />}
  />;
}

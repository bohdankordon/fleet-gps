import { redirect } from "next/navigation";
import { AdminNavigationTabs } from "@/components/admin-navigation-tabs";
import { CompactPageHeading } from "@/components/compact-page-heading";
import { PositionHistoryNavigation } from "@/components/position-history-navigation";
import { PositionHistoryRetention } from "@/components/position-history-retention";
import { getServerI18n } from "@/i18n/server";
import { requireAuthUser } from "@/lib/auth/auth-user";
import { fetchPositionHistoryRetentionPlan } from "@/lib/position-history-retention/position-history-retention-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PositionHistoryRetentionPage() {
  const [user, { t }] = await Promise.all([requireAuthUser(), getServerI18n()]);
  if (user.mustChangePassword) redirect("/account/change-password");
  if (user.role !== "ADMIN") redirect("/forbidden");
  const [result] = await Promise.allSettled([fetchPositionHistoryRetentionPlan()]);
  return <div className="history-transitional-page"><header><CompactPageHeading title={t("history.title")} subtitle={t("history.retention.workspaceDescription")} /></header><AdminNavigationTabs /><PositionHistoryNavigation anchor={null} isAdmin /><PositionHistoryRetention data={result.status === "fulfilled" ? result.value : null} unavailable={result.status === "rejected"} isAdmin /></div>;
}

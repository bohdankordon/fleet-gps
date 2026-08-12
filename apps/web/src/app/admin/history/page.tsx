import { redirect } from "next/navigation";
import { PositionHistoryStatusView } from "@/components/position-history-status-view";
import { fetchPositionHistoryStatus } from "@/lib/position-history-status/position-history-status-client";
import { resolvePositionHistoryAnchor } from "@/lib/position-history-status/position-history-status-anchor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminHistoryPage({ searchParams }: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  const resolved = resolvePositionHistoryAnchor(await searchParams);
  if (resolved.absent) redirect(`/admin/history?${new URLSearchParams({ to: new Date().toISOString() })}`);
  if (!resolved.anchor) return <main><PositionHistoryStatusView anchor={resolved.input} data={null} error="INVALID_ANCHOR" /></main>;
  let data = null;
  let error: "UNAVAILABLE" | null = null;
  try { data = await fetchPositionHistoryStatus(resolved.anchor); }
  catch { error = "UNAVAILABLE"; }
  return <main><PositionHistoryStatusView anchor={resolved.anchor} data={data} error={error} /></main>;
}

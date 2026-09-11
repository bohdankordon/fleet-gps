import { redirect } from "next/navigation";
import { AuditViewer } from "@/components/audit-viewer";
import { AdminNavigationTabs } from "@/components/admin-navigation-tabs";
import { requireAuthUser } from "@/lib/auth/auth-user";
import { parseAuditPageQuery } from "@/lib/audit/audit-query";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function AdminAuditPage({ searchParams }: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  const [user, rawQuery] = await Promise.all([requireAuthUser(), searchParams]);
  if (user.role !== "ADMIN") redirect("/forbidden");
  const query = parseAuditPageQuery(rawQuery);
  return <AuditViewer navigation={<AdminNavigationTabs />} initialFilters={query.filters} initialQueryValid={query.valid} />;
}

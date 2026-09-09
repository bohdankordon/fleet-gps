import { redirect } from "next/navigation";
import { AdminNavigationTabs } from "@/components/admin-navigation-tabs";
import { AdminUsersPageHeader, AdminUsersWorkspace } from "@/components/admin-users-workspace";
import { getServerI18n } from "@/i18n/server";
import { fetchAdminUsers } from "@/lib/admin-users/admin-users-client";
import { parseAdminUsersQuery } from "@/lib/admin-users/admin-users-directory-model";
import { requireAuthUser } from "@/lib/auth/auth-user";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminUsersPage({ searchParams }: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  const [actor, query] = await Promise.all([requireAuthUser(), searchParams]);
  if (actor.role !== "ADMIN") redirect("/forbidden");
  let users = null;
  try { users = await fetchAdminUsers(); } catch {}
  return <div className="admin-users-page-v2">
    <AdminUsersPageHeader />
    <AdminNavigationTabs />
    <AdminUsersWorkspace users={users} actorId={actor.id} initialQuery={parseAdminUsersQuery(query)} />
  </div>;
}

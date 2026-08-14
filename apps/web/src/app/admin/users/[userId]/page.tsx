import { notFound, redirect } from "next/navigation";
import { AdminSubnavigation } from "@/components/admin-subnavigation";
import { AdminUserDetail } from "@/components/admin-user-detail";
import { fetchAdminUser } from "@/lib/admin-users/admin-users-client";
import { requireAuthUser } from "@/lib/auth/auth-user";
import { getServerI18n } from "@/i18n/server";
export const dynamic = "force-dynamic"; export const revalidate = 0;
export default async function AdminUserPage({ params }: Readonly<{ params: Promise<{ userId: string }> }>) { const [actor, { t }] = await Promise.all([requireAuthUser(), getServerI18n()]); if (actor.role !== "ADMIN") redirect("/forbidden"); const { userId } = await params; let user; try { user = await fetchAdminUser(userId); } catch { return <main><AdminSubnavigation /><p className="admin-error" role="alert">{t("admin.user.loadError")}</p></main>; } if (!user) notFound(); return <main><AdminSubnavigation /><header className="hero"><div><p className="eyebrow">{t("admin.users.title")}</p><h1>{t("admin.users.manageTitle")}</h1></div></header><AdminUserDetail initialUser={user} actorId={actor.id} /></main>; }

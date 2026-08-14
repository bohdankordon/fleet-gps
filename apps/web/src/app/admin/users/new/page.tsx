import { redirect } from "next/navigation";
import { AdminSubnavigation } from "@/components/admin-subnavigation";
import { AdminUserCreateForm } from "@/components/admin-user-create-form";
import { requireAuthUser } from "@/lib/auth/auth-user";
import { getServerI18n } from "@/i18n/server";
export const dynamic = "force-dynamic"; export const revalidate = 0;
export default async function NewAdminUserPage() { const [actor, { t }] = await Promise.all([requireAuthUser(), getServerI18n()]); if (actor.role !== "ADMIN") redirect("/forbidden"); return <main><AdminSubnavigation /><header className="hero"><div><p className="eyebrow">{t("admin.users.title")}</p><h1>{t("admin.users.createTitle")}</h1><p>{t("admin.users.createDescription")}</p></div></header><AdminUserCreateForm /></main>; }

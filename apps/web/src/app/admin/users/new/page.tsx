import { redirect } from "next/navigation";
import { AdminUserCreateForm } from "@/components/admin-user-create-form";
import { requireAuthUser } from "@/lib/auth/auth-user";
import { getServerI18n } from "@/i18n/server";
import { PageHeader } from "@/components/ui";
export const dynamic = "force-dynamic"; export const revalidate = 0;
export default async function NewAdminUserPage() { const [actor, { t }] = await Promise.all([requireAuthUser(), getServerI18n()]); if (actor.role !== "ADMIN") redirect("/forbidden"); return <div><PageHeader eyebrow={t("admin.users.title")} title={t("admin.users.createTitle")} description={t("admin.users.createDescription")} /><AdminUserCreateForm /></div>; }

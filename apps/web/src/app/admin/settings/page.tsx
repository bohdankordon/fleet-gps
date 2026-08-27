import { redirect } from "next/navigation";
import { AdminSettingsForm } from "@/components/admin-settings-form";
import { AdminSubnavigation } from "@/components/admin-subnavigation";
import { requireAuthUser } from "@/lib/auth/auth-user";
import { fetchAdminSettings } from "@/lib/admin-settings/admin-settings-client";
export const dynamic = "force-dynamic"; export const revalidate = 0;
export default async function AdminSettingsPage() {
  const user = await requireAuthUser(); if (user.role !== "ADMIN") redirect("/forbidden"); let settings = null;
  try { settings = await fetchAdminSettings(); } catch {}
  return <div><AdminSubnavigation /><header className="hero"><div><p className="eyebrow">Administration</p><h1>Business settings</h1><p>Global runtime business policy for the whole fleet.</p></div></header>{settings ? <AdminSettingsForm initial={settings} /> : <p className="admin-error" role="alert">Settings could not be loaded.</p>}</div>;
}

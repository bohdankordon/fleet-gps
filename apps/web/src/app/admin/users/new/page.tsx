import { redirect } from "next/navigation";
import { AdminSubnavigation } from "@/components/admin-subnavigation";
import { AdminUserCreateForm } from "@/components/admin-user-create-form";
import { requireAuthUser } from "@/lib/auth/auth-user";
export const dynamic = "force-dynamic"; export const revalidate = 0;
export default async function NewAdminUserPage() { const actor = await requireAuthUser(); if (actor.role !== "ADMIN") redirect("/forbidden"); return <main><AdminSubnavigation /><header className="hero"><div><p className="eyebrow">Пользователи</p><h1>Новый пользователь</h1><p>Временный пароль создаст приложение после сохранения.</p></div></header><AdminUserCreateForm /></main>; }

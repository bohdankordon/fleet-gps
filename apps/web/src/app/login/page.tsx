import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getAuthUser } from "@/lib/auth/auth-user";
import { landingFor } from "@/lib/auth/auth-contract";
import { getServerI18n } from "@/i18n/server";
export const dynamic = "force-dynamic";
export default async function LoginPage() { const [user, { t }] = await Promise.all([getAuthUser(), getServerI18n()]); if (user) redirect(landingFor(user)); return <main className="auth-page"><section className="auth-card"><h1>{t("auth.login.title")}</h1><LoginForm /></section></main>; }

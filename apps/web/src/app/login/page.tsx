import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getAuthUser } from "@/lib/auth/auth-user";
import { landingFor } from "@/lib/auth/auth-contract";
import { getServerI18n } from "@/i18n/server";
export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerI18n();
  return { title: t("auth.login.metaTitle") };
}
export default async function LoginPage() {
  const [user, { t }] = await Promise.all([getAuthUser(), getServerI18n()]);
  if (user) redirect(landingFor(user));
  return (
    <div className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <h1 id="login-title" className="login-card__title">{t("auth.login.title")}</h1>
        <p className="login-card__subtitle">{t("auth.login.subtitle")}</p>
        <LoginForm />
      </section>
    </div>
  );
}

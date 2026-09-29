import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { LoginUnavailable } from "@/components/login-unavailable";
import { resolveAuthUser } from "@/lib/auth/auth-user";
import { postAuthDestination, parseReturnTo } from "@/lib/auth/return-to";
import { getServerI18n } from "@/i18n/server";
export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerI18n();
  return { title: t("auth.login.metaTitle") };
}
export default async function LoginPage({ searchParams }: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  const query = await searchParams;
  const returnTo = parseReturnTo(query.returnTo);
  const [{ locale, t }, resolution] = await Promise.all([getServerI18n(), resolveAuthUser()]);
  if (resolution.kind === "authenticated") redirect(postAuthDestination(resolution.user, returnTo));
  return (
    <div className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <h1 id="login-title" className="login-card__title">{t("auth.login.title")}</h1>
        <p className="login-card__subtitle">{t("auth.login.subtitle")}</p>
        {resolution.kind === "unavailable" ? <LoginUnavailable locale={locale} /> : <LoginForm returnTo={returnTo} />}
      </section>
    </div>
  );
}

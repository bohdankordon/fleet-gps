import type { Metadata } from "next";
import { AppNavigation } from "@/components/app-navigation";
import { AppShell } from "@/components/app-shell";
import { AuthProvider } from "@/components/auth-provider";
import { I18nProvider } from "@/i18n/client";
import { getServerI18n } from "@/i18n/server";
import { getAuthUser } from "@/lib/auth/auth-user";
import "./globals.css";
import "../styles/shell.css";
import "maplibre-gl/dist/maplibre-gl.css";

export async function generateMetadata(): Promise<Metadata> { const { t } = await getServerI18n(); return { title: t("document.title"), description: t("document.description") }; }
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { const [user, { locale, t }] = await Promise.all([getAuthUser(), getServerI18n()]); return <html lang={locale}><body><I18nProvider locale={locale}><AuthProvider user={user}><AppShell skipLabel={t("navigation.skipToMain")} navigation={<AppNavigation />}>{children}</AppShell></AuthProvider></I18nProvider></body></html>; }

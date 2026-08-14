import type { Metadata } from "next";
import { AppNavigation } from "@/components/app-navigation";
import { AuthProvider } from "@/components/auth-provider";
import { LanguageSelector } from "@/components/language-selector";
import { I18nProvider } from "@/i18n/client";
import { getServerI18n } from "@/i18n/server";
import { getAuthUser } from "@/lib/auth/auth-user";
import "./globals.css";
import "maplibre-gl/dist/maplibre-gl.css";

export async function generateMetadata(): Promise<Metadata> { const { t } = await getServerI18n(); return { title: t("document.title"), description: t("document.description") }; }
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { const [user, { locale }] = await Promise.all([getAuthUser(), getServerI18n()]); return <html lang={locale}><body><I18nProvider locale={locale}><AuthProvider user={user}><div className="language-selector-shell"><LanguageSelector /></div><AppNavigation />{children}</AuthProvider></I18nProvider></body></html>; }

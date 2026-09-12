import type { Metadata } from "next";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { AntDesignProvider } from "@/components/ant-design-provider";
import { AppNavigation } from "@/components/app-navigation";
import { AppShell } from "@/components/app-shell";
import { AuthProvider } from "@/components/auth-provider";
import { I18nProvider } from "@/i18n/client";
import { getServerI18n } from "@/i18n/server";
import { getAuthUser } from "@/lib/auth/auth-user";
import "./globals.css";
import "../styles/shell.css";
import "../styles/dashboard.css";
import "../styles/map.css";
import "../styles/vehicle-details.css";
import "../styles/vehicle-trips.css";
import "../styles/vehicle-track.css";
import "../styles/admin-users.css";
import "../styles/admin-user-detail-v2.css";
import "../styles/admin-user-detail-access.css";
import "../styles/admin-user-create-v2.css";
import "../styles/business-settings.css";
import "../styles/admin-audit.css";
import "../styles/admin-history-overview.css";
import "../styles/account.css";
import "maplibre-gl/dist/maplibre-gl.css";

export async function generateMetadata(): Promise<Metadata> { const { t } = await getServerI18n(); return { title: t("document.title"), description: t("document.description") }; }
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { const [user, { locale, t }] = await Promise.all([getAuthUser(), getServerI18n()]); return <html lang={locale}><body><AntdRegistry><AntDesignProvider locale={locale}><I18nProvider locale={locale}><AuthProvider user={user}><AppShell skipLabel={t("navigation.skipToMain")} navigation={<AppNavigation />}>{children}</AppShell></AuthProvider></I18nProvider></AntDesignProvider></AntdRegistry></body></html>; }

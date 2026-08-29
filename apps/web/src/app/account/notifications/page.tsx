import { TelegramNotificationsPanel } from "@/components/telegram-notifications-panel";
import { requireAuthUser } from "@/lib/auth/auth-user";
import { getServerI18n } from "@/i18n/server";
import { parseWebConfig } from "@/lib/web-config";
import { cookies } from "next/headers";
export const dynamic = "force-dynamic";
export default async function NotificationsPage() { await requireAuthUser(); const [i18n, jar] = await Promise.all([getServerI18n(), cookies()]); let initial = { status: "NOT_CONNECTED" as const, pendingExpiresAt: null }; try { const response = await fetch(`${parseWebConfig(process.env).apiInternalBaseUrl}/api/account/notifications`, { headers: { Cookie: jar.toString() }, cache: "no-store" }); const value = await response.json(); if (response.ok && value && ["NOT_CONNECTED", "LINK_PENDING", "CONNECTED", "BROKEN"].includes(value.status)) initial = value; } catch {} return <div><header className="hero"><div><p className="eyebrow">{i18n.t("telegram.title")}</p><h1>{i18n.t("telegram.heading")}</h1></div></header><TelegramNotificationsPanel initial={initial} /></div>; }

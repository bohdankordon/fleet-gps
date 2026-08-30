"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "../i18n/client";
import { Button } from "./ui";
export function LogoutButton({ size = "default" }: Readonly<{ size?: "compact" | "default" | "comfortable" }>) { const router = useRouter(); const { t } = useI18n(); const [busy, setBusy] = useState(false); return <Button variant="subtle" size={size} loading={busy} onClick={async () => { setBusy(true); try { await fetch("/api/auth/logout", { method: "POST" }); } finally { router.replace("/login"); router.refresh(); } }}>{busy ? t("auth.logout.submitting") : t("auth.logout.submit")}</Button>; }

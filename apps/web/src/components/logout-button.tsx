"use client";
import { useRouter } from "next/navigation";
import { useState, type ComponentProps } from "react";
import { useI18n } from "../i18n/client";
import { Button } from "./ui";
export function LogoutButton({ className, children, ...buttonProps }: Readonly<ComponentProps<typeof Button>>) { const router = useRouter(); const { t } = useI18n(); const [busy, setBusy] = useState(false); return <Button {...buttonProps} variant="ghost" className={className} disabled={busy} aria-busy={busy || undefined} onClick={async () => { setBusy(true); try { await fetch("/api/auth/logout", { method: "POST" }); } finally { router.replace("/login"); router.refresh(); } }}>{children ?? (busy ? t("auth.logout.submitting") : t("auth.logout.submit"))}</Button>; }

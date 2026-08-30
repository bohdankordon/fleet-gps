"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "antd";
import { useI18n } from "../i18n/client";

export function useLogout() {
  const router = useRouter(); const { t } = useI18n(); const [busy, setBusy] = useState(false);
  const logout = async () => { setBusy(true); try { await fetch("/api/auth/logout", { method: "POST" }); } finally { router.replace("/login"); router.refresh(); } };
  return { busy, logout, label: busy ? t("auth.logout.submitting") : t("auth.logout.submit") };
}

export function LogoutButton({ size = "default" }: Readonly<{ size?: "compact" | "default" | "comfortable" }>) {
  const { busy, label, logout } = useLogout();
  return <Button size={size === "compact" ? "small" : size === "comfortable" ? "large" : "middle"} loading={busy} onClick={() => { void logout(); }}>{label}</Button>;
}

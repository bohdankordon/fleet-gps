"use client";

import { useState } from "react";
import { useI18n } from "../i18n/client";

export type OneTimePasswordCopyResult = "copied" | "invalid" | "failed";

export function isOneTimePassword(value: string): boolean {
  return /^[A-Za-z0-9_-]{24}$/.test(value);
}

export async function copyOneTimePassword(password: string, writeText: (value: string) => Promise<void>): Promise<OneTimePasswordCopyResult> {
  if (!isOneTimePassword(password)) return "invalid";
  try {
    await writeText(password);
    return "copied";
  } catch {
    return "failed";
  }
}

export function OneTimePassword({ password, title, onDone }: Readonly<{ password: string; title: string; onDone(): void }>) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  async function copy(): Promise<void> {
    const result = await copyOneTimePassword(password, (value) => navigator.clipboard.writeText(value));
    setCopied(result === "copied");
    setCopyError(result !== "copied");
  }

  function done(): void {
    setVisible(false);
    setCopied(false);
    setCopyError(false);
    onDone();
  }

  return <section className="one-time-secret" aria-live="polite">
    <h2>{title}</h2>
    <h3>{t("admin.password.temporaryTitle")}</h3>
    <p>{t("admin.password.copyNow")}</p>
    <output aria-label={t("admin.password.temporaryTitle")}>{visible ? password : "••••••••••••••••••••••••"}</output>
    <div className="admin-actions">
      <button type="button" onClick={() => setVisible((current) => !current)}>{visible ? t("admin.password.hide") : t("admin.password.show")}</button>
      <button type="button" onClick={copy}>{t("admin.password.copy")}</button>
      <button type="button" onClick={done}>{t("common.close")}</button>
    </div>
    {copied && <p role="status">{t("admin.password.copied")}</p>}
    {copyError && <p role="alert">{t("admin.password.copyError")}</p>}
  </section>;
}

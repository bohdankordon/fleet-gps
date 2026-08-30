"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Select } from "antd";
import { useI18n } from "../i18n/client";
import { NATIVE_LOCALE_NAMES, SUPPORTED_LOCALES, type AppLocale } from "../i18n/locales";

export function LanguageSelector() {
  const router = useRouter();
  const { locale, t } = useI18n();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const inFlight = useRef(false);

  async function change(nextLocale: AppLocale): Promise<void> {
    if (nextLocale === locale || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(false);
    try {
      const response = await fetch("/api/preferences/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: nextLocale }),
      });
      if (!response.ok) { setError(true); return; }
      router.refresh();
    } catch {
      setError(true);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return <div>
    <Select aria-label={t("language.label")} value={locale} disabled={pending} onChange={(value) => { void change(value as AppLocale); }} options={SUPPORTED_LOCALES.map((value) => ({ value, label: NATIVE_LOCALE_NAMES[value] }))} />
    {error && <span role="alert">{t("language.changeError")}</span>}
  </div>;
}

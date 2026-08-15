"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "../i18n/client";
import { NATIVE_LOCALE_NAMES, SUPPORTED_LOCALES, type AppLocale } from "../i18n/locales";
import { ChevronDownIcon, GlobeIcon } from "./ui/icons";

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

  return <div className="language-selector">
    <div className="language-selector-control">
      <GlobeIcon className="language-selector-globe" size={18} />
      <select aria-label={t("language.label")} value={locale} disabled={pending} onChange={(event) => { void change(event.currentTarget.value as AppLocale); }}>
        {SUPPORTED_LOCALES.map((value) => <option value={value} key={value}>{NATIVE_LOCALE_NAMES[value]}</option>)}
      </select>
      <ChevronDownIcon className="language-selector-chevron" size={16} />
    </div>
    {error && <span className="language-selector-error" role="alert">{t("language.changeError")}</span>}
  </div>;
}

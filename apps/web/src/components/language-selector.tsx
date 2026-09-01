"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DownOutlined, GlobalOutlined } from "@ant-design/icons";
import { Button, Dropdown } from "antd";
import { useI18n } from "../i18n/client";
import { NATIVE_LOCALE_NAMES, SUPPORTED_LOCALES, type AppLocale } from "../i18n/locales";

export function LanguageSelector() {
  const router = useRouter();
  const { locale, t } = useI18n();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
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

  const items = SUPPORTED_LOCALES.map((value) => ({ key: value, label: NATIVE_LOCALE_NAMES[value] }));
  return <div className="taxi-header__locale">
    <Dropdown open={open} onOpenChange={setOpen} menu={{ items, selectable: true, selectedKeys: [locale], onClick: ({ key }) => { setOpen(false); void change(key as AppLocale); } }} trigger={["click"]} placement="bottomRight" disabled={pending}>
      <Button className="taxi-header__control taxi-header__locale-control" type="text" size="small" loading={pending} aria-label={t("language.label")} aria-expanded={open} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") { event.preventDefault(); setOpen(true); } }}>
        <GlobalOutlined aria-hidden />
        <span>{NATIVE_LOCALE_NAMES[locale]}</span>
        <DownOutlined aria-hidden />
      </Button>
    </Dropdown>
    {error ? <span className="taxi-header__locale-error" role="alert">{t("language.changeError")}</span> : null}
  </div>;
}

"use client";

import { CalendarOutlined, DownOutlined } from "@ant-design/icons";
import { Button, DatePicker, Space } from "antd";
import dayjs from "dayjs";
import { useState } from "react";
import { useI18n } from "../i18n/client";
import { currentBusinessDate, previousBusinessDate } from "../lib/fleet-activity-report/fleet-activity-report-date";
import { formatReportDay, formatReportWindow } from "../lib/fleet-activity-report/fleet-activity-report-formatters";
import type { VehicleTrackRange } from "../lib/vehicle-track/vehicle-track-range";
import { PeriodPopover } from "./period-popover";

export function ReportPeriod({ date, range, now, timezone, pending, onDate }: Readonly<{
  date: string; range: VehicleTrackRange; now: string; timezone: string; pending: boolean; onDate: (date: string) => void;
}>) {
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(date);
  const choose = (value: string | null) => { if (value) { setOpen(false); onDate(value); } };
  return <section className="reports-period" aria-label={t("reports.controls.label")}>
    <span className="reports-muted reports-period__identity">{t("reports.reportName")}</span>
    <PeriodPopover open={open} onOpenChange={setOpen} title={t("reports.controls.label")} className="reports-period-popover" content={
      <div className="reports-period-editor">
        <Space wrap>
          <Button disabled={pending} onClick={() => choose(currentBusinessDate(new Date(now), timezone))}>{t("reports.today")}</Button>
          <Button disabled={pending} onClick={() => choose(previousBusinessDate(new Date(now), timezone))}>{t("reports.yesterday")}</Button>
        </Space>
        <label className="reports-date-label" htmlFor="reports-calendar-day">{t("reports.date")}</label>
        <div className="reports-date-editor">
          <DatePicker id="reports-calendar-day" aria-label={t("reports.date")} value={draft ? dayjs(draft) : null} format="DD.MM.YYYY" allowClear={false} showNow={false} onChange={(value) => setDraft(value?.format("YYYY-MM-DD") ?? "")} />
          <Button type="primary" disabled={!draft || pending} onClick={() => choose(draft)}>{t("reports.show")}</Button>
        </div>
        <p className="reports-muted">{timezone}</p>
      </div>
    }>
      <Button className="reports-period-trigger" icon={<CalendarOutlined />} disabled={pending} aria-expanded={open}>
        <span className="reports-period-trigger__text"><strong>{formatReportDay(date, locale, timezone)}</strong><span className="reports-muted">{formatReportWindow(range.from, range.to, locale, timezone)} · {timezone}</span></span><DownOutlined />
      </Button>
    </PeriodPopover>
  </section>;
}

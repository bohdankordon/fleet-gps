"use client";

import { CalendarOutlined, DownOutlined } from "@ant-design/icons";
import { Button, DatePicker, Divider, Flex, Typography, theme } from "antd";
import dayjs from "dayjs";
import { useState, type ReactNode } from "react";
import { useI18n } from "../i18n/client";
import { currentBusinessDate, previousBusinessDate } from "../lib/fleet-activity-report/fleet-activity-report-date";
import { formatReportDay, formatReportWindow } from "../lib/fleet-activity-report/fleet-activity-report-formatters";
import type { VehicleTrackRange } from "../lib/vehicle-track/vehicle-track-range";
import { PeriodPopover } from "./period-popover";

export function ReportPeriod({ date, range, now, timezone, pending, onDate, methodology }: Readonly<{
  date: string; range: VehicleTrackRange; now: string; timezone: string; pending: boolean; onDate: (date: string) => void; methodology?: ReactNode;
}>) {
  const { locale, t } = useI18n();
  const { token } = theme.useToken();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(date);
  const choose = (value: string | null) => { if (value) { setOpen(false); onDate(value); } };
  return <section className="reports-period vehicle-trips__period-bar" data-testid="reports-period-context" aria-label={t("reports.controls.label")}>
    <PeriodPopover open={open} onOpenChange={setOpen} width={520} title={<Flex className="vehicle-trips__section-title" align="center" gap="small"><span className="vehicle-trips__section-icon" aria-hidden style={{ color: token.colorPrimary }}><CalendarOutlined /></span><span>{t("trips.controls.title")}</span></Flex>} className="reports-period-popover" content={
      <div className="vehicle-trips__period-editor">
        <Typography.Text className="vehicle-trips__editor-label" type="secondary">{t("track.controls.quick")}</Typography.Text>
        <div className="vehicle-trips__presets-section"><div className="vehicle-trips__preset-group">
          <span className="vehicle-trips__preset-group-title">{t("trips.presetGroup.calendar")}</span>
          <div className="vehicle-trips__preset-grid vehicle-trips__preset-grid--2col" role="group" aria-label={t("trips.presetGroup.calendar")}>
            {([{ value: currentBusinessDate(new Date(now), timezone), label: t("reports.today") }, { value: previousBusinessDate(new Date(now), timezone), label: t("reports.yesterday") }]).map((option) => <Button key={option.label} className="vehicle-trips__preset-button" size="middle" aria-pressed={date === option.value} color={date === option.value ? "primary" : "default"} variant={date === option.value ? "filled" : "outlined"} disabled={pending} onClick={() => choose(option.value)}>{option.label}</Button>)}
          </div>
        </div></div>
        <Divider className="vehicle-trips__editor-divider" />
        <form className="vehicle-trips__custom-range" onSubmit={(event) => { event.preventDefault(); if (!pending && draft) choose(draft); }}>
          <label style={{ fontWeight: token.fontWeightStrong }} className="vehicle-trips__custom-title" htmlFor="reports-calendar-day">{t("reports.controls.label")}</label>
          <div className="vehicle-trips__range-fields">
            <DatePicker className="vehicle-trips__range-picker" size="large" styles={{ root: { height: token.controlHeightLG }, input: { minHeight: 0 } }} id="reports-calendar-day" aria-label={t("reports.date")} value={draft ? dayjs(draft) : null} format="DD.MM.YYYY" allowClear={false} showNow={false} onChange={(value) => setDraft(value?.format("YYYY-MM-DD") ?? "")} />
            <Typography.Text className="vehicle-trips__range-help" type="secondary">{t("reports.calendarHelp")} · {timezone}</Typography.Text>
            <Button className="vehicle-trips__show-period" htmlType="submit" size="large" type="primary" icon={<CalendarOutlined aria-hidden />} disabled={!draft || pending}>{t("reports.show")}</Button>
          </div>
        </form>
      </div>
    }>
      <Button size="large" className="reports-period-trigger vehicle-trips__period-trigger" icon={<CalendarOutlined />} disabled={pending} aria-expanded={open}>
        <span className="reports-period-trigger__text"><strong>{formatReportDay(date, locale, timezone)}</strong><span className="reports-muted">{formatReportWindow(range.from, range.to, locale, timezone)} · {timezone}</span></span><DownOutlined />
      </Button>
    </PeriodPopover>
    {methodology}
  </section>;
}

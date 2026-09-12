"use client";

import { useRef, useState, type FormEvent } from "react";
import { CalendarOutlined, DownOutlined } from "@ant-design/icons";
import { Alert, Button, Flex, Input, Typography } from "antd";
import { useI18n } from "../i18n/client";
import { formatDateTime } from "../i18n/formatting";
import { positionHistoryCheckpointCivil, positionHistoryCheckpointDraft } from "../lib/position-history-checkpoint";
import { absoluteToKyivLocal, kyivLocalToAbsolute } from "../lib/vehicle-track/vehicle-track-custom-range";
import { PeriodPopover } from "./period-popover";

type Props = Readonly<{ anchor: string | null; formAction: string; headingId?: string }>;

export function PositionHistoryCheckpointControl({ anchor, formAction, headingId = "history-context-title" }: Props) {
  const { locale, t } = useI18n();
  const initialCheckpointDraft = positionHistoryCheckpointDraft(anchor === null ? null : absoluteToKyivLocal(anchor));
  const [checkpointDate, setCheckpointDate] = useState(initialCheckpointDraft.date);
  const [checkpointTime, setCheckpointTime] = useState(initialCheckpointDraft.time);
  const [anchorInputError, setAnchorInputError] = useState(false);
  const [checkpointOpen, setCheckpointOpen] = useState(false);
  const anchorQueryInput = useRef<HTMLInputElement>(null);
  const checkpointTrigger = useRef<HTMLButtonElement>(null);
  const instant = (value: string) => formatDateTime(locale, value) ?? t("common.notAvailable");

  function recalculate(event: FormEvent<HTMLFormElement>): void {
    const civil = positionHistoryCheckpointCivil({ date: checkpointDate, time: checkpointTime });
    const converted = civil === null ? { instant: null, error: "INVALID" as const } : kyivLocalToAbsolute(civil);
    if (converted.error || converted.instant === null) { event.preventDefault(); setAnchorInputError(true); return; }
    setAnchorInputError(false);
    if (anchorQueryInput.current) anchorQueryInput.current.value = converted.instant;
  }

  function closeCheckpoint(): void {
    setCheckpointOpen(false);
    checkpointTrigger.current?.focus();
  }

  function setCheckpointPopover(open: boolean): void {
    setCheckpointOpen(open);
    if (open) {
      const draft = positionHistoryCheckpointDraft(anchor === null ? null : absoluteToKyivLocal(anchor));
      setCheckpointDate(draft.date);
      setCheckpointTime(draft.time);
      setAnchorInputError(false);
    }
  }

  return <div className="history-checkpoint-control">
    <PeriodPopover open={checkpointOpen} onOpenChange={setCheckpointPopover} width={360} title={t("history.overview.checkpoint.title")} className="history-checkpoint-popover" content={
      <form id="history-checkpoint-editor" className="history-checkpoint-editor" action={formAction} method="get" onSubmit={recalculate} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); closeCheckpoint(); } }}>
        <div className="history-checkpoint-fields">
          <label htmlFor="history-checkpoint-date">{t("history.overview.checkpoint.date")}</label>
          <Input id="history-checkpoint-date" value={checkpointDate} onChange={(event) => { setCheckpointDate(event.target.value); setAnchorInputError(false); }} placeholder="DD.MM.YYYY" inputMode="numeric" maxLength={10} autoComplete="off" aria-describedby="history-checkpoint-timezone" aria-invalid={anchorInputError || undefined} />
          <label htmlFor="history-checkpoint-time">{t("history.overview.checkpoint.time")}</label>
          <Input id="history-checkpoint-time" value={checkpointTime} onChange={(event) => { setCheckpointTime(event.target.value); setAnchorInputError(false); }} placeholder="HH:mm" inputMode="numeric" maxLength={5} autoComplete="off" aria-describedby="history-checkpoint-timezone" aria-invalid={anchorInputError || undefined} />
        </div>
        <input ref={anchorQueryInput} type="hidden" name="to" defaultValue={anchor ?? ""} />
        <Typography.Text id="history-checkpoint-timezone" type="secondary">{t("track.controls.timezone")}</Typography.Text>
        {anchorInputError && <Alert type="error" showIcon title={t("history.anchor.invalidTitle")} description={t("history.overview.checkpoint.invalidText")} />}
        <Flex wrap gap="small" justify="end"><Button onClick={closeCheckpoint}>{t("common.cancel")}</Button><Button type="primary" htmlType="submit">{t("history.overview.checkpoint.apply")}</Button></Flex>
      </form>
    }>
      <Button ref={checkpointTrigger} size="large" className="history-checkpoint-trigger" icon={<CalendarOutlined aria-hidden />} aria-labelledby={headingId + " history-checkpoint-summary"} aria-expanded={checkpointOpen} aria-controls="history-checkpoint-editor"><time id="history-checkpoint-summary" dateTime={anchor ?? undefined}>{anchor === null ? t("common.notAvailable") : instant(anchor)}</time><DownOutlined aria-hidden /></Button>
    </PeriodPopover>
    <Typography.Text type="secondary">{t("track.controls.timezone")}</Typography.Text>
  </div>;
}

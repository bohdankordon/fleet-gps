"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Card, Collapse, Col, Descriptions, Grid, Row, Space, theme } from "antd";
import type { DescriptionsProps } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import Text from "antd/es/typography/Text";
import type { SchedulerStatusResponse } from "@/lib/scheduler/scheduler-contract";
import { formatSchedulerInterval, formatSchedulerTimestamp, schedulerFailureCategoryLabel } from "@/lib/scheduler/scheduler-formatters";
import { parseSchedulerRefreshPayload, schedulerStateLabel } from "@/lib/scheduler/scheduler-ui-model";
import { StableLoadingButton } from "./stable-loading-button";
import { useI18n } from "../i18n/client";

type Props = Readonly<{ initialStatus: SchedulerStatusResponse | null; timezone: string }>;
type Job = SchedulerStatusResponse["fleet"];

export function SchedulerStatus({ initialStatus, timezone }: Props) {
  const { locale, t } = useI18n();
  const screens = Grid.useBreakpoint();
  const [status, setStatus] = useState(initialStatus);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(initialStatus === null);
  const [activeKeys, setActiveKeys] = useState<string[]>(initialStatus ? [] : ["details"]);
  const controller = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setLoading(true);
    setFailed(false);
    try {
      const response = await fetch("/api/system/sync-status", { cache: "no-store", signal: abort.signal });
      if (!response.ok) throw new Error();
      const parsed = parseSchedulerRefreshPayload(await response.json());
      if (!parsed) throw new Error();
      if (!abort.signal.aborted) setStatus(parsed);
    } catch {
      if (!abort.signal.aborted) {
        setFailed(true);
        setActiveKeys(["details"]);
      }
    } finally {
      if (!abort.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => () => controller.current?.abort(), []);

  const refreshAction = <span onClick={(event) => event.stopPropagation()}><StableLoadingButton idleLabel={t("scheduler.refresh")} loadingLabel={t("scheduler.refreshing")} loading={loading} icon={<ReloadOutlined />} showLabel={Boolean(screens.sm)} onClick={() => { void refresh(); }} /></span>;
  const state = status ? schedulerStateLabel(status, locale) : t("scheduler.loadError");
  const badgeStatus = failed || !status ? "error" : status.enabled ? "processing" : "default";
  const label = <Space align="center" size="small" wrap><Text strong>{t("scheduler.title")}</Text><Badge status={badgeStatus} text={state} /></Space>;
  const details = status ? <SchedulerDetails status={status} timezone={timezone} failed={failed} /> : <Alert type="error" showIcon message={t("scheduler.loadError")} />;

  return <Collapse className="scheduler-status" size="small" styles={{ header: { alignItems: "center" }, title: { display: "flex", alignItems: "center" }, icon: { alignSelf: "center" } }} activeKey={activeKeys} onChange={(keys) => setActiveKeys(Array.isArray(keys) ? keys.map(String) : [String(keys)])} items={[{ key: "details", label, extra: refreshAction, children: details }]} />;
}

function SchedulerDetails({ status, timezone, failed }: Readonly<{ status: SchedulerStatusResponse; timezone: string; failed: boolean }>) {
  const { locale, t } = useI18n();
  return <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
    {failed ? <Alert type="error" showIcon message={t("scheduler.loadError")} /> : null}
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={8}><Card className="scheduler-diagnostic-card" size="small" title={t("scheduler.overall")} styles={schedulerCardStyles}><SchedulerDescriptions items={[{ key: "started", label: t("scheduler.started"), children: formatSchedulerTimestamp(status.startedAt, timezone, locale) }, { key: "fleet", label: t("scheduler.fleetInterval"), children: formatSchedulerInterval(status.fleetIntervalSeconds, locale) }, { key: "distance", label: t("scheduler.distanceInterval"), children: formatSchedulerInterval(status.runsIntervalSeconds, locale) }, { key: "generated", label: t("scheduler.generated"), children: formatSchedulerTimestamp(status.generatedAt, timezone, locale) }]} /></Card></Col>
      <JobDetails title={t("scheduler.fleetJob")} job={status.fleet} timezone={timezone} />
      <JobDetails title={t("scheduler.distanceJob")} job={status.runs} timezone={timezone} />
    </Row>
  </Space>;
}

function JobDetails({ title, job, timezone }: Readonly<{ title: string; job: Job; timezone: string }>) {
  const { locale, t } = useI18n();
  const state = job.running ? t("scheduler.running") : t("scheduler.idle");
  return <Col xs={24} lg={8}><Card className="scheduler-diagnostic-card" size="small" title={title} extra={<Badge status={job.consecutiveFailures > 0 ? "warning" : job.running ? "processing" : "default"} text={state} />} styles={schedulerCardStyles}>{job.consecutiveFailures > 0 ? <Alert type="warning" showIcon message={t("scheduler.failuresWarning")} style={{ marginBottom: 16 }} /> : null}<SchedulerDescriptions items={[{ key: "lastAttempt", label: t("scheduler.lastAttempt"), children: formatSchedulerTimestamp(job.lastAttemptAt, timezone, locale) }, { key: "lastSuccess", label: t("scheduler.lastSuccess"), children: formatSchedulerTimestamp(job.lastSuccessAt, timezone, locale) }, { key: "lastFailure", label: t("scheduler.lastFailure"), children: formatSchedulerTimestamp(job.lastFailureAt, timezone, locale) }, { key: "failureCategory", label: t("scheduler.failureCategory"), children: schedulerFailureCategoryLabel(job.lastFailureCategory, locale) }, { key: "consecutive", label: t("scheduler.consecutiveFailures"), children: job.consecutiveFailures }, { key: "success", label: t("scheduler.successfulRuns"), children: job.successfulRuns }, { key: "failed", label: t("scheduler.failedRuns"), children: job.failedRuns }, { key: "skipped", label: t("scheduler.skippedOverlaps"), children: job.skippedOverlaps }]} /></Card></Col>;
}

const schedulerCardStyles = { header: { paddingInline: 16 }, body: { padding: "12px 16px 16px" } } as const;

function SchedulerDescriptions({ items }: Readonly<{ items: NonNullable<DescriptionsProps["items"]> }>) {
  const { token } = theme.useToken();
  return <Descriptions className="scheduler-diagnostic-values" size="small" column={1} colon layout="horizontal" styles={{ label: { color: token.colorTextSecondary, width: "56%" }, content: { color: token.colorText, textAlign: "right", fontVariantNumeric: "tabular-nums" } }} items={items} />;
}

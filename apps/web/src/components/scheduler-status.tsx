"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Card, Col, Collapse, Descriptions, Flex, Row, Space } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import Text from "antd/es/typography/Text";
import type { SchedulerStatusResponse } from "@/lib/scheduler/scheduler-contract";
import { formatSchedulerInterval, formatSchedulerTimestamp, schedulerFailureCategoryLabel } from "@/lib/scheduler/scheduler-formatters";
import { parseSchedulerRefreshPayload, schedulerStateLabel } from "@/lib/scheduler/scheduler-ui-model";
import { useI18n } from "../i18n/client";

type Props = Readonly<{ initialStatus: SchedulerStatusResponse | null; timezone: string }>;
type Job = SchedulerStatusResponse["fleet"];

export function SchedulerStatus({ initialStatus, timezone }: Props) {
  const { locale, t } = useI18n(); const [status, setStatus] = useState(initialStatus); const [loading, setLoading] = useState(false); const [failed, setFailed] = useState(initialStatus === null); const controller = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort; setLoading(true); setFailed(false);
    try { const response = await fetch("/api/system/sync-status", { cache: "no-store", signal: abort.signal }); if (!response.ok) throw new Error(); const parsed = parseSchedulerRefreshPayload(await response.json()); if (!parsed) throw new Error(); if (!abort.signal.aborted) setStatus(parsed); }
    catch { if (!abort.signal.aborted) setFailed(true); }
    finally { if (!abort.signal.aborted) setLoading(false); }
  }, []);
  useEffect(() => () => controller.current?.abort(), []);
  const action = <Button icon={<ReloadOutlined />} loading={loading} onClick={() => { void refresh(); }}>{t("scheduler.refresh")}</Button>;
  if (!status) return <Card size="small"><Flex align="center" justify="space-between" gap="middle" wrap><Space><Text strong>{t("scheduler.title")}</Text><Badge status="error" text={t("scheduler.loadError")} /></Space>{action}</Flex></Card>;
  const details = <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}><Card size="small" title={t("scheduler.overall")}><Descriptions size="small" column={1} items={[{ key: "started", label: t("scheduler.started"), children: formatSchedulerTimestamp(status.startedAt, timezone, locale) }, { key: "fleet", label: t("scheduler.fleetInterval"), children: formatSchedulerInterval(status.fleetIntervalSeconds, locale) }, { key: "distance", label: t("scheduler.distanceInterval"), children: formatSchedulerInterval(status.runsIntervalSeconds, locale) }, { key: "generated", label: t("scheduler.generated"), children: formatSchedulerTimestamp(status.generatedAt, timezone, locale) }]} /></Card></Col>
        <JobCard title={t("scheduler.fleetJob")} job={status.fleet} timezone={timezone} />
        <JobCard title={t("scheduler.distanceJob")} job={status.runs} timezone={timezone} />
      </Row>;
  return <Card size="small"><Space orientation="vertical" size="middle" style={{ width: "100%" }}><Flex align="center" justify="space-between" gap="middle" wrap><Space><Text strong>{t("scheduler.title")}</Text><Badge status={failed ? "error" : status.enabled ? "processing" : "default"} text={schedulerStateLabel(status, locale)} /></Space>{action}</Flex>{failed ? <Alert type="error" showIcon message={t("scheduler.loadError")} /> : null}<Collapse size="small" defaultActiveKey={failed ? ["details"] : []} items={[{ key: "details", label: t("scheduler.eyebrow"), children: details }]} /></Space></Card>;
}

function JobCard({ title, job, timezone }: Readonly<{ title: string; job: Job; timezone: string }>) {
  const { locale, t } = useI18n(); const state = job.running ? t("scheduler.running") : t("scheduler.idle");
  return <Col xs={24} lg={8}><Card size="small" title={title} extra={<Badge status={job.consecutiveFailures > 0 ? "warning" : job.running ? "processing" : "default"} text={state} />}>
    <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
      {job.consecutiveFailures > 0 ? <Alert type="warning" showIcon message={t("scheduler.failuresWarning")} /> : null}
      <Descriptions size="small" column={1} items={[{ key: "lastAttempt", label: t("scheduler.lastAttempt"), children: formatSchedulerTimestamp(job.lastAttemptAt, timezone, locale) }, { key: "lastSuccess", label: t("scheduler.lastSuccess"), children: formatSchedulerTimestamp(job.lastSuccessAt, timezone, locale) }, { key: "lastFailure", label: t("scheduler.lastFailure"), children: formatSchedulerTimestamp(job.lastFailureAt, timezone, locale) }, { key: "failureCategory", label: t("scheduler.failureCategory"), children: schedulerFailureCategoryLabel(job.lastFailureCategory, locale) }, { key: "consecutive", label: t("scheduler.consecutiveFailures"), children: job.consecutiveFailures }, { key: "success", label: t("scheduler.successfulRuns"), children: job.successfulRuns }, { key: "failed", label: t("scheduler.failedRuns"), children: job.failedRuns }, { key: "skipped", label: t("scheduler.skippedOverlaps"), children: job.skippedOverlaps }]} />
    </Space>
  </Card></Col>;
}

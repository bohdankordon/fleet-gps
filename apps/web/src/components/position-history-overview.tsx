"use client";

import type { ReactNode } from "react";
import { Alert, Button, Collapse, Descriptions, Tag, Typography } from "antd";
import { useI18n } from "../i18n/client";
import { formatDateTime, formatNumber, formatUnit } from "../i18n/formatting";
import type { PositionHistoryIngestionStatusResponse } from "../lib/position-history-ingestion-status/position-history-ingestion-status-contract";
import { CompactPageHeading } from "./compact-page-heading";

type Props = Readonly<{
  data: PositionHistoryIngestionStatusResponse | null;
  statusError: "UNAVAILABLE" | null;
  administrationNavigation: ReactNode;
  historyNavigation: ReactNode;
}>;

type ReplaySummary = PositionHistoryIngestionStatusResponse["replay"]["daily"];

const replayStateKeys = {
  NOT_CREATED: "history.replay.state.notCreated",
  PENDING: "history.replay.state.pending",
  RUNNING: "history.replay.state.running",
  COMPLETED: "history.replay.state.completed",
} as const;

const replayStateColors = { NOT_CREATED: "default", PENDING: "blue", RUNNING: "processing", COMPLETED: "green" } as const;

const retentionOutcomeKeys = {
  NOT_OBSERVED_THIS_PROCESS: "history.retentionState.outcome.notObserved",
  SUCCESS: "history.retentionState.outcome.success",
  SKIPPED: "history.retentionState.outcome.skipped",
  FAILED: "history.retentionState.outcome.failed",
} as const;

const retentionSkipKeys = { LOCK_UNAVAILABLE: "history.retentionState.skip.lockUnavailable", ACTIVE_POPULATION: "history.retentionState.skip.activePopulation" } as const;
const failureCategoryKeys = { rate_limit: "history.diagnostics.failure.rateLimit", provider_5xx: "history.diagnostics.failure.provider5xx", network: "history.diagnostics.failure.network", timeout: "history.diagnostics.failure.timeout", contract: "history.diagnostics.failure.contract", storage: "history.diagnostics.failure.storage", provider_blocked: "history.diagnostics.failure.providerBlocked", unknown: "history.diagnostics.failure.unknown" } as const;

export function PositionHistoryOverview({ data, statusError, administrationNavigation, historyNavigation }: Props) {
  const { locale, t } = useI18n();
  const number = (value: number) => formatNumber(locale, value);
  const instant = (value: string | null) => value === null ? t("common.notAvailable") : (formatDateTime(locale, value) ?? t("common.notAvailable"));
  const lag = (value: number | null) => value === null ? t("common.notAvailable") : formatUnit(locale, value, "second");
  const flag = (value: boolean) => <span className="history-fact-value">{t(value ? "common.yes" : "common.no")}</span>;
  const diagnostics = data === null ? [] : [
    ["history.diagnostics.requestRate", data.providerTraffic.requestStartsLastMinute],
    ["history.diagnostics.requestStarts", data.providerTraffic.requestStartsSinceProcessStart],
    ["history.diagnostics.retries", data.providerTraffic.retriesSinceProcessStart],
    ["history.diagnostics.rateLimits", data.providerTraffic.rateLimitResponsesSinceProcessStart],
    ["history.diagnostics.provider5xx", data.providerTraffic.provider5xxSinceProcessStart],
    ["history.diagnostics.network", data.providerTraffic.networkFailuresSinceProcessStart],
    ["history.diagnostics.timeouts", data.providerTraffic.timeoutsSinceProcessStart],
    ["history.diagnostics.contract", data.providerTraffic.contractFailuresSinceProcessStart],
    ["history.diagnostics.storage", data.providerTraffic.storageFailuresSinceProcessStart],
    ["history.diagnostics.providerBlocked", data.providerTraffic.providerBlockedResponsesSinceProcessStart],
    ["history.diagnostics.unknown", data.providerTraffic.unknownFailuresSinceProcessStart],
    ["history.diagnostics.lockContention", data.coordination.historyLockContentionSinceProcessStart],
    ["history.diagnostics.blockedStreams", data.coordination.providerBlockedStreams],
  ] as const;

  return <div className="history-overview">
    <header className="history-overview__heading"><CompactPageHeading title={t("history.title")} subtitle={t("history.overview.description")} /></header>
    {administrationNavigation}
    {historyNavigation}

    {statusError === "UNAVAILABLE" && <Alert className="history-status-unavailable" type="error" showIcon title={t("history.ingestion.unavailableTitle")} description={t("history.ingestion.unavailableText")} action={<Button href="/admin/history">{t("common.retry")}</Button>} />}

    {data && <>
      {data.coordination.durablePopulationActive && <Alert className="history-active-run" type="info" showIcon title={t("history.overview.population.active")} description={t("history.overview.population.activeText")} action={<Button href="/admin/history/population">{t("history.overview.active.open")}</Button>} />}

      <p className="history-horizon-statement"><span>{t("history.overview.asOf", { time: instant(data.generatedAt) })}</span><span aria-hidden>·</span><span>{t("history.overview.boundary", { time: instant(data.cursor.currentSafeBoundary) })}</span></p>

      <div className="history-fact-groups">
        <section className="history-fact-group" aria-labelledby="history-ingestion-title">
          <Typography.Title level={2} id="history-ingestion-title">{t("history.ingestion.title")}</Typography.Title>
          <Typography.Paragraph type="secondary">{t("history.ingestion.help")}</Typography.Paragraph>
          <Descriptions className="history-fact-descriptions" bordered size="small" column={1} colon={false}>
            <Descriptions.Item label={t("history.ingestion.continuous")}>{flag(data.configuration.continuousIngestionEnabled)}</Descriptions.Item>
            <Descriptions.Item label={t("history.ingestion.retention")}>{flag(data.configuration.automaticRetentionEnabled)}</Descriptions.Item>
            <Descriptions.Item label={t("history.ingestion.poller")}>{flag(data.runtime.pollerStarted)}</Descriptions.Item>
            <Descriptions.Item label={t("history.ingestion.cycle")}>{flag(data.runtime.cycleInFlight)}</Descriptions.Item>
            <Descriptions.Item label={t("history.ingestion.cycleStart")}><span className="history-fact-value">{instant(data.runtime.lastCycleStartedAt)}</span></Descriptions.Item>
            <Descriptions.Item label={t("history.ingestion.cycleEnd")}><span className="history-fact-value">{instant(data.runtime.lastCycleCompletedAt)}</span></Descriptions.Item>
            <Descriptions.Item label={t("history.ingestion.processStart")}><span className="history-fact-value">{instant(data.runtime.processStartedAt)}</span></Descriptions.Item>
          </Descriptions>
        </section>

        <section className="history-fact-group" aria-labelledby="history-cursor-title">
          <Typography.Title level={2} id="history-cursor-title">{t("history.cursor.title")}</Typography.Title>
          <Typography.Paragraph type="secondary">{t("history.cursor.help")}</Typography.Paragraph>
          <Descriptions className="history-fact-descriptions" bordered size="small" column={1} colon={false}>
            <Descriptions.Item label={t("history.cursor.mapped")}><span className="history-fact-value">{number(data.cursor.mappedVehicles)}</span></Descriptions.Item>
            <Descriptions.Item label={t("history.cursor.present")}><span className="history-fact-value">{number(data.cursor.cursorCount)}</span></Descriptions.Item>
            <Descriptions.Item label={t("history.cursor.missing")}><span className="history-fact-value">{number(data.cursor.missingCursorCount)}</span></Descriptions.Item>
            <Descriptions.Item label={t("history.cursor.medianLag")}><span className="history-fact-value">{lag(data.cursor.medianLagSeconds)}</span></Descriptions.Item>
            <Descriptions.Item label={t("history.cursor.worstLag")}><span className="history-fact-value">{lag(data.cursor.worstLagSeconds)}</span></Descriptions.Item>
            <Descriptions.Item label={t("history.cursor.oldest")}><span className="history-fact-value">{instant(data.cursor.oldestConfirmedThrough)}</span></Descriptions.Item>
            <Descriptions.Item label={t("history.cursor.boundary")}><span className="history-fact-value">{instant(data.cursor.currentSafeBoundary)}</span></Descriptions.Item>
          </Descriptions>
        </section>
      </div>

      <div className="history-fact-groups">
        <section className="history-fact-group" aria-labelledby="history-recent-tail-title">
          <Typography.Title level={2} id="history-recent-tail-title">{t("history.recentTail.title")}</Typography.Title>
          <Typography.Paragraph type="secondary">{t("history.recentTail.help")}</Typography.Paragraph>
          <Descriptions className="history-fact-descriptions" bordered size="small" column={1} colon={false}>
            <Descriptions.Item label={t("history.recentTail.lastSuccess")}><span className="history-fact-value">{instant(data.recentTail.lastSuccessAt)}</span></Descriptions.Item>
            <Descriptions.Item label={t("history.recentTail.successes")}><span className="history-fact-value">{number(data.recentTail.successesSinceProcessStart)}</span></Descriptions.Item>
            <Descriptions.Item label={t("history.recentTail.failures")}><span className="history-fact-value">{number(data.recentTail.failuresSinceProcessStart)}</span></Descriptions.Item>
          </Descriptions>
        </section>

        <section className="history-fact-group" aria-labelledby="history-retention-state-title">
          <Typography.Title level={2} id="history-retention-state-title">{t("history.retention.title")}</Typography.Title>
          <Typography.Paragraph type="secondary">{t("history.retentionState.help")}</Typography.Paragraph>
          <Descriptions className="history-fact-descriptions" bordered size="small" column={1} colon={false}>
            <Descriptions.Item label={t("history.retentionState.enabled")}>{flag(data.retention.enabled)}</Descriptions.Item>
            <Descriptions.Item label={t("history.retentionState.running")}>{flag(data.retention.running)}</Descriptions.Item>
            <Descriptions.Item label={t("history.retentionState.lastAttempt")}><span className="history-fact-value">{instant(data.retention.lastAttemptAt)}</span></Descriptions.Item>
            <Descriptions.Item label={t("history.retentionState.lastCompleted")}><span className="history-fact-value">{instant(data.retention.lastCompletedAt)}</span></Descriptions.Item>
            <Descriptions.Item label={t("history.retentionState.outcome")}><span className="history-fact-value">{t(retentionOutcomeKeys[data.retention.lastOutcome])}</span></Descriptions.Item>
            {data.retention.lastSkipCategory !== null && <Descriptions.Item label={t("history.retentionState.skipCategory")}><span className="history-fact-value">{t(retentionSkipKeys[data.retention.lastSkipCategory])}</span></Descriptions.Item>}
            <Descriptions.Item label={t("history.retentionState.nextExecution")}><span className="history-fact-value">{instant(data.retention.nextScheduledExecutionAt)}</span></Descriptions.Item>
            <Descriptions.Item label={t("history.retentionState.floor")}><span className="history-fact-value">{instant(data.retention.currentRetentionPolicyFloor)}</span></Descriptions.Item>
            <Descriptions.Item label={t("history.retentionState.behind")}><span className="history-fact-value">{number(data.retention.cursorsBehindRetentionFloor)}</span></Descriptions.Item>
            <Descriptions.Item label={t("history.retentionState.atOrBeyond")}><span className="history-fact-value">{number(data.retention.cursorsAtOrBeyondRetentionFloor)}</span></Descriptions.Item>
            <Descriptions.Item label={t("history.retentionState.aligned")}>{flag(data.retention.retentionFloorAligned)}</Descriptions.Item>
          </Descriptions>
        </section>
      </div>

      <section className="history-replay" aria-labelledby="history-replay-title">
        <div className="history-replay__heading"><Typography.Title level={2} id="history-replay-title">{t("history.replay.title")}</Typography.Title><Typography.Text type="secondary">{t("history.replay.help")}</Typography.Text></div>
        <div className="history-replay__grid">
          <ReplayFacts summary={data.replay.daily} titleKey="history.replay.daily" />
          <ReplayFacts summary={data.replay.rolling} titleKey="history.replay.rolling" />
        </div>
      </section>

      <Collapse className="history-methodology" ghost items={[{
        key: "diagnostics",
        label: <span className="history-diagnostics__label">{t("history.diagnostics.title")} · {t("history.diagnostics.scope")}</span>,
        children: <>
          <Alert type="info" showIcon title={t("history.diagnostics.scope")} description={t("history.diagnostics.scopeText")} />
          <Descriptions className="history-fact-descriptions history-diagnostics" bordered size="small" column={2} colon={false}>
            {diagnostics.map(([key, value]) => <Descriptions.Item key={key} label={t(key)}><span className="history-fact-value">{number(value)}</span></Descriptions.Item>)}
            <Descriptions.Item label={t("history.diagnostics.lastFailureCategory")}><span className="history-fact-value">{data.providerTraffic.lastFailureCategory === null ? t("common.notAvailable") : t(failureCategoryKeys[data.providerTraffic.lastFailureCategory])}</span></Descriptions.Item>
            <Descriptions.Item label={t("history.diagnostics.lastFailureAt")}><span className="history-fact-value">{instant(data.providerTraffic.lastFailureAt)}</span></Descriptions.Item>
            <Descriptions.Item label={t("history.diagnostics.cyclesCompleted")}><span className="history-fact-value">{number(data.runtime.cyclesCompletedSinceProcessStart)}</span></Descriptions.Item>
            <Descriptions.Item label={t("history.diagnostics.lastCycleDuration")}><span className="history-fact-value">{data.runtime.lastCycleDurationMs === null ? t("common.notAvailable") : `${number(data.runtime.lastCycleDurationMs)} ${t("history.diagnostics.ms")}`}</span></Descriptions.Item>
            <Descriptions.Item label={t("history.diagnostics.maxCycleDuration")}><span className="history-fact-value">{data.runtime.maxCycleDurationMsSinceProcessStart === null ? t("common.notAvailable") : `${number(data.runtime.maxCycleDurationMsSinceProcessStart)} ${t("history.diagnostics.ms")}`}</span></Descriptions.Item>
            <Descriptions.Item label={t("history.diagnostics.slowCycles")}><span className="history-fact-value">{number(data.runtime.cyclesExceedingPollIntervalSinceProcessStart)}</span></Descriptions.Item>
          </Descriptions>
        </>,
      }, {
        key: "definitions",
        label: t("history.overview.definitions.title"),
        children: <ul><li>{t("history.overview.definitions.durable")}</li><li>{t("history.overview.definitions.process")}</li><li>{t("history.overview.definitions.boundary")}</li><li>{t("history.overview.definitions.debt")}</li></ul>,
      }]} />
    </>}
  </div>;
}

function ReplayFacts({ summary, titleKey }: Readonly<{ summary: ReplaySummary; titleKey: "history.replay.daily" | "history.replay.rolling" }>) {
  const { locale, t } = useI18n();
  const number = (value: number) => formatNumber(locale, value);
  const instant = (value: string | null) => value === null ? t("common.notAvailable") : (formatDateTime(locale, value) ?? t("common.notAvailable"));
  const oldestIncomplete = summary.activeGenerationAnchor !== null;
  const displayedPercent = oldestIncomplete ? summary.activeProgressPercent : summary.progressPercent;
  return <article className="history-replay__card" aria-label={t(titleKey)}>
    <div className="history-replay__card-heading">
      <Typography.Title level={3}>{t(titleKey)}</Typography.Title>
      <Tag color={replayStateColors[summary.activeState ?? summary.state]}>{t(replayStateKeys[summary.activeState ?? summary.state])}</Tag>
    </div>
    {displayedPercent !== null && <p className="history-replay__progress"><span className="history-meter" aria-hidden><span style={{ width: `${displayedPercent}%` }} /></span><strong className="history-numeric">{number(displayedPercent)}%</strong></p>}
    <Descriptions className="history-fact-descriptions" bordered size="small" column={1} colon={false}>
      {oldestIncomplete && <Descriptions.Item label={t("history.replay.oldestIncompleteGeneration")}><span className="history-fact-value">{instant(summary.activeGenerationAnchor)}</span></Descriptions.Item>}
      <Descriptions.Item label={t("history.replay.completed")}><span className="history-fact-value">{number(oldestIncomplete ? summary.activeCheckpointsCompleted : summary.checkpointsCompleted)} / {number(oldestIncomplete ? summary.activeCheckpointsTotal : summary.checkpointsTotal)}</span></Descriptions.Item>
      <Descriptions.Item label={t("history.replay.remaining")}><span className="history-fact-value">{number(oldestIncomplete ? summary.activeCheckpointsRemaining : summary.checkpointsRemaining)}</span></Descriptions.Item>
      {oldestIncomplete && <Descriptions.Item label={t("history.replay.estimatedWindows")}><span className="history-fact-value">{number(summary.estimatedRemainingWindows)}</span></Descriptions.Item>}
      <Descriptions.Item label={t("history.replay.latestGeneration")}><span className="history-fact-value">{instant(summary.generationAnchor)}{oldestIncomplete && summary.activeGenerationAnchor !== summary.generationAnchor ? ` · ${t("history.replay.newer")}` : ""}</span></Descriptions.Item>
      <Descriptions.Item label={t("history.replay.range")}><span className="history-fact-value history-range-inline"><time dateTime={summary.rangeFrom ?? undefined}>{instant(summary.rangeFrom)}</time><span aria-hidden>→</span><time dateTime={summary.rangeTo ?? undefined}>{instant(summary.rangeTo)}</time></span></Descriptions.Item>
      <Descriptions.Item label={t("history.replay.current")}><span className="history-fact-value">{t(summary.isCurrent ? "common.yes" : "common.no")}</span></Descriptions.Item>
      <Descriptions.Item label={t("history.replay.incomplete")}><span className="history-fact-value">{number(summary.incompleteGenerations)}</span></Descriptions.Item>
      <Descriptions.Item label={t("history.replay.newerIncompleteCount")}><span className="history-fact-value">{number(summary.queuedIncompleteGenerations)}</span></Descriptions.Item>
      <Descriptions.Item label={t("history.replay.overdue")}><span className="history-fact-value">{number(summary.overdueIncompleteGenerations)}</span></Descriptions.Item>
      <Descriptions.Item label={t("history.replay.debt")}><span className="history-fact-value">{t(summary.hasReplayDebt ? "common.yes" : "common.no")}</span></Descriptions.Item>
      {summary.oldestOverdueGenerationAnchor !== null && <Descriptions.Item label={t("history.replay.oldestOverdue")}><span className="history-fact-value">{instant(summary.oldestOverdueGenerationAnchor)}</span></Descriptions.Item>}
    </Descriptions>
    {oldestIncomplete && <Typography.Text type="secondary">{t("history.replay.estimateHelp")}</Typography.Text>}
    {summary.hasReplayDebt
      ? <Alert type="warning" showIcon title={t("history.replay.debtTitle")} description={t("history.replay.debtText", { count: number(summary.overdueIncompleteGenerations) })} />
      : summary.state === "COMPLETED" && summary.isCurrent && <Alert type="success" showIcon title={t("history.replay.currentTitle")} description={t("history.replay.currentText")} />}
  </article>;
}

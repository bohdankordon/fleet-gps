"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Checkbox, Collapse, Descriptions, Empty, Grid, Radio, Segmented, Space, Table, Tag, Typography, type TableColumnsType } from "antd";
import { useI18n } from "../i18n/client";
import { formatDateTime, formatNumber, formatUnit } from "../i18n/formatting";
import { readActiveDurableRun, readRecentDurableRuns, submitDurableRun } from "../lib/position-history-durable-runs/position-history-durable-run-browser";
import { durableRunBudgets, type DurableRunBudget, type SafeDurableRun } from "../lib/position-history-durable-runs/position-history-durable-run-contract";
import { shouldShowDurableCreateControls, startDurableRunPolling } from "../lib/position-history-durable-runs/position-history-durable-run-polling";
import type { PositionHistoryPopulationResult } from "../lib/position-history-population/position-history-population-contract";
import { executeAndRefreshPositionHistory } from "../lib/position-history-population/position-history-population-interaction";
import type { PositionHistoryStatusResponse } from "../lib/position-history-status/position-history-status-contract";
import { CompactPageHeading } from "./compact-page-heading";
import { PositionHistoryCheckpointControl } from "./position-history-checkpoint-control";
import { durableRunInitiatorLabel, durableRunPresentation } from "./position-history-durable-runs";
import { AlertDialog } from "./ui";

type PopulationMode = "SHORT" | "DURABLE";
type ShortBudget = 6 | 12 | 24;

type Props = Readonly<{
  anchor: string | null;
  data: PositionHistoryStatusResponse | null;
  statusError: "INVALID_ANCHOR" | "UNAVAILABLE" | null;
  canPopulate: boolean;
  initialActive: SafeDurableRun | null;
  initialRecent: readonly SafeDurableRun[];
  initialActiveUnavailable: boolean;
  initialRecentUnavailable: boolean;
  administrationNavigation: ReactNode;
  historyNavigation: ReactNode;
}>;

const activeSignature = (run: SafeDurableRun | null): string => run === null ? "none" : `${run.id}:${run.status}:${run.committedWindows}`;
const failureCategoryKeys = { EXECUTION: "history.population.failure.execution", WORKER: "history.population.failure.worker", UNKNOWN: "history.population.failure.unknown" } as const;

export function durableRunFailureLabel(category: SafeDurableRun["failureCategory"], t: ReturnType<typeof useI18n>["t"]): string | null {
  if (category === null) return null;
  return t(failureCategoryKeys[category]);
}

function RunStatus({ run }: Readonly<{ run: SafeDurableRun }>) {
  const { locale, t } = useI18n();
  const failure = durableRunFailureLabel(run.failureCategory, t);
  return <Space orientation="vertical" size={2}><Tag>{durableRunPresentation(run, locale).title}</Tag>{failure && <Typography.Text type="secondary">{t("history.population.failureCategory", { category: failure })}</Typography.Text>}</Space>;
}

function TimeValue({ value }: Readonly<{ value: string | null }>) {
  const { locale, t } = useI18n();
  if (value === null) return <>{t("common.notAvailable")}</>;
  return <time dateTime={value}>{formatDateTime(locale, value) ?? t("common.notAvailable")}</time>;
}

export function ActiveRun({ run, unavailable }: Readonly<{ run: SafeDurableRun; unavailable: boolean }>) {
  const { locale, t } = useI18n();
  const presentation = durableRunPresentation(run, locale);
  return <section className="history-population-active" aria-labelledby="history-population-active-title">
    <div className="history-population-section-heading">
      <Typography.Title level={2} id="history-population-active-title">{t("history.population.activeTitle")}</Typography.Title>
      <Tag>{presentation.title}</Tag>
    </div>
    {unavailable && <Alert type="warning" showIcon title={t("history.population.activeStaleTitle")} description={t("history.population.activeStaleText")} action={<Button onClick={() => window.location.reload()}>{t("common.retry")}</Button>} />}
    <Descriptions className="history-population-active__facts" bordered size="small" column={{ xs: 1, sm: 2, lg: 3 }} colon={false}>
      <Descriptions.Item label={t("history.population.status")}>{presentation.title}</Descriptions.Item>
      <Descriptions.Item label={t("history.population.initiator")}>{durableRunInitiatorLabel(run.initiatorType, locale)}</Descriptions.Item>
      <Descriptions.Item label={t("history.overview.checkpoint.title")}><TimeValue value={run.to} /></Descriptions.Item>
      <Descriptions.Item label={t("history.population.committedBudget")}>{presentation.progress}</Descriptions.Item>
      <Descriptions.Item label={t("history.population.providerDisabled")}>{t(run.excludeProviderDisabled ? "history.population.excluded" : "history.population.included")}</Descriptions.Item>
      <Descriptions.Item label={t("history.population.created")}><TimeValue value={run.createdAt} /></Descriptions.Item>
      {run.startedAt && <Descriptions.Item label={t("history.population.started")}><TimeValue value={run.startedAt} /></Descriptions.Item>}
    </Descriptions>
  </section>;
}

export function RecentRuns({ runs, unavailable }: Readonly<{ runs: readonly SafeDurableRun[]; unavailable: boolean }>) {
  const { locale, t } = useI18n();
  const columns: TableColumnsType<SafeDurableRun> = [
    { title: t("history.population.status"), key: "status", render: (_, run) => <RunStatus run={run} /> },
    { title: t("history.population.initiator"), dataIndex: "initiatorType", key: "initiator", render: (value: SafeDurableRun["initiatorType"]) => durableRunInitiatorLabel(value, locale) },
    { title: t("history.population.created"), dataIndex: "createdAt", key: "created", render: (value: string) => <TimeValue value={value} /> },
    { title: t("history.overview.checkpoint.title"), dataIndex: "to", key: "checkpoint", render: (value: string) => <TimeValue value={value} /> },
    { title: t("history.population.committedBudget"), key: "progress", render: (_, run) => durableRunPresentation(run, locale).progress },
    { title: t("history.population.finished"), dataIndex: "finishedAt", key: "finished", render: (value: string | null) => <TimeValue value={value} /> },
  ];

  return <section className="history-population-recent" aria-labelledby="history-population-recent-title" aria-busy="false">
    <div className="history-population-section-heading"><Typography.Title level={2} id="history-population-recent-title">{t("history.population.recentRuns")}</Typography.Title></div>
    {unavailable && <Alert className="history-population-inline-alert" type="warning" showIcon title={runs.length > 0 ? t("history.population.recentStaleTitle") : t("history.population.recentUnavailableTitle")} description={runs.length > 0 ? t("history.population.recentStaleText") : t("history.population.recentUnavailableText")} action={<Button onClick={() => window.location.reload()}>{t("common.retry")}</Button>} />}
    {runs.length === 0
      ? (!unavailable && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("history.population.noRecentRuns")} />)
      : <>
          <Table<SafeDurableRun> className="history-population-recent__table" columns={columns} dataSource={[...runs]} rowKey="id" size="small" pagination={false} tableLayout="fixed" />
          <div className="history-population-recent__records">{runs.map((run) => <article key={run.id}>
            <div className="history-population-record__heading"><RunStatus run={run} /><Typography.Text>{durableRunInitiatorLabel(run.initiatorType, locale)}</Typography.Text></div>
            <dl>
              <div><dt>{t("history.population.created")}</dt><dd><TimeValue value={run.createdAt} /></dd></div>
              <div><dt>{t("history.overview.checkpoint.title")}</dt><dd><TimeValue value={run.to} /></dd></div>
              <div><dt>{t("history.population.committedBudget")}</dt><dd>{durableRunPresentation(run, locale).progress}</dd></div>
              <div><dt>{t("history.population.finished")}</dt><dd><TimeValue value={run.finishedAt} /></dd></div>
            </dl>
          </article>)}</div>
        </>}
  </section>;
}

export function LastShortResult({ result }: Readonly<{ result: PositionHistoryPopulationResult }>) {
  const { locale, t } = useI18n();
  const number = (value: number) => formatNumber(locale, value);
  const details = [
    ["history.population.requests", result.providerRequests],
    ["history.population.rows", result.rowsReceived],
    ["history.population.candidates", result.candidates],
    ["history.population.inserted", result.inserted],
    ["history.population.duplicates", result.duplicates],
    ["history.population.invalid", result.invalid],
    ["history.population.retries", result.retries],
    ["history.population.rateLimits", result.rateLimits],
    ["history.population.disabledSkipped", result.providerDisabledExcluded],
    ["history.population.slices", result.slicesVisited],
    ["history.population.slicesTotal", result.slicesTotal],
    ["history.population.slicesAlreadyComplete", result.slicesAlreadyComplete],
  ] as const;
  return <section className="history-population-short-result" aria-labelledby="history-population-short-result-title">
    <Typography.Title level={2} id="history-population-short-result-title">{t("history.population.lastShortResult")}</Typography.Title>
    <Typography.Paragraph type="secondary">{t("history.population.visitOnly")}</Typography.Paragraph>
    <Descriptions className="history-population-short-result__summary" bordered size="small" column={{ xs: 1, sm: 2, lg: 4 }} colon={false}>
      <Descriptions.Item label={t("history.population.committedBudget")}>{number(result.committedWindows)} / {number(result.maxWindows)}</Descriptions.Item>
      <Descriptions.Item label={t("history.population.horizonComplete")}>{t(result.horizonComplete ? "common.yes" : "common.no")}</Descriptions.Item>
      <Descriptions.Item label={t("history.population.budgetExhausted")}>{t(result.stoppedByBudget ? "common.yes" : "common.no")}</Descriptions.Item>
      <Descriptions.Item label={t("history.population.providerDisabled")}>{t(result.excludeProviderDisabled ? "history.population.excluded" : "history.population.included")}</Descriptions.Item>
    </Descriptions>
    <Collapse ghost items={[{ key: "details", label: t("history.population.resultDetails"), children: <dl className="history-population-result-details">{details.map(([key, value]) => <div key={key}><dt>{t(key)}</dt><dd>{number(value)}</dd></div>)}</dl> }]} />
  </section>;
}

export function PositionHistoryPopulationWorkspace({ anchor, data, statusError, canPopulate, initialActive, initialRecent, initialActiveUnavailable, initialRecentUnavailable, administrationNavigation, historyNavigation }: Props) {
  const router = useRouter();
  const screens = Grid.useBreakpoint();
  const { locale, t } = useI18n();
  const [active, setActive] = useState(initialActive);
  const [recent, setRecent] = useState(initialRecent);
  const [activeUnavailable, setActiveUnavailable] = useState(initialActiveUnavailable);
  const [recentUnavailable, setRecentUnavailable] = useState(initialRecentUnavailable);
  const [mode, setMode] = useState<PopulationMode>("SHORT");
  const [shortBudget, setShortBudget] = useState<ShortBudget>(24);
  const [durableBudget, setDurableBudget] = useState<DurableRunBudget>(1000);
  const [excludeProviderDisabled, setExcludeProviderDisabled] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<"SHORT_CONFLICT" | "SHORT_FAILED" | "DURABLE_CONFLICT" | "DURABLE_FAILED" | null>(null);
  const [created, setCreated] = useState(false);
  const [shortResult, setShortResult] = useState<PositionHistoryPopulationResult | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState("");
  const submitting = useRef(false);
  const recentUnavailableRef = useRef(initialRecentUnavailable);
  const activeEpochRef = useRef(0);
  const announcedActiveRef = useRef(activeSignature(initialActive));
  const displayedAnchor = anchor === null ? t("common.notAvailable") : (formatDateTime(locale, anchor) ?? t("common.notAvailable"));
  const showComposer = anchor !== null && shouldShowDurableCreateControls(active, activeUnavailable, canPopulate);

  useEffect(() => {
    if (anchor === null) return;
    return startDurableRunPolling({
      anchor,
      initialActive,
      loadActive: readActiveDurableRun,
      loadRecent: readRecentDurableRuns,
      onActive: (value) => {
        const signature = activeSignature(value);
        if (signature !== announcedActiveRef.current) {
          setLiveAnnouncement(value === null ? t("history.population.activeEnded") : t("history.population.activeChanged", { status: durableRunPresentation(value, locale).title, progress: durableRunPresentation(value, locale).progress }));
          announcedActiveRef.current = signature;
        }
        setActive(value);
        setActiveUnavailable(false);
      },
      onRecent: (value) => {
        setRecent(value);
        setRecentUnavailable(false);
        recentUnavailableRef.current = false;
      },
      onActiveError: () => setActiveUnavailable(true),
      onRecentError: () => { setRecentUnavailable(true); recentUnavailableRef.current = true; },
      isRecentUnavailable: () => recentUnavailableRef.current,
      getActiveEpoch: () => activeEpochRef.current,
      refreshHorizon: () => router.refresh(),
    });
  }, [anchor, initialActive, locale, router, t]);

  async function executeShort(): Promise<void> {
    if (anchor === null || submitting.current) return;
    submitting.current = true;
    setPending(true);
    setFailure(null);
    setCreated(false);
    setShortResult(null);
    try {
      const outcome = await executeAndRefreshPositionHistory({ to: anchor, maxWindows: shortBudget, excludeProviderDisabled });
      if (outcome.kind === "SUCCESS") setShortResult(outcome.result);
      else setFailure(outcome.kind === "ALREADY_RUNNING" ? "SHORT_CONFLICT" : "SHORT_FAILED");
    } finally {
      router.refresh();
      submitting.current = false;
      setPending(false);
      setConfirming(false);
    }
  }

  async function createDurable(): Promise<void> {
    if (anchor === null || submitting.current) return;
    submitting.current = true;
    setPending(true);
    setFailure(null);
    setCreated(false);
    activeEpochRef.current += 1;
    try {
      const outcome = await submitDurableRun({ to: anchor, windowBudget: durableBudget, excludeProviderDisabled });
      activeEpochRef.current += 1;
      if (outcome.kind === "CREATED") {
        setActive(outcome.run);
        setActiveUnavailable(false);
        setCreated(true);
        announcedActiveRef.current = activeSignature(outcome.run);
      } else {
        setFailure(outcome.kind === "ALREADY_RUNNING" ? "DURABLE_CONFLICT" : "DURABLE_FAILED");
        if (outcome.activeUnavailable) {
          setActiveUnavailable(true);
          if (outcome.active) setActive(outcome.active);
        } else {
          setActiveUnavailable(false);
          setActive(outcome.active);
        }
      }
    } finally {
      submitting.current = false;
      setPending(false);
      setConfirming(false);
      router.refresh();
    }
  }

  const selectedBudget = mode === "SHORT" ? shortBudget : durableBudget;
  const confirmationDescription = mode === "SHORT" ? t("history.population.shortConfirmation") : t("history.population.durableConfirmation");

  return <div className="history-population-workspace">
    <header className="history-overview__heading"><CompactPageHeading title={t("history.title")} subtitle={t("history.population.workspaceDescription")} /></header>
    {administrationNavigation}
    {historyNavigation}

    <section className="history-population-context" aria-labelledby="history-population-context-title">
      <div className="history-population-context__copy">
        <Typography.Title level={2} id="history-population-context-title">{t("history.overview.checkpoint.title")}</Typography.Title>
        <p><strong>{t("history.population.checkpoint", { anchor: displayedAnchor })}</strong>{data && <> · {t("history.population.horizonSummary", { days: formatUnit(locale, data.policyDays, "day"), ranges: formatNumber(locale, data.slices.total) })}</>}</p>
        <Typography.Text type="secondary">{t("history.population.planningOnly")}</Typography.Text>
      </div>
      <PositionHistoryCheckpointControl anchor={anchor} formAction="/admin/history/population" headingId="history-population-context-title" />
    </section>

    {statusError === "INVALID_ANCHOR" && <Alert type="error" showIcon title={t("history.anchor.invalidTitle")} description={t("history.anchor.invalidText")} />}
    {statusError === "UNAVAILABLE" && <Alert type="warning" showIcon title={t("history.unavailableTitle")} description={t("history.unavailableText")} action={<Button onClick={() => window.location.reload()}>{t("common.retry")}</Button>} />}

    {active && <ActiveRun run={active} unavailable={activeUnavailable} />}
    {!active && activeUnavailable && <Alert className="history-population-active-unavailable" type="warning" showIcon title={t("history.population.activeUnavailableTitle")} description={t("history.population.activeUnavailableText")} action={<Button onClick={() => window.location.reload()}>{t("common.retry")}</Button>} />}
    <div className="sr-only" aria-live="polite" aria-atomic="true">{liveAnnouncement}</div>

    {failure === "SHORT_CONFLICT" && <Alert type="warning" showIcon title={t("history.population.shortConflictTitle")} description={t("history.population.shortConflictText")} />}
    {failure === "SHORT_FAILED" && <Alert type="error" showIcon title={t("history.population.shortFailedTitle")} description={t("history.population.shortFailedText")} />}
    {failure === "DURABLE_CONFLICT" && <Alert type="warning" showIcon title={t("history.population.durableConflictTitle")} description={t("history.population.durableConflictText")} />}
    {failure === "DURABLE_FAILED" && <Alert type="error" showIcon title={t("history.population.durableFailedTitle")} description={t("history.population.durableFailedText")} />}
    {created && <Alert type="success" showIcon title={t("history.population.durableCreatedTitle")} description={t("history.population.durableCreatedText")} />}

    {anchor && <div className={`history-population-main${showComposer ? "" : " history-population-main--without-composer"}`}>
      {showComposer && <section className="history-population-composer" aria-labelledby="history-population-composer-title" aria-busy={pending}>
        <Typography.Title level={2} id="history-population-composer-title">{t("history.population.startTitle")}</Typography.Title>
        <div className="history-population-field">
          <Typography.Text id="history-population-mode-label" strong>{t("history.population.mode")}</Typography.Text>
          <Segmented vertical={screens.sm === false} aria-labelledby="history-population-mode-label" value={mode} disabled={pending} onChange={(value) => { setMode(value as PopulationMode); setFailure(null); setCreated(false); }} options={[{ label: t("history.population.shortMode"), value: "SHORT" }, { label: t("history.population.durableMode"), value: "DURABLE" }]} />
        </div>
        <div className="history-population-field">
          <Typography.Text id="history-population-budget-label" strong>{t(mode === "SHORT" ? "history.population.maxWindows" : "history.population.windowBudget")}</Typography.Text>
          {mode === "SHORT"
            ? <Radio.Group aria-labelledby="history-population-budget-label" optionType="button" buttonStyle="solid" value={shortBudget} disabled={pending} onChange={(event) => setShortBudget(event.target.value as ShortBudget)} options={[6, 12, 24].map((value) => ({ label: formatNumber(locale, value), value }))} />
            : <Radio.Group aria-labelledby="history-population-budget-label" optionType="button" buttonStyle="solid" value={durableBudget} disabled={pending} onChange={(event) => setDurableBudget(event.target.value as DurableRunBudget)} options={durableRunBudgets.map((value) => ({ label: formatNumber(locale, value), value }))} />}
        </div>
        <Checkbox checked={excludeProviderDisabled} disabled={pending} onChange={(event) => setExcludeProviderDisabled(event.target.checked)}>{t("history.population.skipDisabled")}</Checkbox>
        <p className="history-population-composer__checkpoint"><Typography.Text type="secondary">{t("history.population.checkpoint", { anchor: displayedAnchor })}</Typography.Text></p>
        <Typography.Paragraph type="secondary">{t(mode === "SHORT" ? "history.population.shortHelp" : "history.population.durableHelp")}</Typography.Paragraph>
        <AlertDialog open={confirming} onOpenChange={setConfirming} trigger={<Button className="history-population-composer__action" type="primary" size="large" loading={pending}>{t(mode === "SHORT" ? "history.population.startShort" : "history.population.createDurable")}</Button>} title={t(mode === "SHORT" ? "history.population.confirmShortTitle" : "history.population.confirmDurableTitle")} description={confirmationDescription} cancelLabel={t("common.cancel")} confirmLabel={pending ? t(mode === "SHORT" ? "history.population.running" : "history.durable.creating") : t(mode === "SHORT" ? "history.population.startShort" : "history.population.createDurable")} loading={pending} onConfirm={() => void (mode === "SHORT" ? executeShort() : createDurable())}>
          <dl className="ui-dialog__metadata">
            <div><dt>{t("history.overview.checkpoint.title")}</dt><dd><time dateTime={anchor}>{displayedAnchor}</time></dd></div>
            <div><dt>{t(mode === "SHORT" ? "history.population.maxWindows" : "history.population.windowBudget")}</dt><dd>{formatNumber(locale, selectedBudget)}</dd></div>
            <div><dt>{t("history.population.providerDisabled")}</dt><dd>{t(excludeProviderDisabled ? "history.population.excluded" : "history.population.included")}</dd></div>
          </dl>
        </AlertDialog>
      </section>}
      <RecentRuns runs={recent} unavailable={recentUnavailable} />
    </div>}

    {shortResult && <LastShortResult result={shortResult} />}
  </div>;
}

"use client";

import type { ReactNode } from "react";
import { Alert, Button, Collapse, Descriptions, Tag, Typography } from "antd";
import { useI18n } from "../i18n/client";
import { formatDateTime, formatNumber, formatUnit } from "../i18n/formatting";
import type { SafeDurableRun } from "../lib/position-history-durable-runs/position-history-durable-run-contract";
import type { PositionHistoryStatusResponse } from "../lib/position-history-status/position-history-status-contract";
import { CompactPageHeading } from "./compact-page-heading";
import { PositionHistoryCheckpointControl } from "./position-history-checkpoint-control";
import { durableRunInitiatorLabel } from "./position-history-durable-runs";

type Props = Readonly<{
  anchor: string | null;
  data: PositionHistoryStatusResponse | null;
  statusError: "INVALID_ANCHOR" | "UNAVAILABLE" | null;
  active: SafeDurableRun | null;
  activeUnavailable: boolean;
  administrationNavigation: ReactNode;
  historyNavigation: ReactNode;
}>;

export function PositionHistoryOverview({ anchor, data, statusError, active, activeUnavailable, administrationNavigation, historyNavigation }: Props) {
  const { locale, t } = useI18n();
  const number = (value: number) => formatNumber(locale, value);
  const instant = (value: string | null) => value === null ? t("history.observations.none") : (formatDateTime(locale, value) ?? t("common.notAvailable"));
  const newestFirst = data ? [...data.sliceStatuses].reverse() : [];
  const incomplete = data ? data.sliceStatuses.reduce((sum, slice) => ({ running: sum.running + slice.running, pending: sum.pending + slice.pending, none: sum.none + slice.none }), { running: 0, pending: 0, none: 0 }) : null;
  const populationHref = anchor === null ? "/admin/history/population" : `/admin/history/population?${new URLSearchParams({ to: anchor })}`;
  const activeStatusKey = active?.status === "PENDING" ? "history.durable.status.pending" : active?.status === "RUNNING" ? "history.durable.status.running" : active?.status === "SUCCEEDED" ? "history.durable.status.succeeded" : "history.durable.status.failed";
  const activeDescription = active ? <div className="history-active-run__facts">
    <span><strong>{number(active.committedWindows)} / {number(active.windowBudget)}</strong> {t("history.overview.active.windows")}</span>
    <span>{t("history.population.checkpoint", { anchor: instant(active.to) })}</span>
    <span>{t("history.durable.initiator", { initiator: durableRunInitiatorLabel(active.initiatorType, locale) })}</span>
    <span>{active.startedAt ? t("history.durable.started", { time: instant(active.startedAt) }) : t("history.overview.active.created", { time: instant(active.createdAt) })}</span>
  </div> : undefined;

  return <div className="history-overview">
    <header className="history-overview__heading"><CompactPageHeading title={t("history.title")} subtitle={t("history.overview.description")} /></header>
    {active && <Alert className="history-active-run" type="info" showIcon title={<span><Tag>{t(activeStatusKey)}</Tag>{t("history.overview.active.title")}</span>} description={activeDescription} action={<Button href={populationHref}>{t("history.overview.active.open")}</Button>} />}
    {activeUnavailable && <Alert className="history-active-run" type="warning" showIcon title={t("history.overview.active.unavailable")} description={t("history.overview.active.unavailableText")} action={<Button href={populationHref}>{t("history.overview.active.open")}</Button>} />}
    {administrationNavigation}
    {historyNavigation}

    <section className="history-context" aria-labelledby="history-context-title">
      <div className="history-context__copy"><Typography.Title level={2} id="history-context-title">{t("history.overview.checkpoint.title")}</Typography.Title><Typography.Paragraph type="secondary">{t("history.overview.checkpoint.help")}</Typography.Paragraph></div>
      <PositionHistoryCheckpointControl anchor={anchor} formAction="/admin/history" />
    </section>

    {statusError === "INVALID_ANCHOR" && <Alert type="error" showIcon title={t("history.anchor.invalidTitle")} description={t("history.anchor.invalidText")} />}
    {statusError === "UNAVAILABLE" && <Alert type="error" showIcon title={t("history.unavailableTitle")} description={t("history.unavailableText")} action={<Button href={anchor === null ? "/admin/history" : `/admin/history?${new URLSearchParams({ to: anchor })}`}>{t("common.retry")}</Button>} />}

    {data && <>
      <p className="history-horizon-statement"><time dateTime={data.from}>{instant(data.from)}</time><span aria-hidden>→</span><time dateTime={data.to}>{instant(data.to)}</time><span>·</span>{t("history.overview.horizon", { days: number(data.policyDays), slices: number(data.slices.total) })}</p>

      <div className="history-fact-groups">
        <section className="history-fact-group" aria-labelledby="history-processing-title">
          <Typography.Title level={2} id="history-processing-title">{t("history.overview.processing.title")}</Typography.Title>
          <Typography.Paragraph type="secondary">{t("history.overview.processing.help")}</Typography.Paragraph>
          <Descriptions className="history-fact-descriptions" bordered size="small" column={1} colon={false}>
            <Descriptions.Item label={t("history.overview.processing.processed")}><span className="history-fact-value">{number(data.backfill.completedPairs)} / {number(data.backfill.targetVehiclePairs)}</span></Descriptions.Item>
            <Descriptions.Item label={t("history.overview.processing.running")}><span className="history-fact-value">{number(incomplete!.running)}</span></Descriptions.Item>
            <Descriptions.Item label={t("history.overview.processing.pending")}><span className="history-fact-value">{number(incomplete!.pending)}</span></Descriptions.Item>
            <Descriptions.Item label={t("history.overview.processing.none")}><span className="history-fact-value">{number(incomplete!.none)}</span></Descriptions.Item>
            <Descriptions.Item label={t("history.overview.processing.eligible")}><span className="history-fact-value">{number(data.backfill.providerEligibleIncompletePairs)}</span></Descriptions.Item>
            <Descriptions.Item label={t("history.overview.processing.windows")}><span className="history-fact-value">{number(data.backfill.estimatedRemainingHourlyWindows)}</span></Descriptions.Item>
            <Descriptions.Item label={t("history.backfill.disabled")}><span className="history-fact-value">{number(data.fleet.providerDisabled)}</span></Descriptions.Item>
          </Descriptions>
        </section>

        <section className="history-fact-group" aria-labelledby="history-observations-title">
          <Typography.Title level={2} id="history-observations-title">{t("history.overview.observations.title")}</Typography.Title>
          <Typography.Paragraph type="secondary">{t("history.overview.observations.help")}</Typography.Paragraph>
          {data.observations.rowCount === 0 && <Alert type="info" showIcon title={t("history.overview.observations.empty")} />}
          <Descriptions className="history-fact-descriptions" bordered size="small" column={1} colon={false}>
            <Descriptions.Item label={t("history.observations.rows")}><span className="history-fact-value">{number(data.observations.rowCount)}</span></Descriptions.Item>
            <Descriptions.Item label={t("history.observations.with")}><span className="history-fact-value">{number(data.observations.vehiclesWithObservations)}</span></Descriptions.Item>
            <Descriptions.Item label={t("history.observations.without")}><span className="history-fact-value">{number(data.observations.vehiclesWithoutObservations)}</span></Descriptions.Item>
            <Descriptions.Item label={t("history.observations.first")}><span className="history-fact-value">{data.observations.firstObservationAt ? <time dateTime={data.observations.firstObservationAt}>{instant(data.observations.firstObservationAt)}</time> : t("history.observations.none")}</span></Descriptions.Item>
            <Descriptions.Item label={t("history.observations.last")}><span className="history-fact-value">{data.observations.lastObservationAt ? <time dateTime={data.observations.lastObservationAt}>{instant(data.observations.lastObservationAt)}</time> : t("history.observations.none")}</span></Descriptions.Item>
          </Descriptions>
        </section>
      </div>

      <section className="history-slices" aria-labelledby="history-slices-title">
        <div className="history-slices__heading"><Typography.Title level={2} id="history-slices-title">{t("history.overview.slices.title")}</Typography.Title><Typography.Text type="secondary">{t("history.overview.slices.help")}</Typography.Text></div>
        <div className="history-slices__table"><table><thead><tr><th>{t("history.overview.slices.range")}</th><th>{t("history.overview.slices.processed")}</th><th>{t("history.overview.slices.incomplete")}</th><th>{t("history.overview.slices.remaining")}</th></tr></thead><tbody>{newestFirst.map((slice) => <tr key={`${slice.from}/${slice.to}`}><td><span className="history-range"><time dateTime={slice.from}>{instant(slice.from)}</time><span aria-hidden>→</span><time dateTime={slice.to}>{instant(slice.to)}</time><small>{formatUnit(locale, slice.durationHours, "hour")}</small></span></td><td><strong className="history-numeric">{number(slice.completed)} / {number(slice.vehiclesTotal)}</strong></td><td><span className="history-state-list"><span><span>{t("history.overview.processing.running")}</span><strong>{number(slice.running)}</strong></span><span><span>{t("history.overview.processing.pending")}</span><strong>{number(slice.pending)}</strong></span><span><span>{t("history.overview.processing.none")}</span><strong>{number(slice.none)}</strong></span></span></td><td><span className="history-state-list"><span><span>{t("history.overview.processing.eligible")}</span><strong>{number(slice.providerEligibleRemaining)}</strong></span><span><span>{t("history.overview.processing.windows")}</span><strong>{number(slice.estimatedRemainingHourlyWindows)}</strong></span></span></td></tr>)}</tbody></table></div>
        <div className="history-slices__records">{newestFirst.map((slice) => <article key={`${slice.from}/${slice.to}`}><h3><time dateTime={slice.from}>{instant(slice.from)}</time><span aria-hidden>→</span><time dateTime={slice.to}>{instant(slice.to)}</time></h3><p>{formatUnit(locale, slice.durationHours, "hour")}</p><dl><div><dt>{t("history.overview.slices.processed")}</dt><dd>{number(slice.completed)} / {number(slice.vehiclesTotal)}</dd></div><div><dt>{t("history.overview.processing.running")}</dt><dd>{number(slice.running)}</dd></div><div><dt>{t("history.overview.processing.pending")}</dt><dd>{number(slice.pending)}</dd></div><div><dt>{t("history.overview.processing.none")}</dt><dd>{number(slice.none)}</dd></div><div><dt>{t("history.overview.processing.eligible")}</dt><dd>{number(slice.providerEligibleRemaining)}</dd></div><div><dt>{t("history.overview.processing.windows")}</dt><dd>{number(slice.estimatedRemainingHourlyWindows)}</dd></div></dl></article>)}</div>
      </section>

      <Collapse className="history-methodology" ghost items={[{ key: "methodology", label: t("history.overview.methodology.title"), children: <ul><li>{t("history.overview.methodology.processed")}</li><li>{t("history.overview.methodology.observations")}</li><li>{t("history.overview.methodology.disabled")}</li><li>{t("history.overview.methodology.windows")}</li></ul> }]} />
    </>}
  </div>;
}

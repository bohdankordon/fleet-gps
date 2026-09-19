"use client";

import { Descriptions, Typography } from "antd";
import { useI18n } from "../i18n/client";
import { formatDateTime, formatNumber, formatUnit } from "../i18n/formatting";
import type { PositionHistoryHorizonPlanResponse } from "../lib/position-history-horizon-plan/position-history-horizon-plan-contract";

type Props = Readonly<{ plan: PositionHistoryHorizonPlanResponse }>;

/**
 * Manual population planning facts. These describe exact `VehiclePositionBackfillCheckpoint` targets
 * for the selected horizon only; they are not a statement about lossless-history completeness.
 */
export function PositionHistoryPopulationPlan({ plan }: Props) {
  const { locale, t } = useI18n();
  const number = (value: number) => formatNumber(locale, value);
  const instant = (value: string | null) => value === null ? t("common.notAvailable") : (formatDateTime(locale, value) ?? t("common.notAvailable"));
  const newestFirst = [...plan.sliceStatuses].reverse();
  const incomplete = plan.sliceStatuses.reduce((sum, slice) => ({ running: sum.running + slice.running, pending: sum.pending + slice.pending, none: sum.none + slice.none }), { running: 0, pending: 0, none: 0 });
  return <section className="history-population-plan" aria-labelledby="history-population-plan-title">
    <div className="history-population-section-heading">
      <Typography.Title level={2} id="history-population-plan-title">{t("history.population.planTitle")}</Typography.Title>
      <Typography.Text type="secondary">{t("history.population.planHelp")}</Typography.Text>
    </div>
    <p className="history-horizon-statement"><time dateTime={plan.from}>{instant(plan.from)}</time><span aria-hidden>→</span><time dateTime={plan.to}>{instant(plan.to)}</time><span>·</span>{t("history.overview.horizon", { days: number(plan.policyDays), slices: number(plan.slices.total) })}</p>
    <div className="history-fact-groups history-fact-groups--plan">
      <section className="history-fact-group" aria-labelledby="history-population-plan-processing-title">
        <Typography.Title level={2} id="history-population-plan-processing-title">{t("history.overview.processing.title")}</Typography.Title>
        <Typography.Paragraph type="secondary">{t("history.overview.processing.help")}</Typography.Paragraph>
        <Descriptions className="history-fact-descriptions" bordered size="small" column={1} colon={false}>
          <Descriptions.Item label={t("history.overview.processing.processed")}><span className="history-fact-value">{number(plan.backfill.completedPairs)} / {number(plan.backfill.targetVehiclePairs)}</span></Descriptions.Item>
          <Descriptions.Item label={t("history.overview.processing.running")}><span className="history-fact-value">{number(incomplete.running)}</span></Descriptions.Item>
          <Descriptions.Item label={t("history.overview.processing.pending")}><span className="history-fact-value">{number(incomplete.pending)}</span></Descriptions.Item>
          <Descriptions.Item label={t("history.overview.processing.none")}><span className="history-fact-value">{number(incomplete.none)}</span></Descriptions.Item>
          <Descriptions.Item label={t("history.overview.processing.eligible")}><span className="history-fact-value">{number(plan.backfill.providerEligibleIncompletePairs)}</span></Descriptions.Item>
          <Descriptions.Item label={t("history.overview.processing.windows")}><span className="history-fact-value">{number(plan.backfill.estimatedRemainingHourlyWindows)}</span></Descriptions.Item>
          <Descriptions.Item label={t("history.population.providerDisabled")}><span className="history-fact-value">{number(plan.fleet.providerDisabled)}</span></Descriptions.Item>
        </Descriptions>
      </section>
    </div>
    <div className="history-slices">
      <div className="history-slices__heading"><Typography.Title level={2}>{t("history.overview.slices.title")}</Typography.Title><Typography.Text type="secondary">{t("history.overview.slices.help")}</Typography.Text></div>
      <div className="history-slices__table"><table><thead><tr><th>{t("history.overview.slices.range")}</th><th>{t("history.overview.slices.processed")}</th><th>{t("history.overview.slices.incomplete")}</th><th>{t("history.overview.slices.remaining")}</th></tr></thead><tbody>{newestFirst.map((slice) => <tr key={`${slice.from}/${slice.to}`}><td><span className="history-range"><time dateTime={slice.from}>{instant(slice.from)}</time><span aria-hidden>→</span><time dateTime={slice.to}>{instant(slice.to)}</time><small>{formatUnit(locale, slice.durationHours, "hour")}</small></span></td><td><strong className="history-numeric">{number(slice.completed)} / {number(slice.vehiclesTotal)}</strong></td><td><span className="history-state-list"><span><span>{t("history.overview.processing.running")}</span><strong>{number(slice.running)}</strong></span><span><span>{t("history.overview.processing.pending")}</span><strong>{number(slice.pending)}</strong></span><span><span>{t("history.overview.processing.none")}</span><strong>{number(slice.none)}</strong></span></span></td><td><span className="history-state-list"><span><span>{t("history.overview.processing.eligible")}</span><strong>{number(slice.providerEligibleRemaining)}</strong></span><span><span>{t("history.overview.processing.windows")}</span><strong>{number(slice.estimatedRemainingHourlyWindows)}</strong></span></span></td></tr>)}</tbody></table></div>
      <div className="history-slices__records">{newestFirst.map((slice) => <article key={`${slice.from}/${slice.to}`}><h3><time dateTime={slice.from}>{instant(slice.from)}</time><span aria-hidden>→</span><time dateTime={slice.to}>{instant(slice.to)}</time></h3><p>{formatUnit(locale, slice.durationHours, "hour")}</p><dl><div><dt>{t("history.overview.slices.processed")}</dt><dd>{number(slice.completed)} / {number(slice.vehiclesTotal)}</dd></div><div><dt>{t("history.overview.processing.running")}</dt><dd>{number(slice.running)}</dd></div><div><dt>{t("history.overview.processing.pending")}</dt><dd>{number(slice.pending)}</dd></div><div><dt>{t("history.overview.processing.none")}</dt><dd>{number(slice.none)}</dd></div><div><dt>{t("history.overview.processing.eligible")}</dt><dd>{number(slice.providerEligibleRemaining)}</dd></div><div><dt>{t("history.overview.processing.windows")}</dt><dd>{number(slice.estimatedRemainingHourlyWindows)}</dd></div></dl></article>)}</div>
    </div>
  </section>;
}

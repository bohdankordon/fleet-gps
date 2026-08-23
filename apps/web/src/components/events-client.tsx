"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AlertEventsListResponse, AlertEventsSummaryResponse } from "@/lib/alert-events/alert-events-contract";
import { parseAlertEventsListResponse, parseAlertEventsSummaryResponse } from "@/lib/alert-events/alert-events-contract";
import { alertDetailsLabel, alertStatusLabel, alertTypeLabel, formatAlertTimestamp, notificationDeliveryLabel } from "@/lib/alert-events/alert-events-formatters";
import { alertEventsHistoryPath, shouldUpdateAlertEventsHistory, type AlertEventsNavigationReason } from "@/lib/alert-events/alert-events-navigation";
import { ALERT_EVENTS_PAGE_SIZE, parseAlertEventsFilters, serializeAlertEventsRequestQuery, type AlertEventsFilters, type AlertEventsStatus, type AlertEventsType } from "@/lib/alert-events/alert-events-query";
import { abortAlertEventsLoadMore, beginAlertEventsFirstPage, beginAlertEventsLoadMore, canLoadMoreAlertEvents, failAlertEventsFirstPage, failAlertEventsLoadMore, initialAlertEventsListState, isCurrentAlertEventsGeneration, succeedAlertEventsFirstPage, succeedAlertEventsLoadMore } from "@/lib/alert-events/alert-events-request-state";
import { emptyAlertEventsMessage } from "@/lib/alert-events/alert-events-ui-model";
import { useAuth } from "@/components/auth-provider";
import { hasPermission } from "@/lib/auth/auth-contract";
import { Alert, Badge, Button, Card, EmptyState, FormField, LoadMore, LoadingStatus, NativeSelect, PageHeader } from "./ui";
import { WarningIcon } from "./ui/icons";
import { useI18n } from "../i18n/client";

type Props = Readonly<{ initialData: AlertEventsListResponse; initialSummary: AlertEventsSummaryResponse | null; initialFilters: AlertEventsFilters }>;
type BadgeVariant = "neutral" | "info" | "success" | "warning" | "danger";

function alertTone(status: string): BadgeVariant { return status === "OPEN" ? "danger" : "neutral"; }
function deliveryTone(status: string): BadgeVariant { return status === "SENT" ? "success" : status === "FAILED" ? "danger" : status === "PENDING" ? "warning" : "neutral"; }
async function bffJson(path: string, signal: AbortSignal): Promise<unknown> { const response = await fetch(path, { cache: "no-store", signal }); if (!response.ok) throw new Error(); return response.json(); }

export function EventsClient({ initialData, initialSummary, initialFilters }: Props) {
  const { locale, t } = useI18n();
  const auth = useAuth(); const canOpenVehicles = auth !== null && hasPermission(auth, "vehicles.view");
  const [list, setList] = useState(() => initialAlertEventsListState(initialData, initialFilters));
  const [summary, setSummary] = useState(initialSummary); const [summaryError, setSummaryError] = useState(initialSummary === null);
  const primaryController = useRef<AbortController | null>(null); const moreController = useRef<AbortController | null>(null); const moreInFlight = useRef(false); const generation = useRef(0);

  const firstRequest = useCallback(async (next: AlertEventsFilters, reason: AlertEventsNavigationReason) => {
    primaryController.current?.abort(); moreController.current?.abort(); moreController.current = null; moreInFlight.current = false;
    const requestGeneration = generation.current + 1; generation.current = requestGeneration; const controller = new AbortController(); primaryController.current = controller;
    setList((current) => abortAlertEventsLoadMore(beginAlertEventsFirstPage(current, next)));
    if (shouldUpdateAlertEventsHistory(reason)) window.history.pushState(null, "", alertEventsHistoryPath(next));
    const query = serializeAlertEventsRequestQuery({ ...next, limit: ALERT_EVENTS_PAGE_SIZE }); const [listResult, summaryResult] = await Promise.allSettled([bffJson(`/api/alert-events?${query}`, controller.signal), bffJson("/api/alert-events/summary", controller.signal)]);
    if (controller.signal.aborted || !isCurrentAlertEventsGeneration(requestGeneration, generation.current)) return;
    if (listResult.status === "fulfilled") { try { const data = parseAlertEventsListResponse(listResult.value); setList((current) => succeedAlertEventsFirstPage(current, next, data)); } catch { setList(failAlertEventsFirstPage); } } else setList(failAlertEventsFirstPage);
    if (summaryResult.status === "fulfilled") { try { setSummary(parseAlertEventsSummaryResponse(summaryResult.value)); setSummaryError(false); } catch { setSummaryError(true); } } else setSummaryError(true);
  }, []);

  useEffect(() => { const onPopState = () => { try { void firstRequest(parseAlertEventsFilters(new URLSearchParams(window.location.search)), "popstate"); } catch { window.history.replaceState(null, "", "/events"); void firstRequest({}, "popstate"); } }; window.addEventListener("popstate", onPopState); return () => { window.removeEventListener("popstate", onPopState); primaryController.current?.abort(); moreController.current?.abort(); moreInFlight.current = false; }; }, [firstRequest]);
  const change = <K extends keyof AlertEventsFilters>(key: K, value: AlertEventsFilters[K]) => { void firstRequest({ ...list.filters, [key]: value }, "user"); };
  const loadMore = async () => {
    if (moreInFlight.current || !canLoadMoreAlertEvents(list)) return;
    moreInFlight.current = true; const requestGeneration = generation.current; const controller = new AbortController(); moreController.current = controller; setList(beginAlertEventsLoadMore);
    try {
      const query = serializeAlertEventsRequestQuery({ ...list.filters, limit: ALERT_EVENTS_PAGE_SIZE, cursor: list.data.nextCursor ?? undefined }); const page = parseAlertEventsListResponse(await bffJson(`/api/alert-events?${query}`, controller.signal));
      if (!controller.signal.aborted && isCurrentAlertEventsGeneration(requestGeneration, generation.current) && moreController.current === controller) setList((current) => succeedAlertEventsLoadMore(current, page));
    } catch { if (!controller.signal.aborted && isCurrentAlertEventsGeneration(requestGeneration, generation.current) && moreController.current === controller) setList(failAlertEventsLoadMore); }
    finally { if (isCurrentAlertEventsGeneration(requestGeneration, generation.current) && moreController.current === controller) { moreInFlight.current = false; moreController.current = null; } }
  };
  const retry = () => { if (list.error === "more") void loadMore(); else void firstRequest(list.filters, list.error === "first" ? "retry" : "refresh"); };
  const empty = emptyAlertEventsMessage(list.filters.status !== undefined || list.filters.type !== undefined, locale);
  const loadingTitle = list.moreLoading ? t("events.loadingMore") : t("events.loading");

  return <div className="events-page">
    <PageHeader className="events-page-header" eyebrow={t("events.eyebrow")} title={t("events.title")} description={t("events.description")} />
    <EventsSummary summary={summary} />
    <section className="events-filter-bar" aria-label={t("events.filters.label")}>
      <FormField id="events-status" label={t("events.filters.status")}><NativeSelect value={list.filters.status ?? ""} onChange={(event) => change("status", (event.target.value || undefined) as AlertEventsStatus | undefined)}><option value="">{t("common.all")}</option><option value="OPEN">{t("events.filters.open")}</option><option value="RESOLVED">{t("events.filters.resolved")}</option></NativeSelect></FormField>
      <FormField id="events-type" label={t("events.filters.type")}><NativeSelect value={list.filters.type ?? ""} onChange={(event) => change("type", (event.target.value || undefined) as AlertEventsType | undefined)}><option value="">{t("common.all")}</option><option value="SPEEDING">{t("events.type.SPEEDING")}</option><option value="INACTIVITY">{t("events.type.INACTIVITY")}</option></NativeSelect></FormField>
      <Button onClick={() => void firstRequest(list.filters, "refresh")} loading={list.loading}>{list.loading ? t("common.refreshing") : t("common.refresh")}</Button>
    </section>
    {(list.error || summaryError) && <Alert className="events-feedback" variant="danger" live="assertive" icon={<WarningIcon />} title={list.error === "more" ? t("events.loadMoreError") : list.error === "first" ? t("events.loadError") : t("events.summaryError")} action={<Button variant="secondary" size="compact" onClick={retry}>{t("common.retry")}</Button>} />}
    {(list.loading || list.moreLoading) && <LoadingStatus className="events-feedback" title={loadingTitle} />}
    <section className="events-data-surface" aria-busy={list.loading || list.moreLoading || undefined}>
      {list.data.items.length === 0 ? <EmptyState title={empty.heading}>{empty.text}</EmptyState> : <><div className="events-table-container"><table><caption className="sr-only">{t("events.title")}</caption><thead><tr><th scope="col">{t("events.table.vehicle")}</th><th scope="col">{t("events.table.type")}</th><th scope="col">{t("events.table.status")}</th><th scope="col">{t("events.table.opened")}</th><th scope="col">{t("events.table.notification")}</th><th scope="col">{t("events.table.details")}</th><th scope="col">{t("events.table.resolved")}</th></tr></thead><tbody>{list.data.items.map((event) => <tr key={event.id}><td><strong>{canOpenVehicles ? <Link className="events-vehicle-link" href={`/vehicles/${event.vehicle.id}`}>{event.vehicle.name}</Link> : event.vehicle.name}</strong></td><td>{alertTypeLabel(event.type, locale)}</td><td><Badge variant={alertTone(event.status)}>{alertStatusLabel(event.status, locale)}</Badge></td><td className="ui-tabular-nums"><time dateTime={event.openedAt}>{formatAlertTimestamp(event.openedAt, locale)}</time></td><td><Badge variant={deliveryTone(event.notificationDeliveryStatus)}>{notificationDeliveryLabel(event.notificationDeliveryStatus, locale)}</Badge></td><td className="events-details">{alertDetailsLabel(event, locale)}</td><td className="ui-tabular-nums">{event.resolvedAt === null ? "—" : <time dateTime={event.resolvedAt}>{formatAlertTimestamp(event.resolvedAt, locale)}</time>}</td></tr>)}</tbody></table></div><section className="events-mobile-list" aria-label={t("events.title")}>{list.data.items.map((event) => <Card as="article" className="events-mobile-card" key={event.id}><div className="events-mobile-card__header"><strong>{canOpenVehicles ? <Link className="events-vehicle-link" href={`/vehicles/${event.vehicle.id}`}>{event.vehicle.name}</Link> : event.vehicle.name}</strong><span className="events-mobile-card__type">{alertTypeLabel(event.type, locale)}</span></div><div className="events-mobile-card__badges"><Badge variant={alertTone(event.status)}>{alertStatusLabel(event.status, locale)}</Badge><Badge variant={deliveryTone(event.notificationDeliveryStatus)}>{notificationDeliveryLabel(event.notificationDeliveryStatus, locale)}</Badge></div><dl><div><dt>{t("events.table.opened")}</dt><dd className="ui-tabular-nums"><time dateTime={event.openedAt}>{formatAlertTimestamp(event.openedAt, locale)}</time></dd></div><div><dt>{t("events.table.resolved")}</dt><dd className="ui-tabular-nums">{event.resolvedAt === null ? "—" : <time dateTime={event.resolvedAt}>{formatAlertTimestamp(event.resolvedAt, locale)}</time>}</dd></div><div className="events-mobile-card__details"><dt>{t("events.table.details")}</dt><dd>{alertDetailsLabel(event, locale)}</dd></div></dl></Card>)}</section></>}
    </section>
    {canLoadMoreAlertEvents(list) && <LoadMore label={t("audit.loadMore")} loadingLabel={t("events.loadingMore")} loading={list.moreLoading} disabled={list.loading} onLoadMore={() => void loadMore()} />}
  </div>;
}

function EventsSummary({ summary }: Readonly<{ summary: AlertEventsSummaryResponse | null }>) {
  const { t } = useI18n();
  const cards = [
    { label: t("events.summary.total"), value: summary?.open.total ?? "—", tone: "primary" },
    { label: t("events.type.SPEEDING"), value: summary?.open.speeding ?? "—", tone: "warning" },
    { label: t("events.type.INACTIVITY"), value: summary?.open.inactivity ?? "—", tone: "info" },
  ] as const;
  return <section className="events-summary" aria-label={t("events.summary.label")}>{cards.map((card) => <Card as="article" className={`events-summary-card events-summary-card--${card.tone}`} key={card.label}><p>{card.label}</p><strong className="ui-tabular-nums">{card.value}</strong></Card>)}</section>;
}

"use client";

import Link from "next/link";
import { useI18n } from "../i18n/client";
import { formatDateTime } from "../i18n/formatting";
import { createFleetActivityReportDateNavigation, FLEET_ACTIVITY_REPORT_DATE_FORM } from "@/lib/fleet-activity-report/fleet-activity-report-navigation";
import type { FleetActivityReportResponse } from "@/lib/fleet-activity-report/fleet-activity-report-contract";
import { formatObservedDistance, formatTripAnalysisDuration } from "@/lib/trip-analysis/trip-analysis-formatters";
import type { VehicleTrackRange } from "@/lib/vehicle-track/vehicle-track-range";
import { WarningIcon } from "./ui/icons";

type Props = Readonly<{ initialDate: string; initialRange: VehicleTrackRange; initialData: FleetActivityReportResponse | null; initialError: boolean; now: Date; timezone: string; canOpenTrips: boolean }>;

export function FleetActivityReportClient({ initialDate, initialRange, initialData: data, initialError, now, timezone, canOpenTrips }: Props) {
  const { locale, t } = useI18n();
  const navigation = createFleetActivityReportDateNavigation(now, timezone);
  const allNoGps = data !== null && data.summary.vehicleCount > 0 && data.summary.vehiclesWithGps === 0;
  const periodFrom = formatDateTime(locale, initialRange.from) ?? t("common.notAvailable");
  const periodTo = formatDateTime(locale, initialRange.to) ?? t("common.notAvailable");

  return <>
    <header className="hero report-hero"><p className="eyebrow">{t("reports.eyebrow")}</p><h1>{t("reports.title")}</h1><p>{t("reports.description")}</p></header>
    <section className="report-controls" aria-label={t("reports.controls.label")}><div className="report-control-groups"><div className="report-quick-ranges">{navigation && <><Link className="report-date-link" href={navigation.todayHref}>{t("reports.today")}</Link><Link className="report-date-link" href={navigation.yesterdayHref}>{t("reports.yesterday")}</Link></>}</div><form className="report-custom-date" action={FLEET_ACTIVITY_REPORT_DATE_FORM.action} method={FLEET_ACTIVITY_REPORT_DATE_FORM.method}><label>{t("reports.date")}<input type="date" name={FLEET_ACTIVITY_REPORT_DATE_FORM.fieldName} defaultValue={initialDate} /></label><button type="submit">{t("reports.show")}</button></form></div><p className="report-period">{t("reports.period", { from: periodFrom, to: periodTo })}</p></section>
    {initialError && <section className="notice" role="alert"><WarningIcon className="notice-icon" /><div><strong>{t("reports.loadError")}</strong><span>{t("reports.loadErrorText")}</span></div></section>}
    {data && <>
      <section className="report-summary" aria-label={t("reports.summary.label")}><article><span>{t("reports.summary.vehiclesWithGps")}</span><strong>{data.summary.vehiclesWithGps} / {data.summary.vehicleCount}</strong></article><article><span>{t("trips.summary.trips")}</span><strong>{data.summary.tripCount}</strong></article><article><span>{t("trips.summary.distance")}</span><strong>{formatObservedDistance(data.summary.totalObservedDistanceMeters, locale)}</strong></article><article><span>{t("reports.summary.tripTime")}</span><strong>{formatTripAnalysisDuration(data.summary.totalTripDurationSeconds, locale)}</strong></article><article><span>{t("trips.summary.gaps")}</span><strong>{data.summary.gapCount}</strong></article></section>
      {allNoGps && <p className="report-empty">{t("reports.noGpsDay")}</p>}
      <section className="report-table-card"><div className="report-table-wrap"><table className="report-table"><thead><tr><th>{t("reports.table.vehicle")}</th><th>{t("trips.summary.trips")}</th><th>{t("trips.summary.distance")}</th><th>{t("reports.summary.tripTime")}</th><th>{t("reports.table.stopsFive")}</th><th>{t("reports.table.stopTime")}</th><th>{t("trips.summary.gaps")}</th></tr></thead><tbody>{data.vehicles.map((vehicle) => {
        const href = `/vehicles/${vehicle.vehicleId}/trips?${new URLSearchParams({ from: data.from, to: data.to })}`;
        return <tr key={vehicle.vehicleId} className={!vehicle.hasGpsData ? "report-no-gps" : undefined}><td>{canOpenTrips ? <Link href={href}>{vehicle.vehicleName}</Link> : vehicle.vehicleName}</td>{vehicle.hasGpsData ? <><td>{vehicle.tripCount}</td><td>{formatObservedDistance(vehicle.observedDistanceMeters, locale)}</td><td>{formatTripAnalysisDuration(vehicle.tripDurationSeconds, locale)}</td><td>{vehicle.stopCount}</td><td>{formatTripAnalysisDuration(vehicle.stopDurationSeconds, locale)}</td><td>{vehicle.gapCount}</td></> : <td colSpan={6}>{canOpenTrips ? <Link href={href}>{t("reports.noGps")}</Link> : t("reports.noGps")}</td>}</tr>;
      })}</tbody></table></div></section>
      <p className="report-disclaimer">{t("reports.disclaimer")}</p>
    </>}
  </>;
}

import "../test-setup-alias";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { EventsClient } from "./events-client";
import { EventDetail } from "./event-detail";
import { AuthProvider } from "./auth-provider";
import { I18nProvider } from "../i18n/client";
import { alertEventsListFixture, alertEventsSummaryFixture } from "../lib/alert-events/alert-events-fixture";
import type { AlertEvent } from "../lib/alert-events/alert-events-contract";
import { MESSAGE_CATALOG } from "../i18n/messages";
const source = readFileSync("src/components/events-client.tsx", "utf8");
const detailSource = readFileSync("src/components/event-detail.tsx", "utf8");
const styles = readFileSync("src/styles/events.css", "utf8");
const speeding = alertEventsListFixture.items[0];
const inactivity: AlertEvent = { ...speeding, type: "INACTIVITY", status: "RESOLVED", resolvedAt: "2026-08-08T13:00:00.000Z", details: { confirmationDistanceMeters: 35, lastDistanceMeters: 340, minimumDistanceMeters: 12, distanceThresholdMeters: 300, durationThresholdMinutes: 60 } };
const admin = { id: "admin", login: "admin", role: "ADMIN" as const, permissions: [], mustChangePassword: false };
const renderDetail = (event: AlertEvent) => renderToStaticMarkup(<I18nProvider locale="en"><AuthProvider user={admin}><EventDetail event={event} now={new Date("2026-08-08T14:00:00Z")} onClose={() => {}} /></AuthProvider></I18nProvider>);
const renderPage = (filters = {}, items: AlertEvent[] = [speeding], summary: typeof alertEventsSummaryFixture | null = alertEventsSummaryFixture, initialError = false) => renderToStaticMarkup(<I18nProvider locale="en"><EventsClient initialFilters={filters} initialData={{ items, nextCursor: null }} initialSummary={summary} initialError={initialError} /></I18nProvider>);

test("workspace uses Ant Design with a compact heading, global metrics, chronology and no delivery truth", () => {
  for (const state of ["NONE", "PENDING", "SENT", "FAILED"] as const) {
    const html = renderPage({}, [{ ...speeding, notificationDeliveryStatus: state }]);
    for (const forbidden of ["Not sent", "Pending", "Delivery failed", "Telegram", "<table", "events-summary-card"]) assert.ok(!html.includes(forbidden), forbidden);
    assert.match(html, /Open now/); assert.match(html, /Accessible fleet/); assert.match(html, /aria-pressed="false"/);
  }
  assert.doesNotMatch(source + detailSource, /notificationDelivery|notificationDeliveryLabel|events.delivery|maplibre/);
  assert.match(source, /from "antd"/); assert.doesNotMatch(styles, /\.ant-/);
});
test("SPEEDING detail renders all stored evidence and lifecycle without fictional facts", () => {
  const html = renderDetail(speeding);
  for (const text of ["Confirmation speed", "Last observed speed", "Peak speed", "Threshold", "City", "72", "74", "81", "Last observation", "Europe/Kyiv"]) assert.match(html, new RegExp(text));
  assert.doesNotMatch(html, /<dt>Resolved<\/dt>|severity|stale|acknowledg/i);
  assert.match(html, /Current position/); assert.match(html, /not the event origin/);
  assert.doesNotMatch(html, /Show event on map|Event location/);
});
test("INACTIVITY detail has distance and window metrics, with conditional resolution", () => {
  const html = renderDetail(inactivity);
  for (const text of ["Rolling window duration", "Confirmation traveled distance", "Last traveled distance", "Minimum distance during episode", "Distance threshold", "60 minutes", "35 m", "340 m", "12 m", "300 m", "<dt>Resolved:</dt>"]) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /minimum duration|stayed at/i);
});
test("event list and detail show subtle vehicle group metadata without new badge styles", () => {
  const grouped = { ...speeding, vehicle: { ...speeding.vehicle, group: { id: "11111111-1111-4111-8111-111111111111", name: "Night group", color: "BLUE" as const } } };
  assert.ok(renderPage({}, [grouped]).includes("Night group"));
  assert.ok(renderDetail(grouped).includes("Night group"));
  assert.ok(source.includes("VehicleGroupTag"));
  assert.ok(detailSource.includes("VehicleGroupTag"));
});
test("events.view-only identity remains visible and all restricted navigation is absent", () => {
  const html = renderToStaticMarkup(<AuthProvider user={{ ...admin, role: "USER", permissions: ["events.view"] }}><EventDetail event={speeding} now={new Date()} onClose={() => {}} /></AuthProvider>);
  assert.match(html, /Такси 7/); assert.doesNotMatch(html, /href=/);
});
test("empty and failure states distinguish active, history, filters and independent summary failure", () => {
  assert.match(renderPage({}, []), /No active events now/);
  assert.match(renderPage({ status: "RESOLVED" }, []), /No resolved events in the selected opening period/);
  assert.match(renderPage({ type: "SPEEDING" }, []), /No events match the selected filters/);
  const failure = renderPage({}, [speeding], null); assert.match(failure, /summary could not be loaded/); assert.match(failure, /Такси 7/);
  const listFailure = renderPage({}, [], alertEventsSummaryFixture, true); assert.match(listFailure, /Events could not be loaded/); assert.doesNotMatch(listFailure, /No active events now/);
});
test("desktop and mobile share a single detail component; drawer, selection, keyboard and history wiring", () => {
  assert.equal((source.match(/<EventDetail /g) ?? []).length, 2);
  assert.match(source, /screens.lg && <aside/); assert.match(source, /!screens.lg && <Drawer/);
  assert.match(source, /selectionTrigger.current\?\.focus\(/);
  assert.match(styles, /grid-template-columns: minmax\(0, 1fr\); gap: 0/);
  assert.match(source, /onClose=\{closeSelection\}/);
  assert.match(source, /reason === "user" \|\| reason === "popstate"/);
  assert.match(source, /<button type="button" className="events-item vehicle-trips__record-button" aria-pressed/);
  assert.match(source, /window.history.pushState/); assert.match(source, /window.addEventListener\("popstate"/);
  assert.match(styles, /@media \(max-width: 991px\)/); assert.match(styles, /:focus-visible/);
});
test("all Events translations have nonempty UK, RU and EN values and opening-time wording", () => {
  for (const [key, values] of Object.entries(MESSAGE_CATALOG).filter(([key]) => key.startsWith("events."))) {
    assert.deepEqual(Object.keys(values).sort(), ["en", "ru", "uk"], key);
    for (const value of Object.values(values)) assert.ok(value.trim(), key);
  }
  assert.match(MESSAGE_CATALOG["events.period.help"].en, /opening time/);
});


test("Events consumes accepted Fleet and Vehicle-family presentation without changing their CSS", () => {
  const presentation = readFileSync("src/components/events-presentation.tsx", "utf8");
  for (const contract of ["fleet-toolbar", "fleet-toolbar__select-control", "vehicle-detail-shell__tabs", "vehicle-trips__summary-metric", "vehicle-trips__record--selected", "vehicle-trips__record-button", "StableLoadingButton", "token.colorPrimaryBg", "token.colorPrimaryBorder"]) assert.ok(source.includes(contract), contract);
  assert.match(source, /<Tabs /); assert.doesNotMatch(source, /Segmented|Empty.PRESENTED_IMAGE/);
  assert.match(presentation, /vehicle-track__map-empty-icon/);
  assert.match(presentation, /eventStatusColor\(status\)/);
  assert.match(detailSource, /vehicle-overview__metric-row/);
  assert.match(detailSource, /ordinaryActions\.map\(\(action\) => <Button size="large" type="default"/);
  assert.match(detailSource, /event-detail__actions event-detail__actions--event/);
  assert.match(detailSource, /<Button size="large" type="primary" key=\{eventTripAction\.key\}/);
  assert.match(styles, /--font-weight-semibold/);
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}\b|\.ant-/i);
  assert.doesNotMatch(source + detailSource + presentation, /severity|colorError|colorWarning/);
});

test("event rows keep status metadata stable while the direct trip action remains a sibling control", () => {
  assert.match(source, /<button type="button" className="events-item vehicle-trips__record-button"[^]*<EventStatusTag status=\{event\.status\} \/>[^]*<\/button>\{eventTripAction \? <span className="events-item__trip-action">/);
  assert.match(source, /event\.type === "SPEEDING" \? alertEventActions/);
  assert.match(styles, /\.events-list \.vehicle-trips__record \{ grid-template-columns: 34px minmax\(0, 1fr\); \}/);
  assert.match(styles, /\.events-list__item \{ position: relative; \}/);
  assert.match(styles, /\.events-item__trip-action \{ position: absolute;/);
  assert.match(styles, /@media \(max-width: 575px\)[^]*\.events-list \.vehicle-trips__record \{ grid-template-columns: 30px minmax\(0, 1fr\); \}/);
});

test("event detail keeps ordinary navigation together and event investigation on its own row", () => {
  assert.match(detailSource, /const ordinaryActions = actions\.filter\(\(action\) => action\.key !== "eventTrip"\)/);
  assert.match(detailSource, /const eventTripAction = actions\.find\(\(action\) => action\.key === "eventTrip"\)/);
  assert.ok(detailSource.indexOf("ordinaryActions.map") < detailSource.indexOf("eventTripAction ?"));
  assert.match(styles, /\.event-detail__actions--event \{ justify-content: flex-start; \}/);
});


test("filter utility has label and control rows with the exact accepted Fleet Reset contract", () => {
  assert.match(source, /<div className="events-filter-utility"><Typography.Text className="events-filter-count"/);
  assert.match(source, /count: filterCount/);
  assert.match(source, /<FleetFilterResetButton disabled=\{filterCount === 0\}/);
  assert.match(styles, /events-filter-count \{ grid-row: 1/);
  assert.match(styles, /events-filter-utility > .fleet-filter-reset \{ grid-row: 2/);
  assert.match(styles, /events-filter-utility \{ grid-column: 1 \/ -1; grid-row: 4; display: flex; justify-content: space-between/);
  const reset = readFileSync("src/components/fleet-filter-reset-button.tsx", "utf8");
  const fleet = readFileSync("src/components/dashboard-client.tsx", "utf8");
  const themeContract = /<ConfigProvider theme=([\s\S]*?)><Button/;
  assert.equal(reset.match(themeContract)?.[1], fleet.match(themeContract)?.[1]);
  for (const contract of ['type="default" size="small"', 'styles={{ root: { minHeight: 0 } }}']) {
    assert.ok(reset.includes(contract)); assert.ok(fleet.includes(contract));
  }
  const empty = renderPage();
  assert.match(empty, /Filters: 0/);
  assert.match(empty, /class="[^"<>]*fleet-filter-reset[^"<>]*"[^>]*disabled=""/);
  const filtered = renderPage({ type: "SPEEDING", vehicleId: speeding.vehicle.id });
  assert.match(filtered, /Filters: 2/);
  assert.doesNotMatch(filtered, /class="[^"<>]*fleet-filter-reset[^"<>]*"[^>]*disabled/);
  const grouped = renderPage({ group: "11111111-1111-4111-8111-111111111111" });
  assert.match(grouped, /Filters: 1/);
  assert.doesNotMatch(grouped, /class="[^"<>]*fleet-filter-reset[^"<>]*"[^>]*disabled/);
  const ungrouped = renderPage({ group: "ungrouped" });
  assert.match(ungrouped, /Filters: 1/);
  assert.doesNotMatch(ungrouped, /class="[^"<>]*fleet-filter-reset[^"<>]*"[^>]*disabled/);
});
test("group filter stays comparable to sibling filters and stacks deterministically on narrow screens", () => {
  assert.ok(styles.includes("grid-template-columns: minmax(180px, 260px) minmax(180px, 260px) minmax(180px, 260px) minmax(0, 1fr)"));
  assert.ok(styles.includes(".events-filter--group"));
  assert.ok(source.includes('className="events-filter events-filter--group"'));
});

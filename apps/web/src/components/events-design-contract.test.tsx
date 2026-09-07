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
    assert.match(html, /Open now/); assert.match(html, /Fleet-wide/); assert.match(html, /aria-pressed="false"/);
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
  for (const text of ["Rolling window duration", "Confirmation traveled distance", "Last traveled distance", "Minimum distance during episode", "Distance threshold", "60 minutes", "35 m", "340 m", "12 m", "300 m", "<dt>Resolved</dt>"]) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /minimum duration|stayed at/i);
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
  assert.match(styles, /grid-template-columns: minmax\(0, 1fr\); gap: 8px/);
  assert.match(source, /onClose=\{closeSelection\}/);
  assert.match(source, /reason === "user" \|\| reason === "popstate"/);
  assert.match(source, /<button type="button" className="events-item" aria-pressed/);
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

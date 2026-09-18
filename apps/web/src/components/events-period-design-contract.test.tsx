import "../test-setup-alias";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Button, Popover, theme } from "antd";
import { PeriodPopover } from "./period-popover";
import { MESSAGE_CATALOG } from "../i18n/messages";
import { EventDetail } from "./event-detail";
import { I18nProvider } from "../i18n/client";
import { AuthProvider } from "./auth-provider";
import { alertEventsListFixture } from "../lib/alert-events/alert-events-fixture";
import type { AlertEvent } from "../lib/alert-events/alert-events-contract";

const source = readFileSync("src/components/events-client.tsx", "utf8");
const period = source.slice(source.indexOf("function EventsPeriod"));

test("Events uses the accepted period shell, sections, filled selection and bounded picker", () => {
  for (const name of ["PeriodPopover", "vehicle-trips__period-editor", "vehicle-trips__editor-label", "vehicle-trips__preset-group-title", "vehicle-trips__preset-grid--3col", "vehicle-trips__editor-divider", "vehicle-trips__custom-range", "vehicle-trips__range-fields", "vehicle-trips__range-picker", "vehicle-trips__range-help", "vehicle-trips__show-period", "vehicle-trips__period-trigger-copy", "vehicle-trips__period-chevron"]) assert.ok(period.includes(name), name);
  assert.match(period, /\["24h", "7d", "30d"\] as const/);
  assert.match(period, /variant=\{filters.period === period \? "filled" : "outlined"\}/);
  assert.match(period, /onApply\(alertEventsPreset\(period\)\)/);
  assert.match(period, /filters.period \?\? "7d"/);
  assert.match(period, /kyivLocalToAbsolute\(draft.from\)/);
  assert.match(period, /kyivLocalToAbsolute\(draft.to\)/);
  assert.match(period, /onApply\(\{ from: from.instant!, to: to.instant!, period: "custom" \}\)/);
  assert.doesNotMatch(period, /allowEmpty|openEnded|TODAY|YESTERDAY|3d/);
  assert.match(period, /Europe\/Kyiv/);
  assert.match(period, /htmlType="submit"/);
});

test("shared shell preserves accepted Vehicle-family props, trigger markup and consumer content ownership", () => {
  const shell = readFileSync("src/components/period-popover.tsx", "utf8");
  assert.match(shell, /trigger="click" placement="bottomLeft" arrow=\{false\} destroyOnHidden fresh/);
  assert.match(shell, /width = 620/);
  assert.match(shell, /width, maxWidth: "calc\(100vw - 48px\)", padding: token.paddingLG, borderRadius: token.borderRadiusLG/);
  for (const family of ["trips", "track"]) {
    const vehicle = readFileSync(`src/components/vehicle-${family}-client.tsx`, "utf8");
    assert.match(vehicle, /<PeriodPopover open=\{editorOpen\} onOpenChange=\{setEditorOpen\}/);
    assert.match(vehicle, /content=\{periodEditor\}/);
    assert.ok(vehicle.includes(`className="vehicle-${family}__period-popover"`));
    assert.ok(vehicle.includes(`aria-controls="vehicle-${family}-custom-range"`));
  }
  function AcceptedShell() {
    const { token } = theme.useToken();
    return <Popover open={false} onOpenChange={() => {}} trigger="click" placement="bottomLeft" arrow={false} destroyOnHidden fresh title="Period" content="Editor" classNames={{ root: "vehicle-trips__period-popover" }} styles={{ container: { width: 620, maxWidth: "calc(100vw - 48px)", padding: token.paddingLG, borderRadius: token.borderRadiusLG } }}><Button size="large">Period</Button></Popover>;
  }
  assert.equal(renderToStaticMarkup(<PeriodPopover open={false} onOpenChange={() => {}} title="Period" content="Editor" className="vehicle-trips__period-popover"><Button size="large">Period</Button></PeriodPopover>), renderToStaticMarkup(<AcceptedShell />));
});

test("filter controls and right-aligned actions own separate responsive regions without changing Fleet Reset", () => {
  const css = readFileSync("src/styles/events.css", "utf8");
  assert.match(css, /events-toolbar\.fleet-toolbar \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto/);
  assert.match(css, /events-filter-controls \{[^}]*grid-template-columns: repeat\(3, minmax\(180px, 260px\)\)/);
  assert.match(css, /events-filter \{[^}]*grid-template-rows: auto var\(--control-height-default\)/);
  assert.match(css, /events-filter-utility \{[^}]*grid-template-rows: auto var\(--control-height-default\)/);
  assert.match(css, /events-filter--group \{ grid-column: 1 \/ -1; \}/);
  assert.match(css, /events-filter-utility \{ display: flex; justify-content: space-between/);
  assert.match(source, /<FleetFilterResetButton disabled=\{filterCount === 0\}/);
});

test("UK RU EN operational detail labels own one colon; headings and form labels remain unpunctuated", () => {
  const keys = ["events.table.opened", "events.lastObserved", "events.table.resolved", "events.zone", "events.threshold", "events.confirmationSpeed", "events.lastSpeed", "events.peakSpeed", "events.window", "events.distanceThreshold", "events.confirmationDistance", "events.lastDistance", "events.minimumDistance"] as const;
  const untouched = ["events.title", "events.lifecycle", "events.evidence", "events.investigate", "events.filters.type", "events.table.vehicle", "events.type.SPEEDING", "events.type.INACTIVITY"] as const;
  for (const locale of ["uk", "ru", "en"] as const) {
    for (const key of keys) assert.match(MESSAGE_CATALOG[key][locale], /[^:]:$/, `${locale}:${key}`);
    for (const key of untouched) assert.doesNotMatch(MESSAGE_CATALOG[key][locale], /:$/, `${locale}:${key}`);
    const speeding = alertEventsListFixture.items[0];
    const inactivity: AlertEvent = { ...speeding, type: "INACTIVITY", status: "RESOLVED", resolvedAt: speeding.lastObservedAt, details: { durationThresholdMinutes: 60, distanceThresholdMeters: 300, confirmationDistanceMeters: 35, lastDistanceMeters: 350, minimumDistanceMeters: 12 } };
    for (const event of [speeding, inactivity]) {
      const html = renderToStaticMarkup(<I18nProvider locale={locale}><AuthProvider user={{ id: "test", login: "test", role: "ADMIN", permissions: [], mustChangePassword: false }}><EventDetail event={event} now={new Date("2026-09-07T12:00:00Z")} onClose={() => {}} /></AuthProvider></I18nProvider>);
      for (const label of html.matchAll(/<dt>(.*?)<\/dt>/g)) assert.match(label[1], /[^:]:$/);
      for (const heading of html.matchAll(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/g)) assert.doesNotMatch(heading[1], /:$/);
    }
  }
});

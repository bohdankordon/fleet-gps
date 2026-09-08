import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n/client";
import { AuthProvider } from "./auth-provider";
import { FleetActivityReportWorkspace, ReportsLoading } from "./fleet-activity-report-client";
import { ReportResults, ReportRowFacts, ReportActions } from "./report-results";
import { ReportPolicyContent, ReportSummary } from "./report-context";
import { ReportPeriod } from "./report-period";
import { fleetActivityReportFixture } from "../lib/fleet-activity-report/fleet-activity-report-fixture";
import { MESSAGE_CATALOG } from "../i18n/messages";
import type { AppLocale } from "../i18n/locales";
import type { AuthUser } from "../lib/auth/auth-contract";
const data = fleetActivityReportFixture();
const admin: AuthUser = { id: "u", login: "u", role: "ADMIN", permissions: [], mustChangePassword: false };
const noop = () => {};
const props = { initialData: data, initialDate: "2026-08-10", initialRange: { from: data.from, to: data.to }, initialError: null, now: data.generatedAt, timezone: data.timezone, pending: false, onDate: noop, onRefresh: noop };
const source = readFileSync("src/components/fleet-activity-report-client.tsx", "utf8");
const results = readFileSync("src/components/report-results.tsx", "utf8");
const period = readFileSync("src/components/report-period.tsx", "utf8");
const css = readFileSync("src/styles/reports.css", "utf8");
const render = (node: React.ReactNode, locale: AppLocale = "en") => renderToStaticMarkup(<I18nProvider locale={locale}><AuthProvider user={admin}>{node}</AuthProvider></I18nProvider>);

test("localized compact heading, daily context, global summary and controls use accepted grammar", () => {
  for (const locale of ["uk", "ru", "en"] as const) {
    const html = render(<FleetActivityReportWorkspace {...props} />, locale);
    for (const key of ["reports.title", "reports.description", "reports.gps", "reports.search", "reports.reset"] as const) assert.ok(html.includes(MESSAGE_CATALOG[key][locale]), key);
    assert.match(html, /<h1/); assert.match(html, /reports-summary/); assert.match(html, /Europe\/Kyiv/);
  }
  for (const name of ["CompactPageHeading", "StableLoadingButton", "FleetFilterResetButton"]) assert.ok(source.includes(name));
  assert.doesNotMatch(source + results + period, /stopsFive|5\+|reports.export|chart|ECharts|Recharts|\/events/);
  assert.doesNotMatch(css, /\.ant-/); assert.match(css, /reports-facts \{ display: block/);
});
test("period presents actual calendar boundary and owns only Today Yesterday and calendar day", () => {
  const html = render(<ReportPeriod date="2026-08-10" range={data} now={data.generatedAt} timezone={data.timezone} pending={false} onDate={noop} />);
  assert.match(html, /10 August 2026/); assert.match(html, /00:00/); assert.ok(html.includes("11/08")); assert.match(html, /Europe\/Kyiv/);
  for (const name of ["PeriodPopover", "currentBusinessDate", "previousBusinessDate", "DatePicker", 'htmlFor="reports-calendar-day"']) assert.ok(period.includes(name));
  assert.doesNotMatch(period, /24h|7d|30d|RangePicker|datetime-local/);
  const navigation = readFileSync("src/components/report-navigation.tsx", "utf8");
  assert.match(navigation, /router.refresh\(\)/); assert.match(navigation, /router.push\(fleetActivityReportDateHref\(date\)/);
});
test("desktop table is comparative with aligned metrics and missing GPS dashes", () => {
  const html = render(<ReportResults data={data} rows={data.vehicles} user={admin} desktop sort="distance" onSort={noop} onSelect={noop} />);
  assert.match(html, /<table/); assert.match(html, /reports-table/); assert.match(html, /text-align:right/);
  assert.match(html, /GPS observations: 20/); assert.match(html, /No GPS data/);
  assert.ok((html.match(/>—<\/td>/g) ?? []).length >= 5);
  assert.match(results, /sticky=\{\{ offsetHeader: 0 \}\}/); assert.match(results, /pagination=\{false\}/);
  assert.match(css, /font-variant-numeric: tabular-nums/);
});
test("observed zero and no observations stay visually distinct in row facts", () => {
  const zero = { ...data.vehicles[0]!, observedDistanceMeters: 0, tripCount: 0, tripDurationSeconds: 0, stopCount: 0, stopDurationSeconds: 0, gapCount: 0, gapDurationSeconds: 0 };
  const html = render(<ReportRowFacts row={zero} data={data} />);
  assert.match(html, /0 m/); assert.match(html, /0 s/); assert.doesNotMatch(html, /No GPS data/);
  const missing = render(<ReportRowFacts row={data.vehicles[1]!} data={data} />);
  assert.match(missing, /No GPS data/); assert.doesNotMatch(missing, /0 m|0 s/);
  assert.equal((missing.match(/<dd>—<\/dd>/g) ?? []).length, 10);
});
test("mobile list uses native selection buttons and drawer exposes all contextual facts and actions", () => {
  const html = render(<ReportResults data={data} rows={data.vehicles} user={admin} desktop={false} sort="distance" onSort={noop} onSelect={noop} />);
  assert.doesNotMatch(html, /<table/); assert.match(html, /reports-comparison-list/); assert.match(html, /<button type="button" class="reports-comparison-row__select"/);
  const facts = render(<ReportRowFacts row={data.vehicles[0]!} data={data} />);
  for (const label of ["First observation", "Last observation", "GPS observations", "GPS gap duration", "Stop time"]) assert.ok(facts.includes(label));
  assert.match(source, /<Drawer/); assert.match(source, /trap: true, focusTriggerAfterClose: false/); assert.ok(source.includes("trigger.current.focus({ preventScroll: true })"));
  assert.match(source, /desktop=\{!!screens.lg\}/); assert.match(source, /ReportRowFacts/);
});
test("reports-only users keep vehicle identity but no restricted links", () => {
  const user: AuthUser = { ...admin, role: "USER", permissions: ["reports.view"] };
  const html = render(<ReportResults data={data} rows={data.vehicles} user={user} desktop={false} sort="distance" onSort={noop} onSelect={noop} />);
  assert.match(html, /Taxi A/); assert.doesNotMatch(html, /href=/);
  const actions = render(<ReportActions row={data.vehicles[0]!} data={data} user={admin} expanded />);
  for (const text of ["Movement history", "Current position", "Trips", "Vehicle"]) assert.ok(actions.includes(text));
  assert.doesNotMatch(actions, /Events/);
});
test("policy info exposes exact current thresholds, generation time and timezone without internal keys", () => {
  const custom = { ...data, policy: { ...data.policy, tripStopConfirmationSeconds: 301, tripDataGapSeconds: 420 } };
  const html = render(<ReportPolicyContent data={custom} />);
  for (const text of ["Adjacent observations more than 7 min apart", "301 s", "7 min", "Europe/Kyiv", "Generated", "currently stored observations", "period end is excluded"]) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /tripStopConfirmationSeconds|application_setting/);
  const summary = render(<ReportSummary data={data} />);
  assert.doesNotMatch(summary, /Entire fleet · selected day/); assert.match(summary, /aria-describedby="reports-summary-scope"/); assert.match(summary, /at least one stored GPS observation/); assert.doesNotMatch(summary, /%/);
});
test("empty fleet, all-no-GPS, failure and pending states tell different truths", () => {
  const empty = { ...data, vehicles: [], summary: { vehicleCount: 0, vehiclesWithGps: 0, vehicleWithoutGpsCount: 0, tripCount: 0, totalObservedDistanceMeters: 0, totalTripDurationSeconds: 0, gapCount: 0, totalGapDurationSeconds: 0 } };
  assert.match(render(<FleetActivityReportWorkspace {...props} initialData={empty} />), /fleet has no vehicles yet/);
  const missing = { ...empty, vehicles: [data.vehicles[1]!], summary: { ...empty.summary, vehicleCount: 1, vehicleWithoutGpsCount: 1 } };
  assert.match(render(<FleetActivityReportWorkspace {...props} initialData={missing} />), /No stored GPS observations for the selected day/);
  assert.match(render(<FleetActivityReportWorkspace {...props} initialData={null} initialError="report" />), /report could not be loaded/);
  assert.match(render(<FleetActivityReportWorkspace {...props} initialData={null} initialError="context" />), /timezone or period could not be resolved/);
  const pending = render(<FleetActivityReportWorkspace {...props} pending />);
  assert.match(pending, /aria-busy="true"/); assert.match(pending, /Displayed figures belong to the currently shown period/);
  assert.match(render(<ReportsLoading />), /role="status"/);
  assert.match(source, /reports.filteredEmpty/); assert.match(source, /reports.subset/);
});

test("period context owns methodology while the unified summary owns only fleet metrics", () => {
  const context = readFileSync("src/components/report-context.tsx", "utf8");
  const html = render(<FleetActivityReportWorkspace {...props} />);
  const start = html.indexOf('data-testid="reports-period-context"');
  const end = html.indexOf("</section>", start);
  assert.ok(html.slice(start, end).includes("About this calculation"));
  assert.doesNotMatch(render(<ReportSummary data={data} />), /About this calculation/);
  assert.doesNotMatch(period, /reports.reportName|reports-period__identity/);
  assert.match(context, /vehicle-trips__summary-metric/);
  assert.match(context, /vehicle-trips__summary-icon/);
  assert.match(context, /vehicle-trips__summary-content/);
  assert.match(context, /vehicle-trips__summary-value/);
});

test("one results surface owns toolbar, count, no-GPS context and comparison output", () => {
  const missing = { ...data, vehicles: [data.vehicles[1]!], summary: { ...data.summary, vehicleCount: 1, vehiclesWithGps: 0 } };
  const html = render(<FleetActivityReportWorkspace {...props} initialData={missing} />);
  const resultsStart = html.indexOf('class="reports-results"');
  const resultsEnd = html.indexOf("</section>", resultsStart);
  const workspace = html.slice(resultsStart, resultsEnd);
  for (const marker of ["reports-results__header", "reports-toolbar", "reports-results__context", "reports-result-note", "reports-list", "fleet-filter-reset"]) assert.ok(workspace.includes(marker), marker);
  assert.equal(html.indexOf("reports-result-note"), resultsStart + workspace.indexOf("reports-result-note"));
  assert.doesNotMatch(source, /reports-no-data|<Card/);
  assert.match(source, /fleet-toolbar__search/);
  assert.match(source, /SearchOutlined/);
});

test("comparison presentation uses neutral Fleet sorting and accepted operational detail rows", () => {
  assert.match(results, /bodySortBg: token.colorBgContainer/);
  assert.match(results, /headerSplitColor: "transparent"/);
  assert.match(results, /className: "reports-numeric"/);
  assert.match(results, /vehicle-overview__metric-rows/);
  assert.match(results, /vehicle-overview__metric-row/);
  assert.doesNotMatch(results + css, /severity|event-rail|colorError|colorWarning|heatmap/);
  assert.doesNotMatch(results, /<dl className="reports-comparison-row__metrics"/);
  assert.match(css, /max-width: 991px/);
  assert.match(css, /max-width: 575px/);
});
test("toolbar has no sort select, summary has exactly five metrics and scope stays in help", () => {
  const html = render(<FleetActivityReportWorkspace {...props} />);
  assert.doesNotMatch(html, /aria-label="Sort"|reports-sort|Entire fleet · selected day/);
  const summary = render(<ReportSummary data={data} />);
  assert.equal((summary.match(/<article/g) ?? []).length, 5);
  assert.doesNotMatch(summary, /reports-summary__context/);
  assert.match(render(<ReportPolicyContent data={data} />), /Filters affect this list only/);
  assert.match(source, /screens.lg \? filters : \{ \.\.\.filters, sort: "distance", direction: "descend" \}/);
});

test("daily editor consumes accepted sections, controls and a bounded optional shell width", () => {
  for (const marker of ["vehicle-trips__section-title", "CalendarOutlined", "track.controls.quick", "trips.presetGroup.calendar", "vehicle-trips__preset-button", "reports.today", "reports.yesterday", "vehicle-trips__editor-divider", "vehicle-trips__custom-range", "vehicle-trips__range-fields", "vehicle-trips__range-picker", "vehicle-trips__show-period", "vehicle-trips__range-help", "reports.calendarHelp"]) assert.ok(period.includes(marker), marker);
  assert.equal((period.match(/<DatePicker /g) ?? []).length, 1);
  assert.match(period, /htmlType="submit" size="large" type="primary" icon=\{<CalendarOutlined/);
  assert.doesNotMatch(period, /24h|3d|7d|30d|RangePicker|showTime|datetime-local/);
  assert.match(period, /width=\{520\}/);
  const shell = readFileSync("src/components/period-popover.tsx", "utf8");
  assert.match(shell, /width = 620/);
  assert.match(shell, /maxWidth: "calc\(100vw - 48px\)"/);
});

test("Refresh uses exactly Events presentation props while retaining Reports navigation", () => {
  const events = readFileSync("src/components/events-client.tsx", "utf8");
  for (const marker of ['idleLabel={t("common.refresh")}', 'loadingLabel={t("common.refreshing")}', 'icon={<ReloadOutlined aria-hidden />}', 'size="large" type="default"']) {
    assert.ok(source.includes(marker), marker);
    assert.ok(events.includes(marker), marker);
  }
  assert.doesNotMatch(source, /showLabel=/);
  assert.match(source, /onClick=\{onRefresh\}/);
});

test("default and custom headers expose one effective sort direction through AntD accessibility", () => {
  for (const [sort, direction] of [["distance", "descend"], ["trips", "descend"], ["trips", "ascend"], ["name", "ascend"], ["name", "descend"], ["stopTime", "descend"]] as const) {
    const html = render(<ReportResults data={data} rows={data.vehicles} user={admin} desktop sort={sort} direction={direction} onSort={noop} onSelect={noop} />);
    assert.ok(html.includes('aria-sort="' + (direction === "ascend" ? "ascending" : "descending") + '"'));
    assert.match(html, /tabindex="0"/);
  }
  assert.match(results, /nextReportSort/);
  assert.match(results, /bodySortBg: token.colorBgContainer/);
});

test("all summary tooltips share a neutral scoped native-button contract with visible focus", () => {
  const html = render(<ReportSummary data={data} />);
  const triggers = [...html.matchAll(/<button class="reports-info-button"[^>]*>/g)];
  assert.equal(triggers.length, 3);
  for (const [button] of triggers) {
    assert.match(button, /type="button"/);
    assert.match(button, /aria-label="[^"]+"/);
    assert.doesNotMatch(button, /tabindex="-1"/);
  }
  const context = readFileSync("src/components/report-context.tsx", "utf8");
  assert.ok(context.includes('trigger={["hover", "focus"]}'));
  assert.match(css, /\.reports-summary \.reports-info-button:hover:not\(:disabled\)[^{]*\{[^}]*background: transparent;[^}]*border: 0;[^}]*box-shadow: none/);
  assert.match(css, /\.reports-summary \.reports-info-button:focus-visible \{[^}]*outline: 2px solid[^}]*background: transparent/);
  assert.doesNotMatch(css, /ant-tooltip-open/);
  assert.equal((html.match(/<article/g) ?? []).length, 5);
});

test("calculation information has localized sections and preserves every factual context item", () => {
  for (const locale of ["uk", "ru", "en"] as const) {
    const html = render(<ReportPolicyContent data={data} />, locale);
    for (const key of ["reports.policy.analytics", "reports.policy.context", "reports.policy.important"] as const) {
      assert.ok(html.includes('<h3 class="reports-policy__heading">' + MESSAGE_CATALOG[key][locale] + "</h3>"), key);
    }
    for (const key of ["reports.speedThreshold", "reports.movementConfirmation", "reports.stopConfirmation", "reports.gapThreshold", "reports.generated", "reports.timezone", "reports.subset", "reports.policyNote", "reports.boundary", "reports.policy.intro"] as const) assert.ok(html.includes(MESSAGE_CATALOG[key][locale]), key);
    assert.equal((html.match(/<dt>/g) ?? []).length, 6);
    assert.equal((html.match(/<li>/g) ?? []).length, 4);
    assert.match(html, /Europe\/Kyiv/);
    assert.match(html, /vehicle-overview__metric-rows/);
    assert.match(html, /vehicle-overview__metric-row/);
  }
  const html = render(<ReportPolicyContent data={data} />);
  assert.match(html, /Time before the first and after the last observation is excluded/);
  const context = readFileSync("src/components/report-context.tsx", "utf8");
  assert.ok(context.includes('<h2 className="reports-policy__title">'));
  assert.ok(context.includes('width: 460, maxWidth: "calc(100vw - 48px)", maxHeight: "min(520px, 60dvh)", overflowY: "auto"'));
});

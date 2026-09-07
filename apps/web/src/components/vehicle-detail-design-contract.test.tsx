import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createTranslator } from "../i18n/core";
import { SUPPORTED_LOCALES } from "../i18n/locales";

const overview = readFileSync("src/components/vehicle-details-client.tsx", "utf8");
const shell = readFileSync("src/components/vehicle-detail-shell.tsx", "utf8");
const trips = readFileSync("src/components/vehicle-trips-client.tsx", "utf8");
const history = readFileSync("src/components/vehicle-track-client.tsx", "utf8");
const tripsPage = readFileSync("src/app/vehicles/[vehicleId]/trips/page.tsx", "utf8");
const historyPage = readFileSync("src/app/vehicles/[vehicleId]/track/page.tsx", "utf8");
const styles = readFileSync("src/styles/vehicle-details.css", "utf8");
const messages = readFileSync("src/i18n/messages.ts", "utf8");

test("shared vehicle shell uses permission-aware route Tabs without restructuring route loaders", () => {
  assert.match(shell, /<Tabs[\s\S]*activeKey=\{activeTab\}/);
  assert.match(shell, /onChange=\{\(tab\) => router\.push\(vehicleDetailRoute\(vehicleId, tab as VehicleDetailTab\)\)\}/);
  assert.match(shell, /return `\/vehicles\/\$\{vehicleId\}\/trips`/);
  assert.match(shell, /return `\/vehicles\/\$\{vehicleId\}\/track`/);
  assert.match(shell, /return `\/vehicles\/\$\{vehicleId\}`/);
  assert.match(shell, /hasPermission\(auth, "trips\.view"\)/);
  assert.match(shell, /canViewTrips \? \["overview", "trips", "history"\] : \["overview"\]/);
  assert.match(shell, /hasPermission\(auth, "map\.view"\)/);
  assert.match(shell, /href=\{fleetMapVehicleHref\(vehicleId\)\}/);
  assert.doesNotMatch(shell, /searchParams|useSearchParams/);
  assert.doesNotMatch(readFileSync("src/app/vehicles/[vehicleId]/page.tsx", "utf8"), /layout/);
});

test("all three vehicle routes reuse the shell and select one exact active route", () => {
  assert.match(overview, /<VehicleDetailShell[^>]*activeTab="overview"/);
  assert.match(trips, /<VehicleDetailShell[^>]*activeTab="trips"/);
  assert.match(history, /<VehicleDetailShell[^>]*activeTab="history"/);
  assert.match(tripsPage, /fetchVehicleDetails\(vehicleId\)/);
  assert.match(historyPage, /fetchVehicleDetails\(vehicleId\)/);
  assert.equal((trips.match(/<header className="vehicle-trips__workspace-header"/g) ?? []).length, 2);
  assert.doesNotMatch(trips, /<PageHeader|<header className="vehicle-detail/);
  assert.equal((history.match(/<header className="vehicle-track__workspace-header"/g) ?? []).length, 0);
  assert.doesNotMatch(history, /<PageHeader|<header className="vehicle-detail/);
});

test("Overview uses three equal-height native Cards and bounded Listy surfaces", () => {
  for (const component of ["Card", "Divider", "Empty", "Listy", "Tag", "Row", "Col"]) assert.match(overview, new RegExp(`\\b${component}\\b`));
  assert.match(overview, /<Row className="vehicle-overview__primary"[^>]*align="stretch"/);
  assert.match(overview, /root: \{ borderColor: token\.colorBorder,[^}]*background: token\.colorBgContainer,[^}]*boxShadow: "none"/);
  assert.match(overview, /<Col xs=\{24\} md=\{12\} xl=\{8\}><CurrentStateCard/);
  assert.match(overview, /<Col xs=\{24\} md=\{12\} xl=\{8\}><TodayCard/);
  assert.match(overview, /<Col xs=\{24\} md=\{24\} xl=\{8\}><ActiveEventsCard/);
  assert.match(overview, /<RecentEventsCard events=\{data\.recentEvents\}/);
  assert.match(overview, /<Listy className="vehicle-overview__recent-list"/);
  assert.match(overview, /items=\{\[\.\.\.events\]\} rowKey="id"/);
  assert.doesNotMatch(overview, /pagination|href=.*event|onClick=.*event/);
});

test("Current State keeps disabled, connectivity, freshness and position absence independent", () => {
  assert.match(overview, /data\.vehicle\.disabled \? <Tag>/);
  assert.match(overview, /data\.connectivity === "ONLINE"/);
  assert.match(overview, /current\.freshness === "FRESH"/);
  assert.match(overview, /current === null \? <>/);
  assert.match(overview, /message=\{t\("vehicle\.positionUnavailable"\)\}/);
  assert.match(overview, /className="vehicle-overview__compact-pair"/);
  assert.match(overview, /<span>\{connectivity\.label\}<\/span>\{connectivity\.value\}/);
  const noPositionBranch = overview.slice(overview.indexOf("current === null ? <>"), overview.indexOf("function TodayCard"));
  assert.doesNotMatch(noPositionBranch, /formatVehicleSpeed|formatVehicleTimestamp|formatVehicleAge/);
  for (const forbidden of ["fetchedAt", "fixFingerprint", "externalDeviceId", "valid", "outdated"]) assert.equal(overview.includes(forbidden), false, forbidden);
});

test("Today distinguishes missing data from zero and preserves source and quality", () => {
  assert.match(overview, /if \(today === null\) return <OverviewCard/);
  assert.match(overview, /vehicle\.todayUnavailableHelp/);
  assert.match(overview, /<NodeIndexOutlined className="vehicle-overview__primary-metric-icon" aria-hidden style=\{\{ color: token\.colorTextSecondary \}\} \/>/);
  assert.doesNotMatch(overview.match(/function TodayCard[\s\S]*?function ActiveEventsCard/)?.[0] ?? "", /CarOutlined|SwapOutlined/);
  assert.match(overview, /<div className="vehicle-overview__primary-metric">[\s\S]*<NodeIndexOutlined[\s\S]*vehicle-overview__primary-label[\s\S]*vehicle-overview__primary-value[\s\S]*<\/div>/);
  assert.match(styles, /vehicle-overview__primary-metric \{[^}]*display: grid;[^}]*grid-template-columns: 15px minmax\(0, 1fr\);/);
  assert.match(styles, /vehicle-overview__primary-label \{[^}]*grid-column: 2;[^}]*grid-row: 1;/);
  assert.match(styles, /vehicle-overview__primary-metric \.vehicle-overview__primary-value \{[^}]*grid-column: 2;[^}]*grid-row: 2;/);
  assert.match(overview, /className="vehicle-overview__primary-label">\{t\("vehicle\.todayDistance"\)\}:<\/Text>/);
  assert.match(overview, /const sectionDividerGap = token\.marginSM/);
  assert.match(overview, /<Divider className="vehicle-overview__metric-divider" style=\{\{ marginBlock: sectionDividerGap \}\} \/>/);
  assert.match(overview, /<MetricRows className="vehicle-overview__primary-rows" items=\{items\} \/>/);
  assert.match(overview, /formatVehicleDistance\(today\.distanceMeters, locale\)/);
  for (const field of ["movementDurationSeconds", "maxSpeedKph", "quality", "source", "isStale", "isDegraded"]) assert.ok(overview.includes(`today.${field}`), field);
  assert.doesNotMatch(overview, /tripCount|stopCount/);
});

test("active and recent events preserve every projected field in compact Listy surfaces", () => {
  assert.match(overview, /data\.activeAlerts\.length === 0 \? <OverviewEmptyState/);
  assert.match(overview, /items=\{\[\.\.\.data\.activeAlerts\]\}/);
  assert.match(overview, /rowKey=\{\(alert\) => alert\.type\}/);
  assert.match(overview, /styles=\{\{ item: \{ borderBlockEnd: 0 \} \}\}/);
  assert.match(overview, /index < data\.activeAlerts\.length - 1 \? <Divider className="vehicle-overview__active-separator"/);
  const activeEventsSeparatorCount = (eventCount: number) => Array.from({ length: eventCount }, (_, index) => index < eventCount - 1).filter(Boolean).length;
  assert.equal(activeEventsSeparatorCount(0), 0);
  assert.equal(activeEventsSeparatorCount(1), 0);
  assert.equal(activeEventsSeparatorCount(2), 1);
  for (const field of ["openedAt", "resolvedAt", "notificationDeliveryStatus", "zone", "confirmationSpeedKph", "lastSpeedKph", "peakSpeedKph", "thresholdKph", "confirmationDistanceMeters", "lastDistanceMeters", "minimumDistanceMeters", "distanceThresholdMeters", "durationThresholdMinutes"]) assert.ok(overview.includes(field), field);
  const recentItem = overview.slice(overview.indexOf("function RecentEventItem"));
  assert.equal((recentItem.match(/<Card/g) ?? []).length, 0);
  assert.match(recentItem, /eventSemanticPresentation\(event, token\)/);
  assert.match(recentItem, /const lifecycleItems:[\s\S]*key: "opened"[\s\S]*key: "resolved"[\s\S]*key: "delivery"/);
  assert.match(recentItem, /<MetricRows className="vehicle-overview__event-lifecycle" items=\{lifecycleItems\} \/>/);
  assert.match(recentItem, /<Divider className="vehicle-overview__event-section-divider" style=\{\{ marginBlock: sectionDividerGap \}\} \/>/);
  assert.match(recentItem, /<MetricRows className="vehicle-overview__event-details" items=\{detailItems\} \/>/);
  assert.doesNotMatch(recentItem, /Descriptions|Table|MapLibre|eventLocation|locationMap/);
});

test("Refresh preserves single-flight, auto-refresh, last-good fallback and stable button geometry", () => {
  assert.match(overview, /if \(active\.current\) return/);
  assert.match(overview, /window\.setInterval\(\(\) => void refresh\(\), 30_000\)/);
  assert.match(overview, /failVehicleDetailsRefresh\(stateRef\.current, generation\)/);
  assert.match(overview, /<StableLoadingButton[^>]*loading=\{state\.loading\}/);
  assert.match(overview, /type="primary"/);
  assert.match(shell, /<Button type="default" size="large" href=\{fleetMapVehicleHref\(vehicleId\)\}/);
});

test("copy is complete in UK, RU and EN and component structure owns colons", () => {
  const keys = ["vehicle.eyebrow", "vehicle.overview", "vehicle.connectivity", "vehicle.connectivity.ONLINE", "vehicle.connectivity.OFFLINE", "vehicle.connectivity.UNKNOWN", "vehicle.disabled", "vehicle.positionUnavailable", "vehicle.todayUnavailable", "vehicle.todayUnavailableHelp", "vehicle.noActiveEvents", "vehicle.noRecentEvents", "vehicle.eventDelivery", "vehicle.eventLastSpeed", "vehicle.eventLastDistance"] as const;
  for (const key of keys) for (const locale of SUPPORTED_LOCALES) assert.ok(createTranslator(locale)(key).length > 1, `${locale}:${key}`);
  for (const key of ["vehicle.generated", "vehicle.connectivity", "vehicle.positionStatus", "vehicle.speed", "vehicle.positionTime", "vehicle.positionAge", "vehicle.source", "vehicle.eventOpened", "vehicle.eventResolved", "vehicle.eventDelivery"] as const) {
    for (const locale of SUPPORTED_LOCALES) assert.equal(createTranslator(locale)(key).includes(":"), false, `${locale}:${key}`);
  }
  assert.match(shell, /\{t\("vehicle\.generated"\)\}: <Text strong>/);
  assert.match(overview, /label: `\$\{t\("vehicle\.connectivity"\)\}:`/);
  assert.doesNotMatch(messages, /vehicle\.generated": \{[^\n]*: "[^"]*:/);
});

test("Vehicle Detail uses only approved icons and application-owned CSS", () => {
  for (const icon of ["CarOutlined", "EnvironmentOutlined", "ReloadOutlined", "AimOutlined", "BarChartOutlined", "NodeIndexOutlined", "AlertOutlined", "HistoryOutlined"]) assert.ok((shell + overview).includes(icon), icon);
  assert.doesNotMatch(overview, /SwapOutlined/);
  assert.doesNotMatch(shell + overview, /[🚗📍📊⚠️🔄]/u);
  assert.doesNotMatch(styles, /\.ant-/);
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}/i);
  for (const hook of ["vehicle-detail-shell__header", "vehicle-detail-shell__tabs", "vehicle-overview__primary", "vehicle-overview__recent"]) assert.ok(styles.includes(hook), hook);
});

test("Overview owns centered vertical metric rows, chronology, and one empty-state hierarchy", () => {
  assert.match(overview, /function MetricRows/);
  assert.match(overview, /className="vehicle-overview__metric-row"/);
  assert.match(styles, /vehicle-overview__metric-row \{[^}]*display: grid;[^}]*align-items: center;/);
  const metricRowRule = styles.match(/\.vehicle-overview__metric-row \{[^}]*\}/)?.[0] ?? "";
  assert.doesNotMatch(metricRowRule, /(?<!-)height:/);
  assert.match(overview, /key: "resolved"[\s\S]*event\.resolvedAt \? <time[\s\S]*<Text type="secondary">—<\/Text>/);
  assert.match(overview, /className=\{`vehicle-overview__chronology-item\$\{showDivider \? " vehicle-overview__chronology-item--connected" : ""\}`\} style=\{sectionStyle\}/);
  assert.match(overview, /className="vehicle-overview__chronology-line"/);
  assert.match(overview, /showDivider=\{index < events\.length - 1\}/);
  assert.match(overview, /styles=\{\{ item: \{ borderBlockEnd: 0, padding: 0, backgroundColor: "transparent" \} \}\}/);
  assert.doesNotMatch(overview, /<Divider className="vehicle-overview__event-divider"/);
  assert.match(overview, /"--vehicle-event-section-bg": token\.colorFillQuaternary/);
  assert.match(overview, /"--vehicle-event-section-accent": semanticAccent/);
  assert.match(overview, /"--vehicle-event-section-radius": `\$\{token\.borderRadiusLG\}px`/);
  assert.match(overview, /const \{ accent: semanticAccent, marker, statusColor \} = eventSemanticPresentation\(event, token\)/);
  assert.match(styles, /vehicle-overview__chronology-item::before \{[^}]*width: 2px;[^}]*background: var\(--vehicle-event-section-accent\);/);
  assert.match(styles, /vehicle-overview__chronology-item:hover \{ background: color-mix\(in srgb, var\(--vehicle-event-section-accent\) 2%, var\(--vehicle-event-section-bg\)\); \}/);
  assert.match(styles, /vehicle-overview__chronology-icon \{[^}]*background: transparent;/);
  assert.doesNotMatch(styles, /vehicle-overview__chronology-item[^}]*box-shadow/);
  const hoverRule = styles.match(/\.vehicle-overview__chronology-item:hover \{[^}]*\}/)?.[0] ?? "";
  assert.doesNotMatch(hoverRule, /transform|padding|margin|border|width|height/);
  assert.equal((overview.match(/<OverviewCard className="vehicle-overview__recent"/g) ?? []).length, 1);
  assert.equal((overview.match(/<Card/g) ?? []).length, 1);
  assert.equal((overview.match(/function OverviewEmptyState/g) ?? []).length, 1);
  assert.equal((overview.match(/<Empty/g) ?? []).length, 1);
  assert.doesNotMatch(messages, /"vehicle\.todayDistance": \{[^\n]*: "[^"]*:/);
});

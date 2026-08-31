import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboard = readFileSync("src/components/dashboard-client.tsx", "utf8");
const fleetOverviewModel = readFileSync("src/components/fleet-overview-model.ts", "utf8");
const scheduler = readFileSync("src/components/scheduler-status.tsx", "utf8");
const stableLoadingButton = readFileSync("src/components/stable-loading-button.tsx", "utf8");
const styles = readFileSync("src/styles/dashboard.css", "utf8");
const messages = readFileSync("src/i18n/messages.ts", "utf8");

test("Fleet uses native Ant Design controls while preserving the dashboard request and URL contract", () => {
  for (const component of ["Table", "Listy", "Card", "Statistic", "Input", "Select", "Checkbox", "Button", "Alert", "Empty", "Grid"]) assert.match(dashboard, new RegExp(`\\b${component}\\b`));
  assert.match(dashboard, /<Input className="fleet-toolbar__search"/);
  assert.match(dashboard, /size="large" styles=\{\{ root: \{ height: token\.controlHeightLG \}, input: \{ minHeight: 0 \} \}\} aria-label=\{t\("dashboard\.filters\.search"\)\}/);
  assert.match(dashboard, /prefix=\{<SearchOutlined \/>\}/);
  assert.match(dashboard, /onChange=\{\(event\) => onSet\("search", event\.target\.value \|\| undefined\)\}/);
  assert.doesNotMatch(dashboard, /Input\.Search/);
  assert.match(dashboard, /setTimeout\(\(\) => \{ void request\(query, "user"\); \}, 300\)/);
  assert.match(dashboard, /controller\.current\?\.abort\(\)/);
  assert.match(dashboard, /window\.history\.pushState/);
  assert.match(dashboard, /dashboardHistoryPath\(next\)/);
  assert.match(dashboard, /window\.addEventListener\("popstate"/);
  assert.match(dashboard, /request\(restored, "popstate"\)/);
  assert.match(dashboard, /cache: "no-store"/);
});

test("Fleet desktop table and mobile list preserve operational data without pagination or row selection", () => {
  assert.match(dashboard, /<Table<Vehicle>/);
  assert.match(dashboard, /rowKey="id"/);
  assert.match(dashboard, /pagination=\{false\}/);
  assert.doesNotMatch(dashboard, /rowSelection=/);
  assert.match(dashboard, /size="middle"/);
  assert.match(dashboard, /scroll=\{\{ x: 960 \}\}/);
  assert.match(dashboard, /Grid\.useBreakpoint\(\)/);
  assert.match(dashboard, /<FleetMobileList/);
  assert.match(dashboard, /<Listy<Vehicle>/);
  for (const value of ["dashboard.table.gps", "dashboard.mobile.speed", "dashboard.mobile.distance", "dashboard.table.sourceQuality", "dashboard.table.activity", "dashboard.emptyFleetTitle", "dashboard.emptyTitle"]) assert.ok(dashboard.includes(`t("${value}")`));
  assert.ok((dashboard.match(/href=\{`\/vehicles\/\$\{vehicle\.id\}`\}/g) ?? []).length >= 2);
});

test("Fleet scheduler is collapsed by default, expands for degraded status, and retains all diagnostics without repeating generated time", () => {
  for (const component of ["Collapse", "Badge", "Alert", "Descriptions", "Grid", "Row", "Col", "StableLoadingButton"]) assert.match(scheduler, new RegExp(`\\b${component}\\b`));
  assert.match(scheduler, /fetch\("\/api\/system\/sync-status", \{ cache: "no-store", signal: abort\.signal \}\)/);
  assert.match(scheduler, /controller\.current\?\.abort\(\)/);
  assert.match(scheduler, /useState<string\[\]>\(initialStatus \? \[\] : \["details"\]\)/);
  assert.match(scheduler, /setActiveKeys\(\["details"\]\)/);
  assert.match(scheduler, /extra: refreshAction/);
  assert.match(scheduler, /idleLabel=\{t\("scheduler\.refresh"\)\} loadingLabel=\{t\("scheduler\.refreshing"\)\}/);
  assert.match(scheduler, /loading=\{loading\}/);
  assert.match(scheduler, /styles=\{\{ header: \{ alignItems: "center" \}/);
  assert.doesNotMatch(scheduler, /scheduler\.generated\)\}: \{formatSchedulerTimestamp\(status\.generatedAt/);
  for (const label of ["scheduler.started", "scheduler.fleetInterval", "scheduler.distanceInterval", "scheduler.generated", "scheduler.lastAttempt", "scheduler.lastSuccess", "scheduler.lastFailure", "scheduler.failureCategory", "scheduler.consecutiveFailures", "scheduler.successfulRuns", "scheduler.failedRuns", "scheduler.skippedOverlaps"]) assert.ok(scheduler.includes(`t("${label}")`), label);
  assert.match(scheduler, /schedulerStateLabel\(status, locale\)/);
});

test("Fleet keeps one collapsible filter surface below the summary and directly above its results", () => {
  for (const control of ["<Input", "<Select", "<Checkbox", "<StableLoadingButton", "type=\"primary\""]) assert.ok(dashboard.includes(control), control);
  assert.equal((dashboard.match(/function FleetToolbar/g) ?? []).length, 1);
  assert.ok(dashboard.indexOf("<Summary data={data} />") < dashboard.indexOf("<FleetToolbar query={query}"));
  assert.ok(dashboard.indexOf("<FleetToolbar query={query}") < dashboard.indexOf("{screens.md ? <Table<Vehicle>"));
  assert.match(dashboard, /<section className="fleet-toolbar" aria-label=/);
  assert.match(dashboard, /import \{[^}]*\bCollapse\b/);
  assert.match(dashboard, /useState<string\[\]>\(\[\]\)/);
  assert.match(dashboard, /<Collapse ghost size="small" activeKey=\{activeKeys\}/);
  assert.match(dashboard, /items=\{\[\{ key: "filters", label: filterHeader, extra: reset, children: filters \}\]\}/);
  assert.match(dashboard, /const reset = <Button size="small" styles=\{\{ root: \{ minHeight: 0 \} \}\} disabled=\{activeFilterCount === 0\}/);
  assert.doesNotMatch(dashboard, /const reset = activeFilterCount > 0 \?/);
  assert.doesNotMatch(dashboard, /<Button type="link"[^>]*>\{t\("dashboard\.toolbar\.resetFilters"\)\}/);
  assert.match(dashboard, /event\.stopPropagation\(\); onResetFilters\(\);/);
  assert.match(dashboard, /activeFilterCount = Number\(Boolean\(query\.status\)\) \+ Number\(Boolean\(query\.activity\)\) \+ Number\(query\.includeDisabled === false\)/);
  assert.match(dashboard, /const resetFilters = \(\) => setQuery\(\(current\) => \(\{ \.\.\.current, status: undefined, activity: undefined, includeDisabled: true \}\)\);/);
  assert.match(dashboard, /onResetFilters=\{resetFilters\}/);
  assert.doesNotMatch(dashboard, /dashboard\.toolbar\.list/);
  for (const label of ["dashboard.toolbar.filters", "dashboard.filters.status", "dashboard.filters.activity", "dashboard.sort.label"]) assert.ok(dashboard.includes(`t("${label}")`), label);
  for (const label of ["dashboard.filters.status", "dashboard.filters.activity", "dashboard.sort.label"]) assert.ok(dashboard.includes(`fieldLabel={t("${label}")}`), label);
  assert.match(dashboard, /labelRender=\{\(\{ label \}\) => <>\{fieldLabel\}: \{label\}<\/>\}/);
  assert.doesNotMatch(dashboard, /ToolbarSelectField|fleet-toolbar__field|dashboard\.toolbar\.view/);
  assert.match(dashboard, /<Checkbox aria-label=\{t\("dashboard\.filters\.showDisabledAria"\)\} styles=\{\{ root: \{ gap: 0, fontWeight: 400 \}, icon: \{ overflow: "clip" \} \}\} checked=\{query\.includeDisabled !== false\}/);
  assert.match(dashboard, />\{t\("dashboard\.filters\.showDisabled"\)\}<\/Checkbox>/);
  assert.match(dashboard, /className="fleet-toolbar__search" size="large"/);
  assert.match(dashboard, /options\.map\(\(option\) => <span key=\{option\.value\}>\{fieldLabel\}: \{option\.label\}<\/span>\)/);
  assert.match(dashboard, /popupMatchSelectWidth labelRender=/);
  assert.match(dashboard, /styles=\{\{ input: \{ minHeight: 0, outline: "none", boxShadow: "none", transition: "none" \} \}\}/);
  assert.match(dashboard, /<Select className="fleet-toolbar__select-control" size="large"/);
  for (const option of ["online", "offline", "unknown", "below_threshold", "normal", "no_data", "freshness", "speed"]) assert.ok(dashboard.includes(`value: "${option}"`), option);
  assert.match(dashboard, /sortFleetVehicles\(data\.vehicles, sort, locale\)/);
  assert.match(fleetOverviewModel, /export type FleetSort = "name" \| "freshness" \| "speed"/);
  assert.match(fleetOverviewModel, /Sorting is intentionally local: filtering and authorization remain server-owned/);
});

test("Fleet and scheduler use only the final stable text-changing loading button", () => {
  assert.equal((dashboard.match(/<StableLoadingButton/g) ?? []).length, 1);
  assert.equal((scheduler.match(/<StableLoadingButton/g) ?? []).length, 1);
  assert.match(dashboard, /idleLabel=\{t\("common\.refresh"\)\} loadingLabel=\{t\("common\.refreshing"\)\} loading=\{loading\}/);
  assert.match(dashboard, /onClick=\{onRefresh\} size="large" type="primary"/);
  assert.match(stableLoadingButton, /const idleContent = showLabel \? idleLabel : null/);
  assert.match(stableLoadingButton, /const loadingContent = showLabel \? loadingLabel : null/);
  assert.equal((stableLoadingButton.match(/stable-loading-button__sizer/g) ?? []).length, 2);
  assert.match(stableLoadingButton, /icon=\{<LoadingOutlined \/>\}>\{loadingContent\}/);
  assert.match(stableLoadingButton, /loading=\{loading\} aria-busy=\{loading\} aria-live="polite"/);
  assert.match(stableLoadingButton, />\{loading \? loadingContent : idleContent\}<\/Button>/);
  for (const source of [dashboard, stableLoadingButton, styles, messages]) assert.doesNotMatch(source, /RefreshVariant|Segmented|refreshLab|fleet-refresh-crossfade|fleet-refresh-external|fleet-refresh-lab/);
});

test("Fleet keeps every accepted KPI metric and table presentation", () => {
  assert.match(dashboard, /<Row gutter=\{\[16, 16\]\}>/);
  assert.match(dashboard, /className="fleet-summary-card"/);
  assert.match(dashboard, /title=\{t\("dashboard\.summary\.total"\)\}/);
  assert.match(dashboard, /title=\{title\}/);
  assert.match(dashboard, /justify="space-between"/);
  assert.match(dashboard, /\{metric\.label\}:/);
  for (const group of ["dashboard.summary.connection", "dashboard.summary.gps", "dashboard.summary.distance"]) assert.ok(dashboard.includes(`t("${group}")`), group);
  for (const metric of ["dashboard.summary.total", "dashboard.summary.online", "dashboard.summary.offline", "dashboard.summary.fresh", "dashboard.summary.stale", "dashboard.summary.unknown", "dashboard.summary.missing", "dashboard.summary.belowMinimum", "dashboard.summary.withoutDistance"]) assert.ok(dashboard.includes(`t("${metric}")`), metric);
  assert.match(dashboard, /vehicle\.dailyDistanceSource === null && vehicle\.dailyDistanceQuality === null/);
  assert.doesNotMatch(dashboard, /dashboard\.eyebrow/);
});

test("Fleet metadata owns punctuation and one fixed generated timestamp", () => {
  for (const key of ["serviceDate", "timezone", "vehicles", "generated"]) assert.doesNotMatch(messages, new RegExp(`dashboard\\.metadata\\.${key}": \\{[^\\n]*: "[^"]*:`));
  assert.match(dashboard, /function MetadataItem/);
  assert.match(dashboard, /\{label\}: <Text strong>/);
  assert.match(dashboard, /formatFleetServiceDate\(data\.serviceDate, locale\)/);
  assert.match(dashboard, /formatFleetMetadataTimestamp\(data\.generatedAt, data\.timezone, locale\)/);
  assert.equal((dashboard.match(/formatFleetMetadataTimestamp/g) ?? []).length, 2);
});

test("Fleet toolbar copy owns one colon and keeps the approved filter labels", () => {
  assert.doesNotMatch(messages, /dashboard\.toolbar\.list/);
  assert.doesNotMatch(messages, /dashboard\.toolbar\.view/);
  assert.doesNotMatch(messages, new RegExp(`dashboard\\.toolbar\\.filters": \\{[^\\n]*: "[^"]*:`));
  for (const key of ["status", "activity"]) assert.doesNotMatch(messages, new RegExp(`dashboard\\.filters\\.${key}": \\{[^\\n]*: "[^"]*:`));
  assert.doesNotMatch(messages, /dashboard\.sort\.label": \{[^\n]*: "[^"]*:/);
  assert.match(messages, /"dashboard\.filters\.showDisabled": \{ ru: "Показывать отключённые", uk: "Показувати вимкнені", en: "Show disabled" \}/);
  assert.match(messages, /"dashboard\.filters\.showDisabledAria": \{ ru: "Показывать отключённые автомобили", uk: "Показувати вимкнені автомобілі", en: "Show disabled vehicles" \}/);
  assert.match(dashboard, /<Checkbox[^>]*>[\s\S]*t\("dashboard\.filters\.showDisabled"\)[\s\S]*<\/Checkbox>/);
  for (const copy of [
    '"dashboard.filters.activity": { ru: "Минимальный пробег", uk: "Мінімальний пробіг", en: "Minimum distance" }',
    '"dashboard.toolbar.statusAll": { ru: "Любой", uk: "Будь-який", en: "Any" }',
    '"dashboard.toolbar.activityAll": { ru: "Любой", uk: "Будь-який", en: "Any" }',
    '"dashboard.toolbar.activityBelowMinimum": { ru: "Не достигнут", uk: "Не досягнуто", en: "Not reached" }',
    '"dashboard.toolbar.activityMeetsMinimum": { ru: "Достигнут", uk: "Досягнуто", en: "Reached" }',
    '"dashboard.toolbar.activityNoData": { ru: "Нет данных", uk: "Без даних", en: "No data" }',
  ]) assert.ok(messages.includes(copy), copy);
  assert.doesNotMatch(messages, /dashboard\.toolbar\.view|dashboard\.toolbar\.refreshLab/);
});

test("Scheduler details use three native Card groups with aligned Descriptions", () => {
  assert.match(scheduler, /import \{ Alert, Badge, Card, Collapse/);
  assert.match(scheduler, /<Row gutter=\{\[16, 16\]\}>/);
  assert.match(scheduler, /<Card size="small" title=\{t\("scheduler\.overall"\)\}>/);
  assert.match(scheduler, /<Card size="small" title=\{title\} extra=\{<Badge/);
  assert.match(scheduler, /<Descriptions size="small" column=\{1\} colon/);
});

test("Fleet-specific CSS uses owned layout classes without Ant Design internals", () => {
  for (const ownedClass of ["fleet-toolbar__filters", "fleet-toolbar__filter-controls", "fleet-toolbar__list-controls", "fleet-toolbar__labeled-select", "stable-loading-button"]) assert.ok(styles.includes(ownedClass), ownedClass);
  assert.match(styles, /fleet-toolbar \{ display: grid; gap: 12px; min-width: 0; border: 1px solid; \}/);
  assert.match(styles, /fleet-toolbar__search \{ flex: 1 1 240px; min-width: 160px; \}/);
  assert.match(styles, /@media \(max-width: 575px\)/);
  assert.doesNotMatch(styles, /block-size: 36px|fleet-toolbar__zones|fleet-toolbar__intrinsic-select|fleet-refresh-/);
  assert.doesNotMatch(styles, /\.ant-/);
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}/i);
});

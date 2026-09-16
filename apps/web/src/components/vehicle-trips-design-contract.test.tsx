import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createTranslator } from "../i18n/core";
import { SUPPORTED_LOCALES } from "../i18n/locales";

const trips = readFileSync("src/components/vehicle-trips-client.tsx", "utf8");
const styles = readFileSync("src/styles/vehicle-trips.css", "utf8");
const mapStyles = readFileSync("src/styles/map.css", "utf8");
const globalStyles = readFileSync("src/app/globals.css", "utf8");
const messages = readFileSync("src/i18n/messages.ts", "utf8");
const tripContract = readFileSync("src/lib/trip-analysis/trip-analysis-contract.ts", "utf8");
const tripRange = readFileSync("src/lib/trip-analysis/trip-analysis-range.ts", "utf8");
const tripLayers = readFileSync("src/lib/trip-analysis/trip-analysis-map-layers.ts", "utf8");
const customRange = readFileSync("src/lib/vehicle-track/vehicle-track-custom-range.ts", "utf8");
const tripsPage = readFileSync("src/app/vehicles/[vehicleId]/trips/page.tsx", "utf8");

test("Trips retains the accepted shell and one native period trigger", () => {
  assert.match(trips, /<VehicleDetailShell[^>]*activeTab="trips"/);
  assert.doesNotMatch(trips, /description=\{t\("trips\.description"\)\}/);
  assert.doesNotMatch(messages, /"trips\.description"/);
  assert.equal((trips.match(/className="vehicle-trips__period-bar"/g) ?? []).length, 1);
  for (const component of ["Popover", "Button", "DatePicker", "Divider", "Empty", "Alert", "StableLoadingButton"]) assert.match(trips, new RegExp(`\\b${component}\\b`));
  assert.doesNotMatch(trips, /\bCalendar\b|\bTimePicker\b|TripDateTimeField/);
  assert.match(trips, /<PeriodPopover open=\{editorOpen\} onOpenChange=\{setEditorOpen\}/);
  assert.match(readFileSync("src/components/period-popover.tsx", "utf8"), /destroyOnHidden fresh/);
  assert.match(trips, /<Button className="vehicle-trips__period-trigger" type="default" size="large"/);
  assert.match(trips, /aria-expanded=\{editorOpen\} aria-controls="vehicle-trips-custom-range"/);
  assert.doesNotMatch(styles, /vehicle-trips__period-trigger:hover|vehicle-trips__period-trigger:focus-visible/);
  assert.match(trips, /tripAnalysisPageQuery\(nextRange, nextOpenEnded\)/);
});

test("quick periods keep the calendar/recent grouping and use supported Ant Design Button variants", () => {
  assert.match(trips, /className="vehicle-trips__presets-section"/);
  assert.equal((trips.match(/className="vehicle-trips__preset-group"/g) ?? []).length, 2);
  assert.match(trips, /role="group"/);
  assert.match(trips, /TRIP_ANALYSIS_CALENDAR_PRESETS\.map/);
  assert.match(trips, /TRIP_ANALYSIS_RECENT_PRESETS\.map/);
  assert.match(trips, /aria-pressed=\{isSelected\}/);
  assert.match(trips, /className="vehicle-trips__preset-button"/);
  assert.match(trips, /color=\{isSelected \? "primary" : "default"\}/);
  assert.match(trips, /variant=\{isSelected \? "filled" : "outlined"\}/);
  assert.match(trips, /size="middle"/);
  assert.match(styles, /\.vehicle-trips__preset-grid--2col \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
  assert.match(styles, /\.vehicle-trips__preset-grid--3col \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); \}/);
  assert.match(styles, /\.vehicle-trips__preset-button \{[^}]*width: 100%;[^}]*box-shadow: none;/);
  assert.match(styles, /\.vehicle-trips__preset-group-title \{[^}]*font-size: var\(--font-size-caption\);[^}]*font-weight: var\(--font-weight-regular\);[^}]*line-height: var\(--line-height-caption\);/);
  assert.doesNotMatch(styles, /preset-tile|preset-button--selected/);
  assert.match(trips, /const choosePreset =[^]*setFormError\(null\);[^]*loadAnalysis\(next, preset, false, true, false\)/);
});

test("one RangePicker presents 24-hour values and preserves the authoritative Kyiv parser", () => {
  assert.match(tripsPage, /initialPreset=\{resolved\.restoredFromUrl \? null : "TODAY"\}/);
  assert.match(tripsPage, /initialOpenEnded=\{resolved\.openEnded\}/);
  assert.equal((trips.match(/<DatePicker\.RangePicker/g) ?? []).length, 1);
  assert.match(trips, /allowEmpty=\{\[false, true\]\}/);
  assert.match(trips, /order=\{false\}/);
  assert.match(trips, /needConfirm/);
  assert.match(trips, /showTime=\{\{ format: "HH:mm", minuteStep: 1 \}\}/);
  assert.match(trips, /format=\{TRIP_ANALYSIS_PICKER_FORMAT\}/);
  assert.match(trips, /classNames=\{\{ popup: \{ root: "vehicle-trips__range-popup" \} \}\}/);
  assert.match(trips, /styles=\{\{ root: \{ height: token\.controlHeightLG \}, popup: \{ root: \{ maxWidth: "calc\(100vw - 48px\)", overflowX: "auto" \} \} \}\}/);
  assert.match(trips, /placeholder=\{\[t\("trips\.range\.from"\), t\("trips\.range\.to"\)\]\}/);
  assert.doesNotMatch(styles, /range-popup table|\.ant-/);
  assert.match(globalStyles, /:where\(button:not\(\[class\*="ant-"\]\)\)/);
  assert.match(globalStyles, /input:not\(\[class\*="ant-"\]\):not\(\[date-range\]\)/);
  assert.match(globalStyles, /:where\(\.table-wrap, \.events-table-container, \.admin-users-table, \.audit-table, \.admin-history-table-wrap, \.report-table-wrap\) table/);
  assert.match(tripRange, /TRIP_ANALYSIS_PICKER_FORMAT = "DD\.MM\.YYYY, HH:mm"/);
  assert.match(trips, /tripAnalysisPickerValueToCivil\(values\[0\]\)/);
  assert.match(trips, /parseVehicleTrackCustomRangeToNow\(draft, new Date\(\)\)/);
  assert.match(trips, /void loadAnalysis\(parsed\.range, null, openEnded, true, false\)/);
  assert.match(trips, /refreshOpenEndedTripAnalysisRange\(range, new Date\(\)\)/);
  assert.match(trips, /appliedOpenEnded[\s\S]*t\("trips\.range\.now"\)/);
  assert.match(customRange, /VEHICLE_TRACK_INPUT_TIMEZONE = "Europe\/Kyiv"/);
  assert.match(customRange, /getPossibleOffsets\(\)\.length > 1/);
  assert.match(customRange, /date\.toFormat\("yyyy-MM-dd'T'HH:mm"\) !== value/);
  assert.match(customRange, /parseVehicleTrackRange\(from, to\)/);
  assert.match(tripContract, /VEHICLE_TRACK_MAX_RANGE_MS/);
});

test("the unified four-metric Summary contract remains aligned and responsive", () => {
  assert.equal((trips.match(/<TripSummaryMetric/g) ?? []).length, 4);
  for (const icon of ["CarOutlined", "PauseCircleOutlined", "NodeIndexOutlined", "DisconnectOutlined"]) assert.match(trips, new RegExp(`<${icon}`));
  assert.equal((trips.match(/className="vehicle-trips__summary"/g) ?? []).length, 1);
  assert.match(trips, /<span className="vehicle-trips__summary-title">\{title\}:<\/span>/);
  assert.match(styles, /\.vehicle-trips__summary-metric \{[^}]*grid-template-columns: 20px minmax\(0, 1fr\);/);
  assert.match(styles, /\.vehicle-trips__summary-value \{[^}]*font-variant-numeric: tabular-nums;/);
  assert.match(styles, /@media \(max-width: 991px\)[\s\S]*vehicle-trips__summary \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
});

test("Chronology stays factual and selectable only for trips and stops while GPS gaps remain inert", () => {
  assert.equal((trips.match(/<header className="vehicle-trips__workspace-header/g) ?? []).length, 2);
  assert.match(trips, /<ol className="vehicle-trips__timeline">/);
  assert.match(trips, /item\.kind === "TRIP" \? <CarOutlined \/> : item\.kind === "STOP" \? <PauseCircleOutlined \/> : <DisconnectOutlined \/>/);
  assert.match(trips, /token\.colorPrimary : item\.kind === "STOP" \? token\.colorSuccess : token\.colorWarning/);
  assert.match(trips, /item\.kind === "GAP" \? <div[^>]*>\{content\}<\/div> : <button/);
  assert.match(trips, /aria-pressed=\{selected\}/);
  assert.match(trips, /selectedStopBoundaryPresentation\(next\)/);
  assert.match(trips, /selectedTripTrackRequest\(next\)/);
  assert.match(trips, /terminationReason === "DATA_GAP"/);
  assert.doesNotMatch(trips, /address|geocod|roadDistance|stopCenter|interpolat|cluster|eventLocation|locationMap/i);
});

test("desktop Map stickiness uses the real scrolling page and narrow layouts remain Map-first", () => {
  assert.match(styles, /grid-template-columns: minmax\(300px, 360px\) minmax\(0, 1fr\)/);
  assert.match(styles, /grid-template-areas: "timeline map"/);
  assert.match(styles, /vehicle-trips__workspace \{[^}]*border:/);
  assert.doesNotMatch(styles, /vehicle-trips__workspace \{[^}]*overflow:/);
  assert.match(styles, /vehicle-trips__map-pane \{[^}]*position: sticky;[^}]*top: 0;[^}]*height: 100dvh/);
  assert.match(styles, /main\.taxi-shell__main:has\(\.vehicle-trips\) \{ padding-bottom: var\(--space-12\); \}/);
  assert.match(styles, /vehicle-trips__workspace-header \{[^}]*min-height: calc\(var\(--control-height-default\) \+ var\(--space-4\) \+ 1px\);[^}]*padding: var\(--space-2\) var\(--space-6\);/);
  assert.match(styles, /vehicle-trips__workspace-header svg \{ overflow: visible; \}/);
  assert.doesNotMatch(styles, /top: calc\(58px/);
  assert.match(styles, /@media \(max-width: 991px\)[\s\S]*grid-template-areas: "map" "timeline"/);
  assert.match(styles, /@media \(max-width: 991px\)[\s\S]*vehicle-trips__map-pane \{[^}]*position: static;/);
  assert.doesNotMatch(styles, /\.ant-/);
});

test("an initial available event scrolls to the semantic workspace exactly once", () => {
  assert.match(trips, /const workspaceRef = useRef<HTMLElement>\(null\)/);
  assert.match(trips, /const initialEventFocusRef = useRef\(initialEventFocus\)/);
  assert.match(trips, /const didEventScrollRef = useRef\(false\)/);
  assert.match(trips, /if \(didEventScrollRef\.current\) return;[^]*initial\?\.kind !== "AVAILABLE"[^]*if \(!workspace\) return;[^]*didEventScrollRef\.current = true;[^]*workspace\.scrollIntoView\(\{ block: "start" \}\);[^]*}, \[\]\);/);
  assert.match(trips, /<section ref=\{workspaceRef\} id="vehicle-trips-workspace" className="vehicle-trips__workspace">/);
  assert.match(styles, /\.vehicle-trips__workspace \{ scroll-margin-top: var\(--space-6\); \}/);
  assert.doesNotMatch(trips, /window\.scrollTo|scrollY|pageYOffset/);
});

test("Trips Map layers reuse accepted fleet semantics and keep route, warning, and stop truthfulness", () => {
  for (const id of ["TRIP_MAP_LINE_LAYER_ID", "TRIP_MAP_WARNING_ACCENT_LAYER_ID", "TRIP_MAP_NORMAL_POINT_LAYER_ID", "TRIP_MAP_ENDPOINT_LAYER_ID"]) assert.match(tripLayers, new RegExp(id));
  assert.match(tripLayers, /routeColor: "#246c95"/);
  assert.match(tripLayers, /observationColor: "#176f86"/);
  assert.match(tripLayers, /warningAccentColor: "#a55a08"/);
  assert.match(tripLayers, /startColor: FLEET_MAP_PRESENTATION\.fresh/);
  assert.match(tripLayers, /endColor: FLEET_MAP_PRESENTATION\.speeding/);
  assert.match(tripLayers, /warningRadius: FLEET_MAP_PRESENTATION\.speedingRadius/);
  assert.match(tripLayers, /circle-stroke-color": TRIP_MAP_PRESENTATION\.warningAccentColor/);
  assert.match(tripLayers, /circle-color": "transparent"/);
  assert.doesNotMatch(tripLayers, /TRIP_MAP_SELECTED_LAYER_ID|selectedKey/);
  assert.match(trips, /ensureTripMapLayers/);
  assert.match(trips, /updateTripMapData/);
});

test("Legend mirrors Main Map's trigger and popup surface and derives rows from one contract", () => {
  assert.match(trips, /const showEventLegend = availableEvent\?\.confirmationPosition != null/);
  assert.match(trips, /<Popover trigger="click" placement="bottomRight" content=\{<TripMapLegend showEvent=\{showEventLegend\} showSpeedingSegment=\{showSpeedingSegmentLegend\} \/>\}>/);
  assert.match(trips, /<Button size="large" type="default" icon=\{<InfoCircleOutlined aria-hidden \/>\}>/);
  assert.match(trips, /className="map-legend vehicle-trips__legend"/);
  assert.match(trips, /className="map-legend__header"/);
  assert.match(trips, /className="map-legend__items"/);
  assert.match(trips, /TRIP_MAP_LEGEND_ITEMS\.map/);
  assert.match(trips, /\{showEvent \? <span><TripLegendSwatch kind="event" \/>\{t\("trips\.legend\.speedingConfirmation"\)\}<\/span> : null\}/);
  assert.match(trips, /\{showSpeedingSegment \? <span><TripLegendSwatch kind="speeding-segment" \/>\{t\("trips\.legend\.speedingSegment"\)\}<\/span> : null\}/);
  assert.match(mapStyles, /\.map-legend \{[\s\S]*width: min\(340px, calc\(100vw - 64px\)\);[\s\S]*gap: 10px;/);
  for (const kind of ["route", "observation", "warning", "start", "end", "stop", "event"]) assert.match(styles, new RegExp(`vehicle-trips__legend-sample--${kind}`));
  assert.match(trips, /"--trip-marker-event-size": `\$\{TRIP_MAP_PRESENTATION\.eventRadius \* 2\}px`/);
  assert.match(trips, /"--trip-marker-event-halo-size": `\$\{TRIP_MAP_PRESENTATION\.eventHaloRadius \* 2\}px`/);
  assert.match(styles, /width: var\(--trip-marker-event-size\)/);
  assert.match(styles, /width: var\(--trip-marker-event-halo-size\)/);
});

test("Trips copy is complete in UK, RU, and EN", () => {
  const keys = [
    "trips.controls.title", "trips.presetGroup.calendar", "trips.presetGroup.recent", "trips.presetChoice.last3",
    "trips.range.label", "trips.range.from", "trips.range.to", "trips.range.now", "trips.range.openEndedHelp", "trips.range.startRequired",
    "trips.map.title", "trips.timeline.trip", "trips.timeline.stop", "trips.timeline.gap", "trips.timeline.continuityLost",
    "trips.legend.route", "trips.legend.observation", "trips.legend.qualityWarning", "trips.legend.start", "trips.legend.end", "trips.legend.stop", "trips.legend.speedingConfirmation", "trips.legend.speedingSegment", "trips.legend.note",
  ] as const;
  for (const key of keys) for (const locale of SUPPORTED_LOCALES) assert.ok(createTranslator(locale)(key).length > 1, `${locale}:${key}`);
  assert.equal(createTranslator("uk")("trips.range.openEndedHelp"), "Без кінцевої дати — до поточного часу.");
  assert.equal(createTranslator("ru")("trips.range.openEndedHelp"), "Без конечной даты — до текущего времени.");
  assert.equal(createTranslator("en")("trips.range.openEndedHelp"), "No end date — until now.");
  assert.deepEqual(SUPPORTED_LOCALES.map((locale) => createTranslator(locale)("trips.range.from")), ["От", "Від", "From"]);
  assert.deepEqual(SUPPORTED_LOCALES.map((locale) => createTranslator(locale)("trips.range.to")), ["До", "До", "To"]);
  assert.deepEqual(SUPPORTED_LOCALES.map((locale) => createTranslator(locale)("trips.legend.speedingConfirmation")), ["Подтверждение превышения скорости", "Підтвердження перевищення швидкості", "Speeding confirmation"]);
  assert.deepEqual(SUPPORTED_LOCALES.map((locale) => createTranslator(locale)("trips.legend.speedingSegment")), ["Превышение скорости", "Перевищення швидкості", "Speeding segment"]);
  assert.doesNotMatch(messages, /"trips\.controls\.time"|"trips\.controls\.clear"/);
  assert.doesNotMatch(messages, /trips\.presetTile/);
  assert.doesNotMatch(trips, /[🚗⏸️🔌📍]/u);
});

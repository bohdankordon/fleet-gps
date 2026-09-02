import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createTranslator } from "../i18n/core";
import { SUPPORTED_LOCALES } from "../i18n/locales";

const trips = readFileSync("src/components/vehicle-trips-client.tsx", "utf8");
const styles = readFileSync("src/styles/vehicle-trips.css", "utf8");
const messages = readFileSync("src/i18n/messages.ts", "utf8");
const tripContract = readFileSync("src/lib/trip-analysis/trip-analysis-contract.ts", "utf8");
const tripRange = readFileSync("src/lib/trip-analysis/trip-analysis-range.ts", "utf8");
const customRange = readFileSync("src/lib/vehicle-track/vehicle-track-custom-range.ts", "utf8");
const tripsPage = readFileSync("src/app/vehicles/[vehicleId]/trips/page.tsx", "utf8");

test("Trips retains the accepted shell and presents one compact period trigger", () => {
  assert.match(trips, /<VehicleDetailShell[^>]*activeTab="trips"/);
  assert.equal((trips.match(/className="vehicle-trips__period-bar"/g) ?? []).length, 1);
  for (const component of ["Popover", "Button", "Segmented", "Input", "Divider", "Empty", "Alert", "StableLoadingButton"]) assert.match(trips, new RegExp(`\\b${component}\\b`));
  assert.match(trips, /<Popover[\s\S]*?open=\{editorOpen\}[\s\S]*?onOpenChange=\{setEditorOpen\}[\s\S]*?trigger="click"/);
  assert.match(trips, /destroyOnHidden[\s\S]*?fresh/);
  assert.match(trips, /TRIP_ANALYSIS_PRESETS\.map/);
  assert.match(trips, /<Segmented[\s\S]*?value=\{appliedPreset \?\? ""\}[\s\S]*?options=\{TRIP_ANALYSIS_PRESETS\.map/);
  assert.match(trips, /orientation=\{screens\.sm === false \? "vertical" : "horizontal"\}/);
  assert.match(trips, /type="datetime-local"/);
  assert.match(trips, /parseVehicleTrackCustomRange\(draft\)/);
  assert.match(trips, /htmlType="submit" type="primary"/);
  assert.match(trips, /<StableLoadingButton[\s\S]*?type="default"/);
  assert.match(trips, /window\.history\.replaceState\(null, "", `\/vehicles\/\$\{vehicleId\}\/trips\?\$\{query\}`\)/);
});

test("custom temporal editing is disclosed on demand and never masquerades as a preset", () => {
  assert.match(tripsPage, /initialPreset=\{resolved\.restoredFromUrl \? null : "TODAY"\}/);
  assert.match(trips, /const \[editorOpen, setEditorOpen\] = useState\(false\)/);
  assert.match(trips, /aria-expanded=\{editorOpen\} aria-controls="vehicle-trips-custom-range"/);
  assert.match(trips, /const periodEditor = <div className="vehicle-trips__period-editor">/);
  assert.match(trips, /<form id="vehicle-trips-custom-range"/);
  assert.match(trips, /void loadAnalysis\(parsed\.range, null, true\)/);
  assert.match(trips, /setAppliedPreset\(nextPreset\)/);
  assert.match(trips, /if \(collapseEditor\) setEditorOpen\(false\)/);
  assert.match(trips, /const periodLabel = appliedPresetDefinition \? t\(appliedPresetDefinition\.messageKey\) : t\("track\.controls\.custom"\)/);
  assert.match(trips, /vehicle-trips__period-window[\s\S]*?\{concisePeriod\}/);
  assert.match(trips, /const concisePeriod = appliedPreset === "TODAY"/);
  assert.match(trips, /formatTripAnalysisClock\(range\.from, locale\)[\s\S]*formatTripAnalysisClock\(range\.to, locale\)/);
});

test("timezone and absolute range semantics remain authoritative and bounded", () => {
  assert.match(customRange, /VEHICLE_TRACK_INPUT_TIMEZONE = "Europe\/Kyiv"/);
  assert.match(customRange, /getPossibleOffsets\(\)\.length > 1/);
  assert.match(customRange, /parseVehicleTrackRange\(from\.instant, to\.instant\)/);
  assert.match(tripRange, /LAST_24_HOURS/);
  assert.match(tripRange, /LAST_7_DAYS/);
  assert.match(tripContract, /VEHICLE_TRACK_MAX_RANGE_MS/);
  assert.doesNotMatch(trips, /DatePicker|RangePicker|dayjs/);
});

test("one unified analytical summary contains four aligned semantic metrics", () => {
  assert.equal((trips.match(/<TripSummaryMetric/g) ?? []).length, 4);
  for (const icon of ["CarOutlined", "PauseCircleOutlined", "NodeIndexOutlined", "DisconnectOutlined"]) assert.match(trips, new RegExp(`<${icon}`));
  assert.equal((trips.match(/className="vehicle-trips__summary"/g) ?? []).length, 1);
  assert.match(trips, /<article className="vehicle-trips__summary-metric">/);
  assert.doesNotMatch(trips, /TripSummaryCard|vehicle-trips__summary-card/);
  assert.match(styles, /vehicle-trips__summary \{[^}]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);[^}]*border:/);
  assert.match(styles, /@media \(max-width: 991px\)[\s\S]*vehicle-trips__summary \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
  assert.match(styles, /vehicle-trips__summary-value \{[^}]*font-variant-numeric: tabular-nums;/);
});

test("chronology and Map are panes of one analysis workspace", () => {
  assert.equal((trips.match(/className="vehicle-trips__workspace"/g) ?? []).length, 1);
  assert.equal((trips.match(/className="vehicle-trips__workspace-header"/g) ?? []).length, 2);
  assert.doesNotMatch(trips, /vehicle-trips__(?:timeline|map)-card/);
  assert.match(trips, /<ol className="vehicle-trips__timeline">/);
  assert.match(trips, /item\.kind === "TRIP" \? <CarOutlined \/> : item\.kind === "STOP" \? <PauseCircleOutlined \/> : <DisconnectOutlined \/>/);
  assert.match(trips, /token\.colorPrimary : item\.kind === "STOP" \? token\.colorSuccess : token\.colorWarning/);
  assert.match(trips, /item\.kind === "GAP" \? <div[^>]*>\{content\}<\/div> : <button/);
  assert.match(trips, /aria-pressed=\{selected\}/);
  assert.match(trips, /connected=\{index < timeline\.length - 1\}/);
  assert.match(styles, /vehicle-trips__record--selected \{[^}]*box-shadow: inset/);
  const hover = styles.match(/\.vehicle-trips__record:hover \{[^}]*\}/)?.[0] ?? "";
  assert.doesNotMatch(hover, /transform|margin|padding|border|width|height/);
  assert.equal((trips.match(/<Card/g) ?? []).length, 0);
});

test("record content preserves top-to-bottom facts warnings and truthful Map semantics", () => {
  assert.match(trips, /formatTripAnalysisTime\(item\.startAt, locale\)[\s\S]*formatTripAnalysisTime\(item\.endAt, locale\)/);
  assert.match(trips, /formatTripAnalysisDuration\(item\.value\.durationSeconds, locale\)/);
  assert.match(trips, /formatObservedDistance\(item\.value\.observedDistanceMeters, locale\)/);
  assert.match(trips, /terminationReason === "DATA_GAP"/);
  assert.match(trips, /<WarningOutlined aria-hidden \/>/);
  assert.match(trips, /selectedStopBoundaryPresentation\(next\)/);
  assert.match(trips, /selectedTripTrackRequest\(next\)/);
  assert.match(trips, /!selection \? <div className="map-empty vehicle-trips__map-empty">/);
  assert.doesNotMatch(trips, /address|geocod|roadDistance|stopCenter|interpolat|cluster|eventLocation|locationMap/i);
});

test("desktop workspace keeps chronology beside a sticky Map and narrow layouts place Map first", () => {
  assert.match(styles, /grid-template-columns: minmax\(300px, 360px\) minmax\(0, 1fr\)/);
  assert.match(styles, /grid-template-areas: "timeline map"/);
  assert.match(styles, /vehicle-trips__workspace \{[^}]*overflow: clip;[^}]*border:/);
  assert.match(styles, /vehicle-trips__map-pane \{[^}]*border-inline-start:/);
  assert.match(styles, /vehicle-trips__map-pane \{[^}]*position: sticky;[^}]*top: calc\(58px \+ var\(--space-4\)\);/);
  assert.match(styles, /@media \(max-width: 991px\)[\s\S]*grid-template-areas: "map" "timeline"/);
  assert.match(styles, /@media \(max-width: 991px\)[\s\S]*vehicle-trips__map-pane \{[^}]*position: static;[^}]*border-inline-start: 0;/);
  assert.doesNotMatch(styles, /\.ant-/);
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}/i);
});

test("Trips copy is complete in UK RU and EN and components own punctuation", () => {
  const keys = ["trips.controls.title", "trips.map.title", "trips.timeline.trip", "trips.timeline.stop", "trips.timeline.gap", "trips.timeline.continuityLost", "trips.timeline.stopEndUnconfirmed"] as const;
  for (const key of keys) for (const locale of SUPPORTED_LOCALES) {
    const value = createTranslator(locale)(key);
    assert.ok(value.length > 1, `${locale}:${key}`);
    if (key === "trips.controls.title") assert.equal(value.includes(":"), false, `${locale}:${key}`);
  }
  assert.doesNotMatch(messages, /"trips\.controls\.title": \{[^\n]*: "[^"]*:/);
  assert.doesNotMatch(trips, /[🚗⏸️🔌📍]/u);
});

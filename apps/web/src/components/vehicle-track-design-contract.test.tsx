import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { createTranslator } from "../i18n/core";
import { SUPPORTED_LOCALES } from "../i18n/locales";
import { formatVehicleTrackClock } from "../lib/vehicle-track/vehicle-track-formatters";

const history = readFileSync("src/components/vehicle-track-client.tsx", "utf8");
const styles = readFileSync("src/styles/vehicle-track.css", "utf8");
const layers = readFileSync("src/lib/vehicle-track/vehicle-track-layers.ts", "utf8");
const presentation = readFileSync("src/lib/vehicle-track/vehicle-track-presentation.ts", "utf8");
const overviewPresentation = readFileSync("src/lib/vehicle-track/vehicle-track-overview-presentation.ts", "utf8");
const webPackage = readFileSync("package.json", "utf8");

test("History keeps the accepted shell and compact period context", () => {
  assert.match(history, /<VehicleDetailShell[^>]*activeTab="history"[^>]*showMapAction/);
  assert.equal((history.match(/className="vehicle-track__period-bar"/g) ?? []).length, 1);
  assert.match(history, /<Button className="vehicle-track__period-trigger" type="default" size="large"/);
  assert.match(history, /<Tag className="vehicle-track__mode"/);
  assert.match(history, /vehicle-track__mode-info/);
  assert.match(history, /t\("trips\.range\.openEndedHelp"\)/);
  assert.equal(formatVehicleTrackClock("2026-08-10T17:05:00Z", "en"), "20:05");
});

test("period choices and exact sampled rules remain authoritative", () => {
  assert.equal((history.match(/<TrackPresetGroup/g) ?? []).length, 2);
  assert.match(history, /item\.hours <= 24/);
  assert.match(history, /item\.hours > 24/);
  const range = readFileSync("src/lib/vehicle-track/vehicle-track-range.ts", "utf8");
  for (const hours of [1, 6, 24, 72, 168]) assert.match(range, new RegExp(`hours: ${hours}`));
  assert.match(history, /showTime=\{\{ format: "HH:mm", minuteStep: 1 \}\}/);
  assert.match(history, /parseVehicleTrackCustomRange\(draft\)/);
});

test("one four-metric summary preserves exact and sampled count truth", () => {
  assert.equal((history.match(/<TrackSummaryMetric/g) ?? []).length, 4);
  for (const key of ["track.summary.observations", "track.summary.segments", "track.summary.gaps", "track.summary.quality"]) assert.ok(history.includes(key));
  assert.match(history, /returnedPointCount/);
  assert.match(history, /rawPointCount/);
  assert.match(history, /track\.summary\.observationsSampled/);
  assert.match(styles, /vehicle-track__summary \{[^}]*grid-template-columns: repeat\(4/);
  assert.match(styles, /@media \(max-width: 991px\)[\s\S]*vehicle-track__summary \{ grid-template-columns: repeat\(2/);
});

test("active History is Map-first and contains no temporal profile or ECharts", () => {
  assert.equal((history.match(/className="vehicle-track__workspace"/g) ?? []).length, 1);
  assert.match(history, /data-vehicle-track-map="true"/);
  assert.match(history, /vehicle-track__map-content[^]*SelectedObservationDetails/);
  assert.doesNotMatch(history + styles, /VehicleTrackTemporalProfile|vehicle-track__profile|data-vehicle-track-echarts|\bSlider\b/);
  assert.doesNotMatch(history + layers, /echarts|hoveredKey|VEHICLE_TRACK_HOVERED_LAYER_ID/);
  assert.doesNotMatch(webPackage, /"echarts"/);
  assert.equal(existsSync("src/components/vehicle-track-temporal-profile.tsx"), false);
  assert.equal(existsSync("src/lib/vehicle-track/vehicle-track-temporal-profile.ts"), false);
});

test("Map observation selection opens and closes the factual inspector", () => {
  assert.match(history, /onClick[^]*setSelectedKey\(key\)/);
  assert.match(history, /hitLayers = \[VEHICLE_TRACK_SELECTED_LAYER_ID, VEHICLE_TRACK_WARNING_ACCENT_LAYER_ID, VEHICLE_TRACK_ENDPOINT_LAYER_ID, VEHICLE_TRACK_NORMAL_POINT_LAYER_ID\]/);
  assert.match(history, /\{selected \? <SelectedObservationDetails[^]*onClose=\{\(\) => setSelectedKey\(null\)\}/);
  assert.match(history, /selectedVehicleTrackPoint\(model, selectedKey\)/);
  assert.match(history, /vehicle-track__observation-title[^]*EnvironmentOutlined/);
  assert.match(history, /vehicle-track__observation-fields[^]*track\.selection\.speed[^]*track\.selection\.quality/);
  assert.match(styles, /vehicle-track__observation-fields > div \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto;[^}]*align-items: center;[^}]*min-height: 36px/);
  assert.match(styles, /vehicle-track__observation-fields \{[^}]*font-variant-numeric: tabular-nums/);
});

test("warning details render only for factual warnings", () => {
  assert.match(history, /warnings\.length > 0 \? <div className="vehicle-track__observation-warning"/);
  assert.match(history, /<WarningOutlined aria-hidden \/>/);
  assert.doesNotMatch(history.match(/function SelectedObservationDetails[^]*$/)?.[0] ?? "", /track\.selection\.warnings[^]*<dd>—<\/dd>/);
  assert.match(styles, /vehicle-track__observation-warning dt[^}]*color: var\(--track-warning\)/);
});

test("no-data Map overlay is compact truthful and profile-free", () => {
  assert.match(history, /model\.points\.length === 0 \? <div className="map-empty vehicle-track__map-empty"/);
  assert.match(history, /vehicle-track__map-empty-icon/);
  assert.match(history, /track\.noPoints[^]*track\.noPointsMeaning/);
  assert.doesNotMatch(history, /<Empty|model\.points\.length > 0 \? <VehicleTrack/);
  assert.match(styles, /vehicle-track__map-empty-title/);
  assert.match(styles, /vehicle-track__map-empty-copy[^}]*color: var\(--color-text-secondary\)/);
  assert.equal(createTranslator("uk")("track.noPointsMeaning"), "Відсутність спостережень не означає, що автомобіль не рухався.");
});

test("History legend uses accepted shared surface grammar and factual Map constants", () => {
  assert.match(history, /className="map-legend vehicle-track__legend"/);
  assert.match(history, /map-legend__header[^]*map-legend__divider[^]*map-legend__items[^]*map-legend__notes/);
  for (const kind of ["route", "gap", "observation", "warning", "start", "end", "selected"]) assert.ok(history.includes(`["${kind}"`));
  assert.match(history, /track\.legend\.note/);
  assert.match(history, /"--track-marker-route": VEHICLE_TRACK_PRESENTATION\.route/);
  assert.match(styles, /vehicle-track__legend-sample--gap::before[^]*vehicle-track__legend-sample--gap::after[^}]*background: var\(--track-marker-route\)/);
  assert.match(styles, /vehicle-track__legend-sample--selected::after[^}]*border: 2\.5px solid var\(--track-marker-selected\)/);
  assert.match(styles, /vehicle-track__legend-sample--warning::after[^}]*border: 2\.5px solid var\(--track-marker-warning\)/);
});

test("stored geometry remains segmented and never inferred", () => {
  assert.match(presentation, /gapSeconds > MAX_CONNECTED_GAP_SECONDS/);
  assert.match(presentation, /lineFeatures\.push/);
  assert.match(overviewPresentation, /for \(const \[segmentIndex, segment\] of response\.segments\.entries\(\)\)/);
  for (const key of ["route", "observation", "warning", "start", "end", "selected", "outline"]) assert.match(layers, new RegExp(`${key}:`));
  assert.doesNotMatch(history + presentation + overviewPresentation, /geocod|address|heatmap|playback|map.?match|snap/i);
});

test("responsive workspace keeps a dominant Map and flow inspector below desktop", () => {
  assert.match(styles, /@media \(min-width: 992px\)[^]*vehicle-track__map-surface \{ height: clamp\(560px, 68dvh, 620px\); min-height: 560px; max-height: 620px; \}/);
  assert.match(styles, /vehicle-track__observation--overlay \{ position: absolute;[^}]*width: 280px/);
  assert.match(styles, /vehicle-track__legend-control \{ position: absolute/);
  assert.match(styles, /@media \(max-width: 991px\)/);
  assert.match(styles, /@media \(max-width: 575px\)[^]*vehicle-track__map-surface \{ min-height: 340px; height: 50vh; max-height: 400px/);
  assert.doesNotMatch(styles, /\.ant-|overflow-x: auto|track-profile-height/);
});

test("new History copy is localized in UK RU and EN", () => {
  const keys = ["track.legend.gap", "track.legend.note", "track.selection.selected", "track.selection.close", "track.noPoints", "track.noPointsMeaning"] as const;
  for (const key of keys) for (const locale of SUPPORTED_LOCALES) assert.ok(createTranslator(locale)(key).length > 1, `${locale}:${key}`);
  assert.equal(createTranslator("ru")("track.legend.gap"), "GPS-разрыв");
  assert.equal(createTranslator("en")("track.legend.note"), "The route is built only from stored GPS observations. Gaps are not interpolated.");
});

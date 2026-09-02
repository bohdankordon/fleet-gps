import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createTranslator } from "../i18n/core";
import { SUPPORTED_LOCALES } from "../i18n/locales";

const map = readFileSync("src/components/fleet-map-client.tsx", "utf8");
const hoverTarget = readFileSync("src/lib/fleet-map/fleet-map-hover-target.ts", "utf8");
const initialError = readFileSync("src/components/initial-fleet-map-error.tsx", "utf8");
const styles = readFileSync("src/styles/map.css", "utf8");
const page = readFileSync("src/app/map/page.tsx", "utf8");

test("Map uses the accepted open header and groups every existing real summary metric into three native Cards", () => {
  assert.match(map, /<Title level=\{1\}/);
  assert.match(map, /t\("map\.description"\)/);
  assert.doesNotMatch(map + initialError, /map\.eyebrow|className="eyebrow"/);
  assert.equal((map.match(/<MapSummaryCard/g) ?? []).length, 3);
  for (const icon of ["CarFilled", "AimOutlined", "AlertFilled"]) assert.ok(map.includes(icon), icon);
  for (const metric of ["totalVehicles", "withPosition", "fresh", "stale", "withoutPosition", "invalidPosition", "totalOpenAlerts", "vehiclesWithOpenAlerts", "speeding", "inactivity", "visibleVehiclesWithOpenAlerts", "vehiclesWithoutMapPosition"]) assert.ok(map.includes(metric), metric);
  assert.match(map, /<Row className="map-summary-grid" gutter=\{\[12, 12\]\} role="region"/);
  assert.equal((map.match(/md=\{12\} lg=\{6\}/g) ?? []).length, 2);
  assert.match(map, /className="map-summary-grid__column map-summary-grid__events" xs=\{24\} lg=\{12\}/);
  assert.match(map, /\{metric\.label\}:/);
  assert.doesNotMatch(map, /map-alert-summary|data-open-alert-summary|function AlertSummary/);
});

test("Map controls remain client-only and preserve the coordinated refresh contract", () => {
  for (const component of ["AutoComplete", "Input", "Popover", "StableLoadingButton"]) assert.ok(map.includes(component), component);
  for (const icon of ["SearchOutlined", "InfoCircleOutlined", "ReloadOutlined"]) assert.ok(map.includes(icon), icon);
  assert.match(map, /fleetMapSearchOptions\(snapshot, searchQuery\)/);
  assert.match(map, /onSelect=\{\(vehicleId\) => chooseVehicle\(vehicleId\)\}/);
  assert.match(map, /size="large"/);
  assert.match(map, /placeholder=\{t\("dashboard\.filters\.searchPlaceholder"\)\}/);
  assert.match(map, /classNames=\{\{ popup: \{ root: "map-search-popup", list: "map-search-popup__list" \} \}\}/);
  assert.match(map, /classNames=\{\{ clear: "map-controls__search-clear" \}\}/);
  assert.match(map, /clear: \{ alignItems: "center"[\s\S]*width: token\.controlHeightSM \}/);
  assert.match(map, /allowClear/);
  assert.match(map, /virtual=\{false\}/);
  assert.match(map, /popupRender=\{\(menu\) => <MapSearchPopup>\{menu\}<\/MapSearchPopup>\}/);
  assert.match(map, /addEventListener\("wheel", containWheel, \{ capture: true, passive: false \}\)/);
  assert.match(map, /request\("\/api\/fleet\/map", parseFleetMapResponse\)/);
  assert.match(map, /request\("\/api\/alert-events\/map", parseOpenAlertMapResponse\)/);
  assert.match(map, /Promise\.allSettled/);
  assert.match(map, /30_000/);
  assert.doesNotMatch(map, /window\.history|URLSearchParams|searchParams/);
});

test("legend and genuine cartographic symbols retain all current Map semantics", () => {
  assert.match(map, /<Popover trigger="click" placement="bottomRight" content=\{<MapLegend \/>\}>/);
  assert.match(map, /<Flex className="map-legend__header" align="center" gap="small">/);
  assert.match(map, /<InfoCircleOutlined aria-hidden style=\{\{ color: token\.colorPrimary, fontSize: 16 \}\} \/>/);
  assert.match(map, /<Text strong>\{t\("map\.legend\.label"\)\}<\/Text>/);
  assert.match(map, /<Divider className="map-legend__divider" style=\{\{ margin: 0 \}\} \/>/);
  assert.doesNotMatch(map, /<Popover[^>]*title=\{t\("map\.legend\.label"\)\}/);
  for (const key of ["map.legend.fresh", "map.legend.stale", "events.type.SPEEDING", "events.type.INACTIVITY", "map.legend.selected", "map.legend.cityBoundary", "map.legend.inactivityExplanation", "map.legend.selectionExplanation", "map.alertPositionNote"]) assert.ok(map.includes(`t("${key}")`), key);
  for (const marker of ["map-marker-sample--fresh", "map-marker-sample--stale", "map-marker-sample--speeding", "map-marker-sample--inactivity", "map-marker-sample--selected", "map-boundary-line"]) assert.ok(map.includes(marker), marker);
  assert.match(map, /ensureCityGeofenceLayers/);
  assert.match(map, /ensureFleetAlertMapLayers/);
  assert.match(map, /map\.on\("mousemove", FLEET_MAP_HIT_LAYER_ID/);
  assert.match(map, /map\.on\("mouseleave", FLEET_MAP_HIT_LAYER_ID/);
  assert.match(map, /selectNearestMapFeature\(candidates, event\.point/);
  assert.match(map, /FLEET_MAP_PRESENTATION\.hitRadius/);
  assert.doesNotMatch(map, /event\.features\?\.\[0\]/);
  assert.match(hoverTarget, /distanceSq = dx \* dx \+ dy \* dy/);
  assert.match(hoverTarget, /writer\.setFeatureState/);
});

test("selection is map-adjacent on desktop and temporary at tablet and mobile widths", () => {
  assert.match(map, /Grid\.useBreakpoint\(\)/);
  assert.match(map, /desktopInspector && selected \? <VehicleInspector/);
  assert.match(map, /!desktopInspector \? <Drawer/);
  assert.match(map, /placement=\{screens\.sm \? "right" : "bottom"\}/);
  assert.match(map, /ResizeObserver/);
  assert.match(map, /resolveFleetMapDeepLink\(initialSnapshot, initialVehicleId\)/);
  assert.match(map, /useLayoutEffect\(\(\) => \{/);
  assert.match(map, /map\.resize\(\);[\s\S]*map\.easeTo\(\{ center:/);
  assert.match(map, /\}, \[desktopInspector, mapReady, selectedId\]\);/);
  assert.match(map, /!selection\.hasSelectedVehicle \? <div className="map-selection-helper"/);
  assert.match(map, /<VehicleInspector[^>]*onClose=\{clearSelection\}/);
  assert.match(map, /title=\{<VehicleInspectorTitle name=\{vehicle\.vehicle\.name\} \/>\}/);
  assert.match(map, /title=\{selected \? <VehicleInspectorTitle name=\{selected\.vehicle\.name\} \/> : undefined\}/);
  assert.match(map, /<CarOutlined aria-hidden style=\{\{ color: token\.colorTextTertiary, flex: "none" \}\} \/>/);
  assert.match(map, /<CloseOutlined aria-hidden \/>/);
  assert.match(map, /aria-label=\{t\("map\.vehicle\.closeDetails"\)\}/);
  assert.doesNotMatch(map, /vehicleNotSelected|<section className="map-details"/);
  assert.match(styles, /@media \(max-width: 991px\)/);
  assert.match(styles, /@media \(max-width: 575px\)/);
});

test("selected inspector preserves real fields, permission-aware actions, routes, and fixed timestamp formatting", () => {
  for (const key of ["map.vehicle.state", "map.vehicle.speed", "map.vehicle.positionTime", "map.vehicle.age", "map.vehicle.activeEvents", "map.vehicle.opened"]) assert.ok(map.includes(`t("${key}")`), key);
  for (const key of ["map.vehicle.state", "map.vehicle.speed", "map.vehicle.positionTime", "map.vehicle.age", "map.vehicle.activeEvents"]) assert.ok(map.includes('label: `${t("' + key + '")}:`'), key);
  assert.match(map, /<Descriptions[^>]*colon=\{false\}/);
  assert.match(map, /<Flex className="map-inspector__actions" vertical gap="small">/);
  assert.match(map, /<Button block type="primary" href=\{`\/vehicles\/\$\{vehicle\.vehicle\.id\}`\}/);
  assert.match(map, /<Button block type="default" href="\/events\?status=OPEN"/);
  assert.doesNotMatch(map, /className="map-inspector__actions" wrap=/);
  assert.match(map, /hasPermission\(auth, "vehicles\.view"\)/);
  assert.match(map, /hasPermission\(auth, "events\.view"\)/);
  assert.match(map, /href=\{`\/vehicles\/\$\{vehicle\.vehicle\.id\}`\}/);
  assert.match(map, /href="\/events\?status=OPEN"/);
  assert.match(map, /formatFleetMapTimestamp\(vehicle\.position\.observedAt, locale\)/);
  assert.match(map, /formatFleetMapAge\(vehicle\.position\.observedAt, generatedAt, locale\)/);
  for (const forbidden of ["driver", "fuel", "battery", "heading", "address", "provider quality"]) assert.equal(map.toLowerCase().includes(forbidden), false, forbidden);
});

test("Map states, accessibility labels, and all changed copy are available in ru, uk, and en", () => {
  for (const key of ["map.title", "map.description", "map.controls.label", "map.search.label", "dashboard.filters.searchPlaceholder", "map.legend.label", "map.legend.selected", "map.legend.inactivityExplanation", "map.legend.selectionExplanation", "map.loading", "map.noPositions", "map.deepLinkUnavailable", "map.vehicle.closeDetails", "map.initialLoadError"] as const) {
    for (const locale of SUPPORTED_LOCALES) assert.ok(createTranslator(locale)(key).length > 1, `${locale}:${key}`);
  }
  for (const key of ["map.summary.total", "map.summary.onMap", "map.summary.fresh", "map.summary.stale", "map.summary.withoutPosition", "map.summary.invalidPositionsLabel", "map.alertSummary.total", "map.alertSummary.vehicles", "map.alertSummary.visible", "map.alertSummary.withoutPosition", "events.type.SPEEDING", "events.type.INACTIVITY"] as const) {
    for (const locale of SUPPORTED_LOCALES) assert.equal(createTranslator(locale)(key).includes(":"), false, `${locale}:${key}`);
  }
  for (const key of ["map.vehicle.state", "map.vehicle.speed", "map.vehicle.positionTime", "map.vehicle.age", "map.vehicle.activeEvents"] as const) {
    for (const locale of SUPPORTED_LOCALES) assert.equal(createTranslator(locale)(key).includes(":"), false, `${locale}:${key}`);
  }
  assert.match(map, /aria-label=\{t\("map\.controls\.label"\)\}/);
  assert.match(map, /aria-label=\{t\("map\.search\.label"\)\}/);
  assert.match(map, /aria-label=\{t\("map\.interactiveLabel"\)\}/);
  for (const state of ["Spin", "Empty", "Alert"]) assert.ok(map.includes(state), state);
});

test("Map CSS is application-owned, responsive, shadow-free, and does not target Ant internals", () => {
  for (const hook of ["map-summary-grid", "map-controls", "map-workspace--selected", "map-surface", "map-inspector", "map-selection-helper"]) assert.ok(styles.includes(hook), hook);
  assert.match(styles, /height: clamp\(560px, 65vh, 760px\)/);
  assert.doesNotMatch(styles, /\.ant-/);
  assert.match(styles, /\.map-search-popup__boundary \{[^}]*max-height: 256px;[^}]*overflow-y: auto;[^}]*overscroll-behavior: contain;/);
  assert.doesNotMatch(styles, /overflow-x: auto|scroll-snap-type/);
  assert.match(styles, /\.map-summary-group \{[^}]*box-shadow: none/);
  assert.match(styles, /\.map-surface \{[^}]*box-shadow: none/);
  assert.match(styles, /\.map-marker-sample::before \{[^}]*box-shadow: 0 0 0 1px/);
  assert.match(styles, /\.map-marker-sample--inactivity::after \{[^}]*border: 2px dashed/);
  assert.doesNotMatch(styles, /#6e4aa1|purple/);
});

test("Map page retains the three read-only sources and adds only the validated vehicle deep-link input", () => {
  for (const source of ["fetchFleetMapSnapshot", "fetchCityGeofenceMap", "fetchOpenAlertMap"]) assert.ok(page.includes(source), source);
  assert.match(page, /Promise\.allSettled/);
  assert.match(page, /searchParams/);
  assert.match(page, /parseFleetMapVehicleId\(query\.vehicleId\)/);
  assert.doesNotMatch(page, /redirect|router|fetchVehicleDetails/);
});

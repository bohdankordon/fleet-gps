import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n/client";
import type { ManagedVehicle, VehicleGroupSummary } from "../lib/vehicle-groups/vehicle-groups-contract";
import { UngroupedCard, VehicleGroupsDirectory } from "./vehicle-groups-workspace";

const groups: readonly VehicleGroupSummary[] = [
  { id: "11111111-1111-1111-1111-111111111111", name: "Taxi", vehicleCount: 2, userGrantCount: 1, createdAt: "2026-09-01T10:00:00.000Z", updatedAt: "2026-09-02T10:00:00.000Z" },
  { id: "22222222-2222-2222-2222-222222222222", name: "Support", vehicleCount: 0, userGrantCount: 0, createdAt: "2026-09-01T10:00:00.000Z", updatedAt: "2026-09-01T10:00:00.000Z" },
];
const vehicles: readonly ManagedVehicle[] = [
  { id: "33333333-3333-3333-3333-333333333333", name: "Car one", disabled: false, groupId: "11111111-1111-1111-1111-111111111111" },
  { id: "44444444-4444-4444-4444-444444444444", name: "Car two", disabled: true, groupId: null },
];
const render = (locale: "uk" | "ru" | "en" = "en") => renderToStaticMarkup(<I18nProvider locale={locale}><div><VehicleGroupsDirectory groups={groups} /><UngroupedCard vehicles={vehicles.filter((vehicle) => vehicle.groupId === null)} /></div></I18nProvider>);

test("directory renders groups with counts and the ungrouped state", () => {
  const html = render();
  assert.ok(html.includes("Taxi"), "group name");
  assert.ok(html.includes("/admin/vehicle-groups/11111111-1111-1111-1111-111111111111"), "group link");
  assert.ok(html.includes("Support"), "empty group");
  assert.ok(html.includes("Car two"), "ungrouped vehicle visible");
  assert.equal(html.includes("Car one"), false, "grouped vehicle not listed as ungrouped");
});

test("directory empty and failure states stay truthful", () => {
  const empty = renderToStaticMarkup(<I18nProvider locale="en"><div><VehicleGroupsDirectory groups={[]} /><UngroupedCard vehicles={[]} /></div></I18nProvider>);
  assert.ok(empty.includes("No groups yet."), "empty groups");
  assert.ok(empty.includes("Every vehicle is assigned"), "no ungrouped");
  const source = readFileSync("src/components/vehicle-groups-workspace.tsx", "utf8");
  assert.ok(source.includes("groups === null || vehicles === null"), "failure branch");
  assert.ok(source.includes("admin.groups.loadError"), "load error copy");
  assert.match(source, /window\.location\.reload\(\)/);
});

test("create flow posts only the trimmed name and surfaces backend errors", () => {
  const source = readFileSync("src/components/vehicle-groups-workspace.tsx", "utf8");
  assert.match(source, /fetch\("\/api\/admin\/vehicle-groups", \{ method: "POST"/);
  assert.match(source, /JSON\.stringify\(\{ name: name\.trim\(\) \}\)/);
  assert.ok(source.includes("vehicleGroupErrorMessage"), "backend error mapping");
  assert.ok(source.includes("admin.groups.nameRequired"), "empty feedback");
  assert.match(source, /router\.refresh\(\)/);
  assert.doesNotMatch(source, /body\.message|\.message\s*\?\?/);
});

test("directory uses the supported Ant Design 6 list primitives with working search and pagination", () => {
  const source = readFileSync("src/components/vehicle-groups-workspace.tsx", "utf8");
  assert.ok(source.includes("Listy"), "supported list primitive");
  assert.doesNotMatch(source, /<List[ >]/);
  assert.doesNotMatch(source, /List\.Item/);
  assert.ok(source.includes("Pagination"), "explicit pager");
  const many = Array.from({ length: 11 }, (_, index) => ({ id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`, name: `Car ${index}`, disabled: false, groupId: null as string | null }));
  const html = renderToStaticMarkup(<I18nProvider locale="en"><UngroupedCard vehicles={many} /></I18nProvider>);
  assert.ok(html.includes("Car 0") && html.includes("Car 9"), "first page");
  assert.equal(html.includes("Car 10"), false, "second page not rendered");
  assert.match(html, /ant-pagination/);
});

test("vehicle rows and transfer lists stack without page overflow on narrow widths", () => {
  const css = readFileSync("src/styles/vehicle-groups.css", "utf8");
  assert.match(css, /\.vehicle-access-row\s*\{[^}]*grid-template-columns:[^}]*\}/);
  assert.match(css, /@media \(max-width: 575px\)[\s\S]*?\.vehicle-access-row\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*?\.ant-transfer\s*\{[^}]*overflow-x:\s*auto/);
});

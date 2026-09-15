import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n/client";
import type { ManagedVehicle, VehicleGroupSummary } from "../lib/vehicle-groups/vehicle-groups-contract";
import { AdminVehicleAccessFields, AdminVehicleAccessNote, groupVehiclesById, VehicleAccessRow } from "./admin-vehicle-access-fields";

const groups: readonly VehicleGroupSummary[] = [
  { id: "11111111-1111-1111-1111-111111111111", name: "Taxi", color: "BLUE", vehicleCount: 2, userGrantCount: 0, createdAt: "2026-09-01T10:00:00.000Z", updatedAt: "2026-09-01T10:00:00.000Z" },
];
const vehicles: readonly ManagedVehicle[] = [
  { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Car one", disabled: false, groupId: "11111111-1111-1111-1111-111111111111" },
  { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Car two", disabled: false, groupId: "11111111-1111-1111-1111-111111111111" },
  { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", name: "Car three", disabled: true, groupId: null },
];
const noop = () => undefined;
const render = (props: Partial<React.ComponentProps<typeof AdminVehicleAccessFields>> = {}, locale: "uk" | "ru" | "en" = "en") => renderToStaticMarkup(<I18nProvider locale={locale}><AdminVehicleAccessFields draft={{ mode: "SELECTED", groupIds: ["11111111-1111-1111-1111-111111111111"], vehicleIds: [] }} groups={groups} vehicles={vehicles} busy={false} modeError={null} onModeChange={noop} onToggleGroup={noop} onToggleVehicle={noop} {...props} /></I18nProvider>);

test("selectors stay separate with group counts and direct grants allowed over group coverage", () => {
  const html = render();
  assert.ok(html.includes("Groups"), "groups section");
  assert.ok(html.includes("Individual vehicles"), "vehicles section");
  assert.ok(html.includes("Taxi"), "group name");
  assert.ok(html.includes("Car three"), "direct candidate");
  assert.ok(html.includes("Already accessible through a selected group"), "overlap hint");
  const direct = render({ draft: { mode: "SELECTED", groupIds: ["11111111-1111-1111-1111-111111111111"], vehicleIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"] } });
  assert.match(direct, /checked=""/);
});

test("vehicle rows align name, group, and access status without inline sentences", () => {
  const html = render();
  assert.ok(html.includes("vehicle-access-row"), "row layout");
  assert.ok(html.includes("vehicle-access-row__name"), "primary name area");
  assert.ok(html.includes("vehicle-access-row__meta"), "aligned meta area");
  const row = (props: Partial<React.ComponentProps<typeof VehicleAccessRow>> = {}) => renderToStaticMarkup(<I18nProvider locale="en"><VehicleAccessRow vehicle={vehicles[2]!} groupName="Ungrouped" direct={false} viaGroup={false} busy={false} onToggle={noop} {...props} /></I18nProvider>);
  assert.equal(row().includes("anticon-check"), false, "plain row has no status");
  assert.ok(row({ viaGroup: true }).includes("Already accessible through a selected group"), "effective access status");
  assert.ok(row({ viaGroup: true }).includes("anticon-check"), "effective access check");
  assert.ok(row({ direct: true, viaGroup: true }).includes("Direct + group access"), "direct plus group status");
  assert.doesNotMatch(row({ viaGroup: true }), /<input[^>]*disabled/, "covered vehicle keeps an enabled direct-grant checkbox");
  const removed = render({ draft: { mode: "SELECTED", groupIds: ["11111111-1111-1111-1111-111111111111"], vehicleIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"] } });
  assert.ok(removed.includes("Direct + group access"), "direct grant over group coverage stays understandable");
});

test("row copy exists in UK RU and EN", () => {
  for (const locale of ["uk", "ru", "en"] as const) {
    const html = render({}, locale);
    assert.ok(html.includes("vehicle-access-row__meta"), `${locale} meta`);
  }
  assert.ok(render({}, "uk").includes("Уже доступний через вибрану групу"), "uk effective");
  assert.ok(render({ draft: { mode: "SELECTED", groupIds: [], vehicleIds: ["cccccccc-cccc-4ccc-8ccc-cccccccccccc"] } }, "ru").includes("Без группы"), "ru ungrouped");
});

test("summary deduplicates group and direct overlap", () => {
  const html = render({ draft: { mode: "SELECTED", groupIds: ["11111111-1111-1111-1111-111111111111"], vehicleIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "cccccccc-cccc-4ccc-8ccc-cccccccccccc"] } });
  assert.ok(html.includes("Groups: 1; direct grants: 2; effective vehicles: 3"), "deduped summary");
  const all = render({ draft: { mode: "ALL", groupIds: [], vehicleIds: [] } });
  assert.ok(all.includes("All vehicles"), "all summary");
  assert.ok(renderToStaticMarkup(<I18nProvider locale="en"><AdminVehicleAccessNote /></I18nProvider>).includes("full fleet access"), "admin note");
});

test("group membership lookup derives from the managed fleet list", () => {
  assert.deepEqual([...(groupVehiclesById(vehicles)["11111111-1111-1111-1111-111111111111"] ?? [])].sort(), ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"].sort());
  assert.deepEqual(Object.keys(groupVehiclesById(vehicles)), ["11111111-1111-1111-1111-111111111111"]);
});

test("create and detail screens share one vehicle access editor", () => {
  const create = readFileSync("src/components/admin-user-create-form.tsx", "utf8");
  const detail = readFileSync("src/components/admin-user-detail.tsx", "utf8");
  for (const source of [create, detail]) {
    assert.ok(source.includes("<AdminVehicleAccessFields"), "shared editor");
    assert.ok(source.includes("buildVehicleAccessPayload"), "shared payload");
  }
  assert.ok(create.includes("<AdminVehicleAccessNote") && detail.includes("<AdminVehicleAccessNote"), "shared admin note");
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n/client";
import type { ManagedVehicle, VehicleGroupDetail, VehicleGroupSummary } from "../lib/vehicle-groups/vehicle-groups-contract";
import { VehicleGroupDetailWorkspace } from "./vehicle-group-detail-workspace";

const groups: readonly VehicleGroupSummary[] = [
  { id: "11111111-1111-1111-1111-111111111111", name: "Taxi", color: "BLUE", vehicleCount: 1, userGrantCount: 0, createdAt: "2026-09-01T10:00:00.000Z", updatedAt: "2026-09-01T10:00:00.000Z" },
  { id: "22222222-2222-2222-2222-222222222222", name: "Support", color: "GREEN", vehicleCount: 1, userGrantCount: 0, createdAt: "2026-09-01T10:00:00.000Z", updatedAt: "2026-09-01T10:00:00.000Z" },
];
const vehicles: readonly ManagedVehicle[] = [
  { id: "33333333-3333-3333-3333-333333333333", name: "Car one", disabled: false, groupId: "11111111-1111-1111-1111-111111111111" },
  { id: "44444444-4444-4444-4444-444444444444", name: "Car two", disabled: true, groupId: "22222222-2222-2222-2222-222222222222" },
  { id: "55555555-5555-5555-5555-555555555555", name: "Car three", disabled: false, groupId: null },
];
const group: VehicleGroupDetail = { ...groups[0]!, vehicles: [{ id: "33333333-3333-3333-3333-333333333333", name: "Car one", externalDeviceId: 7, disabled: false }] };
const navigation = { refresh: () => undefined, push: (_href: string) => undefined };
const render = (locale: "uk" | "ru" | "en" = "en") => renderToStaticMarkup(<I18nProvider locale={locale}><VehicleGroupDetailWorkspace group={group} vehicles={vehicles} groups={groups} navigation={navigation} /></I18nProvider>);

test("management screen shows rename, membership, and delete affordances", () => {
  const html = render();
  assert.ok(html.includes("Taxi"), "group name");
  assert.ok(html.includes("Back to groups"), "back link");
  assert.ok(html.includes("Car two"), "other-group vehicle available");
  assert.ok(html.includes("Support"), "current group of moved vehicle");
  assert.ok(html.includes("Disabled") || html.includes("disabled"), "disabled state");
  assert.ok(html.includes("Delete group"), "delete action");
});

test("membership saves full desired state and delete explains consequences", () => {
  const source = readFileSync("src/components/vehicle-group-detail-workspace.tsx", "utf8");
  assert.match(source, /\/api\/admin\/vehicle-groups\/\$\{encodeURIComponent\(group\.id\)\}\/vehicles`, "PUT"/);
  assert.match(source, /\/vehicles`, "PUT", \{ vehicleIds: \[\.\.\.ids\] \}\)/);
  assert.ok(source.includes("admin.groups.moveText"), "move confirmation");
  assert.ok(source.includes("admin.groups.deleteText"), "delete consequence");
  assert.doesNotMatch(source, /body\.message|\.message\s*\?\?/);
  assert.match(source, /router\.push\("\/admin\/vehicle-groups"\)/);
});

import "../test-setup-alias";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ConfigProvider, Tag } from "antd";
import { I18nProvider } from "../i18n/client";
import { VehicleGroupTag, VehicleNameWithGroup } from "./vehicle-detail-shell";
import { VehicleGroupColorField } from "./vehicle-group-color-field";
import { MESSAGE_CATALOG } from "../i18n/messages";

const renderTag = (group: unknown, variant: "compact" | "header" = "compact") => renderToStaticMarkup(<ConfigProvider><I18nProvider locale="en"><VehicleGroupTag group={group as never} variant={variant} /></I18nProvider></ConfigProvider>);

test("compact and header tags are color-aware with neutral ungrouped", () => {
  const blue = renderTag({ id: "g", name: "Taxi", color: "BLUE" });
  assert.match(blue, /ant-tag-blue/);
  assert.ok(blue.includes("Taxi"));
  const magenta = renderTag({ id: "g", name: "Taxi", color: "MAGENTA" }, "header");
  assert.match(magenta, /ant-tag-magenta/);
  assert.match(magenta, /vehicle-group-tag--header/);
  const gray = renderTag({ id: "g", name: "Taxi", color: "GRAY" });
  assert.match(gray, /ant-tag/);
  assert.doesNotMatch(gray, /ant-tag-red/);
  assert.equal(renderTag(null), "");
  const ungrouped = renderToStaticMarkup(<ConfigProvider><I18nProvider locale="en"><VehicleGroupTag group={null} showUngrouped /></I18nProvider></ConfigProvider>);
  assert.match(ungrouped, /ant-tag/);
  assert.doesNotMatch(ungrouped, /ant-tag-red/);
  const shell = readFileSync("src/components/vehicle-detail-shell.tsx", "utf8");
  assert.match(shell, /VEHICLE_GROUP_TAG_COLORS/);
  assert.doesNotMatch(shell, /color="red"|"RED"/);
});

test("shared identity structure centers tags against one- and two-line names", () => {
  const css = readFileSync("src/styles/vehicle-groups.css", "utf8");
  assert.match(css, /\.vehicle-group-identity\s*\{[^}]*display:\s*inline-flex[^}]*align-items:\s*center/);
  assert.match(css, /\.vehicle-group-identity__name\s*\{[^}]*overflow-wrap:\s*anywhere/);
  assert.match(css, /\.vehicle-group-identity > \.vehicle-group-identity__name\s*\{[^}]*margin-block-start:\s*0[^}]*margin-block-end:\s*0/);
  assert.match(css, /\.vehicle-group-tag\s*\{[^}]*flex:\s*none/);
  assert.match(css, /\.vehicle-group-tag\s*\{[^}]*align-self:\s*center/);
  const shell = readFileSync("src/components/vehicle-detail-shell.tsx", "utf8");
  assert.match(shell, /VehicleNameWithGroup/);
  assert.match(shell, /vehicle-group-identity/);
  assert.match(shell, /<Title level=\{1\} className="vehicle-group-identity__name"/);
  for (const file of ["src/components/events-client.tsx", "src/components/event-detail.tsx", "src/components/report-results.tsx", "src/components/fleet-map-client.tsx"]) {
    const source = readFileSync(file, "utf8");
    assert.ok(source.includes("vehicle-group-identity"), file);
    assert.ok(source.includes("VehicleGroupTag"), file);
  }
  const identity = renderToStaticMarkup(<ConfigProvider><I18nProvider locale="en"><VehicleNameWithGroup name={<strong>Taxi with a very long wrapped name</strong>} group={{ id: "g", name: "Night", color: "GREEN" }} /></I18nProvider></ConfigProvider>);
  assert.match(identity, /vehicle-group-identity/);
  assert.match(identity, /vehicle-group-identity__name/);
  assert.match(identity, /ant-tag-green/);
});

test("compact and header tags share one typography identity at different scales", () => {
  const css = readFileSync("src/styles/vehicle-groups.css", "utf8");
  assert.doesNotMatch(css, /\.vehicle-group-tag[^{]*\{[^}]*font-weight/);
  const shell = readFileSync("src/components/vehicle-detail-shell.tsx", "utf8");
  assert.doesNotMatch(shell, /fontWeight/);
  assert.match(shell, /fontSize: token\.fontSize/);
  assert.match(shell, /paddingInline: token\.paddingSM/);
  const compact = renderTag({ id: "g", name: "Taxi", color: "BLUE" });
  const header = renderTag({ id: "g", name: "Taxi", color: "BLUE" }, "header");
  assert.doesNotMatch(compact, /font-weight/);
  assert.doesNotMatch(header, /font-weight/);
  assert.match(header, /vehicle-group-tag--header/);
  assert.match(header, /ant-tag-blue/);
});

test("admin create defaults to BLUE with swatches and atomic payload", () => {
  const source = readFileSync("src/components/vehicle-groups-workspace.tsx", "utf8");
  assert.match(source, /DEFAULT_VEHICLE_GROUP_COLOR/);
  assert.match(source, /VehicleGroupColorField/);
  assert.match(source, /JSON\.stringify\(\{ name: name\.trim\(\), color \}\)/);
  const field = renderToStaticMarkup(<ConfigProvider><I18nProvider locale="en"><VehicleGroupColorField value="BLUE" onChange={() => {}} /></I18nProvider></ConfigProvider>);
  assert.match(field, /role="radiogroup"/);
  assert.match(field, /type="radio"/);
  for (const color of ["BLUE", "CYAN", "GREEN", "GOLD", "ORANGE", "PURPLE", "MAGENTA", "GRAY"]) assert.ok(field.includes("value=\"" + color + "\""), color);
  assert.doesNotMatch(field, /RED/);
  assert.match(field, /checked/);
  const bff = readFileSync("src/app/api/admin/vehicle-groups/route.ts", "utf8");
  assert.match(bff, /"name", "color"/);
});

test("admin detail edits name and color atomically without touching membership", () => {
  const source = readFileSync("src/components/vehicle-group-detail-workspace.tsx", "utf8");
  assert.match(source, /admin\.groups\.details/);
  assert.match(source, /VehicleGroupColorField/);
  assert.match(source, /detailsDirty/);
  assert.match(source, /payload\.color = color/);
  assert.match(source, /payload\.name = rename\.trim\(\)/);
  assert.doesNotMatch(source, /vehicleUpdateMany|userGrants|telegram/i);
  const directory = readFileSync("src/components/vehicle-groups-workspace.tsx", "utf8");
  assert.match(directory, /vehicle-group-directory-swatch/);
  assert.match(directory, /VEHICLE_GROUP_SWATCH_BACKGROUNDS/);
});

test("group color labels read naturally in uk, ru, and en", () => {
  for (const color of ["BLUE", "CYAN", "GREEN", "GOLD", "ORANGE", "PURPLE", "MAGENTA", "GRAY"] as const) {
    const key = ("group.color." + color) as keyof typeof MESSAGE_CATALOG;
    const entry = MESSAGE_CATALOG[key] as unknown as Record<string, string>;
    assert.ok(entry.uk && entry.ru && entry.en, color);
  }
  assert.equal((MESSAGE_CATALOG["group.color.BLUE"] as unknown as Record<string, string>).en, "Blue");
  assert.equal((MESSAGE_CATALOG["admin.groups.color"] as unknown as Record<string, string>).en, "Group color");
});

test("notifications finder stays on the search row with equal heights and clean mobile stacking", () => {
  const source = readFileSync("src/components/account-notifications-workspace.tsx", "utf8");
  assert.match(source, /account-notifications__finder-row/);
  assert.match(source, /<Input[^>]*size="large"/);
  assert.match(source, /matchesProductNotificationGroupFilter\(vehicle, groupFinder\)/);
  assert.match(source, /setGroupFinder\(value\); setPage\(1\);/);
  assert.doesNotMatch(source, /selectedVehicleIds\.push|group.*subscription/i);
  const css = readFileSync("src/styles/account.css", "utf8");
  assert.match(css, /\.account-notifications__finder-row\s*\{[^}]*display:\s*flex[^}]*align-items:\s*flex-end/);
  assert.match(css, /@media \(max-width: 575px\)[\s\S]*?\.account-notifications__finder-row\s*\{[^}]*flex-direction:\s*column/);
});

test("dirty navigation keeps the safe action primary with no duplicate native prompt", () => {
  const source = readFileSync("src/components/account-notifications-workspace.tsx", "utf8");
  assert.match(source, /from "antd"[\s\S]*Modal/);
  assert.match(source, /<Modal[\s\S]*?open=\{leaveOpen\}[\s\S]*?account\.notifications\.leaveTitle/);
  assert.match(source, /footer=\{\[/);
  const footer = source.slice(source.indexOf("footer={["));
  assert.ok(footer.indexOf('key="leave"') < footer.indexOf('key="continue"'), "leave renders left of continue");
  assert.match(source, /<Button key="leave" danger onClick/);
  assert.doesNotMatch(source, /<Button key="leave"[^>]*type="primary"/);
  assert.match(source, /<Button key="continue" type="primary" autoFocus onClick/);
  assert.match(source, /onCancel=\{\(\) => void handleStay\(\)\}/);
  assert.doesNotMatch(source, /okText=\{t\("account\.notifications\.leaveConfirm"\)\}/);
  assert.match(source, /account\.notifications\.leaveBody/);
  assert.match(source, /account\.notifications\.keepEditing/);
  assert.match(source, /account\.notifications\.leaveConfirm/);
  assert.match(source, /if \(leavingRef\.current\) return;/);
  assert.match(source, /leavingRef\.current = true;[\s\S]*?window\.location\.assign\(href\)/);
  assert.match(source, /beforeunload/);
  assert.doesNotMatch(source, /setTimeout.*assign|setTimeout.*leaving/i);
  const catalog = MESSAGE_CATALOG["account.notifications.leaveBody"] as unknown as Record<string, string>;
  assert.equal(catalog.en, "You have unsaved notification settings.");
  assert.equal((MESSAGE_CATALOG["account.notifications.leaveTitle"] as unknown as Record<string, string>).en, "Leave without saving?");
  assert.equal((MESSAGE_CATALOG["account.notifications.keepEditing"] as unknown as Record<string, string>).en, "Continue editing");
});

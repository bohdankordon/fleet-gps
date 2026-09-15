import "../test-setup-alias";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ConfigProvider } from "antd";
import { renderToStaticMarkup } from "react-dom/server";
import { AccountNotificationsError, AccountNotificationsSuccess, AccountNotificationsWorkspace } from "./account-notifications-workspace";
import { I18nProvider } from "../i18n/client";
import type { PreferenceBaseline } from "../lib/account/account-notification-preferences";
import type { TelegramConnectionView } from "../lib/account/account-telegram-connection";

const vehicles = [
  { id: "11111111-1111-1111-8111-111111111111", name: "Car one", disabled: false, groupId: null, groupName: null, groupColor: null },
  { id: "22222222-2222-2222-8222-222222222222", name: "Car two", disabled: true, groupId: null, groupName: null, groupColor: null },
] as const;
const baseline = (
  overrides: Partial<PreferenceBaseline["draft"]> = {},
  extra: Partial<Pick<PreferenceBaseline, "revision" | "canSelectVehicles" | "hasDormantSelections" | "vehicles">> = {},
): PreferenceBaseline => ({
  draft: {
    enabled: true,
    speedingEnabled: true,
    inactivityEnabled: false,
    vehicleScope: "SELECTED",
    selectedVehicleIds: ["11111111-1111-1111-8111-111111111111"],
    ...overrides,
  },
  revision: 3,
  canSelectVehicles: true,
  hasDormantSelections: false,
  vehicles: [...vehicles],
  ...extra,
});
const render = (
  props: { baseline?: PreferenceBaseline; connection?: TelegramConnectionView; deliveryLimited?: boolean },
  locale: "uk" | "ru" | "en" = "en",
) => renderToStaticMarkup(
  <ConfigProvider><I18nProvider locale={locale}>
    <AccountNotificationsWorkspace
      baseline={props.baseline ?? baseline()}
      connection={props.connection ?? { status: "CONNECTED", pendingExpiresAt: null }}
      deliveryLimited={props.deliveryLimited ?? false}
    />
  </I18nProvider></ConfigProvider>,
);

const roleCount = (html: string, role: string): number => (html.match(new RegExp(`role="${role}"`, "g")) ?? []).length;

test("prerequisite context stays factual for every connection state", () => {
  const connected = render({});
  assert.match(connected, /ant-tag-success[^>]*>Connected</);
  assert.match(connected, /Preferences below control which alerts are delivered\./);
  assert.match(connected, /href="\/account\/telegram"/);
  assert.doesNotMatch(connected, />Connect Telegram</);
  const idle = render({ connection: { status: "NOT_CONNECTED", pendingExpiresAt: null } });
  assert.match(idle, /ant-tag[^>]*>Not connected</);
  assert.match(idle, /Delivery is unavailable until Telegram is connected\./);
  const broken = render({ connection: { status: "BROKEN", pendingExpiresAt: null } });
  assert.match(broken, /ant-tag-warning[^>]*>Reconnect needed</);
  assert.match(broken, /Telegram delivery cannot use the saved connection\./);
  assert.doesNotMatch(broken, />Not connected</);
  const pending = render({ connection: { status: "LINK_PENDING", pendingExpiresAt: "2030-01-01T00:00:00.000Z" } });
  assert.match(pending, /ant-tag-processing[^>]*>Confirmation pending</);
  assert.match(pending, /Telegram confirmation is still pending\. Delivery starts after it completes\./);
  // No connection workflows live on this screen.
  for (const html of [connected, idle, broken, pending]) {
    assert.doesNotMatch(html, />Disconnect Telegram</);
    assert.doesNotMatch(html, /t\.me\//);
  }
});

test("master, events, and vehicles render with truthful subordinate states", () => {
  const html = render({});
  assert.match(html, />Receive notifications</);
  assert.match(html, /role="switch"/);
  assert.match(html, />Events</);
  assert.match(html, /Choose which event types you want to be notified about\./);
  assert.match(html, />Speeding</);
  assert.match(html, />Inactivity</);
  assert.match(html, />Vehicles</);
  assert.match(html, /Choose which vehicles can generate notifications for you\./);
  assert.match(html, />All vehicles</);
  assert.match(html, />Selected vehicles</);
  assert.match(html, /Car one/);
  assert.match(html, /Car two/);
  assert.match(html, /ant-tag[^>]*>inactive</);
  assert.match(html, /Selected: 1/);
  assert.match(html, /Inactive vehicles stay selected but receive nothing while inactive\./);
  // No dirty bar on a clean initial render and no success leftovers.
  assert.doesNotMatch(html, /Unsaved changes/);
  assert.doesNotMatch(html, /Preferences saved/);
  const calm = render({ baseline: baseline({ speedingEnabled: false, inactivityEnabled: false }) });
  assert.match(calm, /No event types are currently selected, so no event alert can be delivered\./);
  const off = render({ baseline: baseline({ enabled: false }) });
  assert.match(off, /keeps your selected events and vehicles/);
});

test("capability-false renders facts without vehicle metadata or editors", () => {
  const html = render({ baseline: baseline({}, { canSelectVehicles: false, vehicles: [] }) });
  assert.match(html, /Vehicle selection is unavailable for this account\./);
  assert.doesNotMatch(html, /Car one|Car two/);
  assert.doesNotMatch(html, />All vehicles</);
});

test("persisted SELECTED scope without capability is described, not invented", () => {
  const html = render({
    baseline: baseline({ vehicleScope: "SELECTED" }, { canSelectVehicles: false, vehicles: [] }),
  });
  assert.match(html, /Saved setting: Selected vehicles\./);
});

test("notifications copy is localized in UK, RU, and EN", () => {
  const copies = {
    uk: ["Налаштування нижче визначають", "Вимкнення призупиняє доставку", "Події", "Автомобілі", "Отримувати сповіщення", "Пошук за назвою автомобіля"],
    ru: ["Настройки ниже определяют", "Выключение приостанавливает доставку", "События", "Автомобили", "Получать уведомления", "Поиск по названию автомобиля"],
    en: ["Preferences below control", "pauses delivery but keeps", "Events", "Vehicles", "Receive notifications", "Search by vehicle name"],
  } as const;
  for (const locale of ["uk", "ru", "en"] as const) {
    const html = render({}, locale);
    for (const text of copies[locale]) assert.ok(html.includes(text), `${locale}: ${text}`);
  }
  // The shell subtitle is server-rendered; verify its localized catalog text.
  const catalog = readFileSync("src/i18n/messages.ts", "utf8");
  // The empty-list message renders only for empty search results; verify its
  // localized catalog text instead.
  for (const text of ["Оберіть події та автомобілі", "Выберите события и автомобили", "Choose the events and vehicles", "Автомобілі не знайдено", "Автомобили не найдены", "No vehicles found."]) {
    assert.ok(catalog.includes(text), text);
  }
  const shell = readFileSync("src/components/account-notifications.tsx", "utf8");
  assert.match(shell, /account\.notifications\.subtitle/);
});

test("page and server boundary stay session-only with no legacy composition", () => {
  const page = readFileSync("src/app/account/notifications/page.tsx", "utf8");
  assert.match(page, /<AccountNotifications/);
  assert.doesNotMatch(page, /TelegramNotificationsPanel|hero|cookies\(|jar\.toString/);
  const server = readFileSync("src/lib/account/account-notifications-server.ts", "utf8");
  assert.match(server, /authenticatedApiFetch/);
  assert.doesNotMatch(server, /cookies\(|Cookie|jar\.toString/);
  const shell = readFileSync("src/components/account-notifications.tsx", "utf8");
  assert.match(shell, /<AccountNavigation activePath="\/account\/notifications"/);
  assert.match(shell, /<AccountSignOutSection/);
  assert.match(shell, /<h1\b|CompactPageHeading/);
});

test("interaction guards and secret hygiene hold in the live component", () => {
  const source = readFileSync("src/components/account-notifications-workspace.tsx", "utf8");
  assert.match(source, /beforeunload/);
  assert.match(source, /addEventListener\("click", onClick, true\)/);
  assert.match(source, /savingRef\.current/);
  assert.match(source, /generation\.current !== run/);
  assert.match(source, /response\.status === 409/);
  assert.match(source, /<AlertDialog/);
  assert.match(source, /<AccountNotificationsSuccess/);
  assert.match(source, /account\.notifications\.unsavedChanges/);
  assert.match(source, /telegram\.preferences\.save/);
  assert.match(source, /account\.notifications\.discardConfirm/);
  assert.match(source, /paged\.items\.length === 0/);
  assert.match(source, /account\.notifications\.noVehiclesFound/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|console\.|URLSearchParams|t\.me\//);
});

test("workspace keeps the Account rhythm with bounded mobile behavior", () => {
  const css = readFileSync("src/styles/account.css", "utf8");
  for (const selector of ["\\.account-notifications-card", "\\.account-notifications__dirtybar", "\\.account-notifications__conflictlist", "\\.account-notifications__vehicles"]) {
    assert.match(css, new RegExp(selector));
  }
  assert.match(css, /\.account-notifications__dirtybar[\s\S]{0,300}flex-direction:\s*column/);
});

test("vehicle selector is segmented, searchable, and paged without touching the draft", () => {
  const html = render({});
  assert.match(html, /role="radiogroup"/);
  assert.match(html, /Search by vehicle name/);
  assert.match(html, /Selected: 1/);
  assert.match(html, /ant-tag[^>]*>inactive</);
  // Twelve vehicles force a second bounded page; the count stays global.
  const fleet = Array.from({ length: 12 }, (_, index) => ({ id: `fleet-vehicle-${index}`, name: `Fleet car ${index}`, disabled: false, groupId: null, groupName: null, groupColor: null }));
  const paged = render({ baseline: baseline({ selectedVehicleIds: ["fleet-vehicle-0"] }, { vehicles: fleet }) });
  assert.match(paged, /ant-pagination/);
  assert.match(paged, /Selected: 1/);
  assert.match(paged, /Fleet car 0/);
  assert.doesNotMatch(paged, /Fleet car 11/);
  const source = readFileSync("src/components/account-notifications-workspace.tsx", "utf8");
  assert.match(source, /<Segmented/);
  assert.doesNotMatch(source, /Radio\.Group/);
  assert.match(source, /filterVehiclesByName\(baseline\.vehicles, query\)/);
  assert.match(source, /paginateVehicles\(filteredVehicles, page, VEHICLE_PAGE_SIZE\)/);
  // Search and pagination are ephemeral UI state, never draft edits.
  assert.doesNotMatch(source, /setQuery\(event\.target\.value\);[\s\S]{0,60}touchDraft/);
  assert.match(source, /VEHICLE_PAGE_SIZE = 10|VEHICLE_PAGE_SIZE,/);
});
test("group finder uses the shared labeled pattern and never changes the saved selection", () => {
  const workspace = readFileSync("src/components/account-notifications-workspace.tsx", "utf8");
  assert.ok(workspace.includes('from "./labeled-filter-select"'));
  assert.ok(workspace.includes('<LabeledFilterSelect fieldLabel={t("group.filter.label")}'));
  assert.ok(workspace.includes("setGroupFinder(value); setPage(1);"));
  const html = render({});
  assert.ok(html.includes("Group: All groups"));
  assert.ok(html.includes("Group: Ungrouped"));
  assert.ok(html.includes("Selected: 1"));
});

test("LINK_PENDING prerequisite and unavailable shell stay truthful", () => {
  const pending = render({ connection: { status: "LINK_PENDING", pendingExpiresAt: "2030-01-01T00:00:00.000Z" } });
  assert.match(pending, /ant-tag-processing[^>]*>Confirmation pending</);
  assert.match(pending, /Telegram confirmation is still pending\. Delivery starts after it completes\./);
  const shell = readFileSync("src/components/account-notifications.tsx", "utf8");
  assert.match(shell, /availability === "unavailable"/);
  assert.match(shell, /account\.overview\.statusUnavailable/);
  assert.match(shell, /Personal notifications|account\.notifications\.personalTitle/);
});

test("notification feedback has one live-region owner with unchanged Alert types and copy", () => {
  const error = renderToStaticMarkup(<ConfigProvider><AccountNotificationsError title="Could not save preferences" /></ConfigProvider>);
  assert.equal(roleCount(error, "alert"), 1);
  assert.equal(roleCount(error, "status"), 0);
  assert.match(error, /ant-alert-error/);
  assert.match(error, />Could not save preferences</);

  const success = renderToStaticMarkup(<ConfigProvider><AccountNotificationsSuccess title="Preferences saved" /></ConfigProvider>);
  assert.equal(roleCount(success, "status"), 1);
  assert.equal(roleCount(success, "alert"), 0);
  assert.match(success, /ant-alert-success/);
  assert.match(success, />Preferences saved</);

  const source = readFileSync("src/components/account-notifications-workspace.tsx", "utf8");
  assert.doesNotMatch(source, /<div role="alert"><Alert/);
  assert.doesNotMatch(source, /<div role="status"[^>]*>[\s\S]{0,100}<Alert/);
});

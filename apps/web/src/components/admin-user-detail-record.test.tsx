import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n/client";
import type { AdminManagedUser } from "../lib/admin-users/admin-users-contract";
import { AdminUserAccountOverview, AdminUserIdentity } from "./admin-user-detail";

const admin: AdminManagedUser = { id: "admin-id", login: "admin", role: "ADMIN", disabled: false, mustChangePassword: false, permissions: [], telegramStatus: "NOT_CONNECTED", createdAt: "2026-08-21T15:09:00.000Z", updatedAt: "2026-08-21T15:09:00.000Z" };
const operator: AdminManagedUser = { id: "user-id", login: "operator", role: "USER", disabled: true, mustChangePassword: true, permissions: ["fleet.view", "vehicles.view", "trips.view"], telegramStatus: "CONNECTED", createdAt: "2026-08-22T10:00:00.000Z", updatedAt: "2026-09-01T10:00:00.000Z" };

const renderIdentity = (user: AdminManagedUser, self: boolean, locale: "uk" | "ru" | "en" = "en") => renderToStaticMarkup(<I18nProvider locale={locale}><AdminUserIdentity user={user} self={self} /></I18nProvider>);
const renderOverview = (user: AdminManagedUser, locale: "uk" | "ru" | "en" = "en") => renderToStaticMarkup(<I18nProvider locale={locale}><AdminUserAccountOverview user={user} onManageAccess={() => {}} /></I18nProvider>);

test("identity names the account once with a compact factual supporting line", () => {
  const selfHtml = renderIdentity(admin, true);
  assert.match(selfHtml, /<h1[^>]*>admin<\/h1>/);
  for (const text of ["Administrator", "Active", "Your account", "Back to users", 'href="/admin/users"']) assert.ok(selfHtml.includes(text), text);
  assert.doesNotMatch(selfHtml, /Password change required/);
  const otherHtml = renderIdentity(operator, false);
  for (const text of ["operator", "User", "Disabled", "Password change required"]) assert.ok(otherHtml.includes(text), text);
  assert.doesNotMatch(otherHtml, /Your account/);
});

test("ADMIN authority is a single factual sentence without a permission matrix", () => {
  const html = renderOverview(admin);
  assert.ok(html.includes("Full administrative authority"), "full authority");
  for (const forbidden of ["fleet.view", "map.view", "checkbox", "Attention", "Health", "Risk"]) assert.doesNotMatch(html, new RegExp(forbidden));
});

test("USER authority summarizes access with readable localized permissions", () => {
  const html = renderOverview(operator);
  assert.ok(html.includes("Permissions: 3"), "permission count");
  for (const text of ["Fleet", "Vehicles", "Trips"]) assert.ok(html.includes(text), text);
  for (const forbidden of ["fleet.view", "vehicles.view", "trips.view"]) assert.ok(!html.includes(forbidden), forbidden);
});

test("overview keeps state, password, telegram and metadata as ordinary factual rows", () => {
  const activeHtml = renderOverview(admin);
  for (const text of ["Active", "Not required", "Not connected", "Account overview", "Login", "Role", "Status", "Password change", "Authority", "Telegram", "Created", "Updated"]) assert.ok(activeHtml.includes(text), text);
  assert.match(activeHtml, /<time dateTime="2026-08-21T15:09:00.000Z">.+<\/time>/);
  const passwordHtml = renderOverview(operator);
  for (const text of ["Disabled", "Password change required", "Connected"]) assert.ok(passwordHtml.includes(text), text);
  const brokenHtml = renderOverview({ ...operator, telegramStatus: "BROKEN" });
  assert.ok(brokenHtml.includes("Not connected"), "broken maps to not connected");
  assert.doesNotMatch(brokenHtml, /Reconnect needed/);
});

test("manage access affordance targets a labelled access section after a divider", () => {
  const html = renderOverview(operator);
  assert.ok(html.includes('href="#access-security"'), "anchor target");
  assert.ok(html.includes("Manage access"), "manage copy");
  const source = readFileSync("src/components/admin-user-detail.tsx", "utf8");
  const overviewAt = source.indexOf("AdminUserAccountOverview user={user}");
  const dividerAt = source.indexOf("<Divider />");
  const accessAt = source.indexOf('id="access-security"');
  assert.ok(overviewAt > 0 && dividerAt > overviewAt && accessAt > dividerAt, "read facts, divider, then mutations");
  assert.ok(source.includes("admin.user.detail.accessDescription"), "access description");
  assert.ok(source.includes("<Descriptions") && source.includes("bordered") && source.includes("xs: 1") && source.includes("md: 1") && source.includes("lg: 2"), "responsive record columns");
});

test("record exposes no sensitive internals and no dashboard islands", () => {
  const html = renderIdentity(admin, true) + renderOverview(operator);
  for (const forbidden of ["telegramUserId", "telegramChatId", "tokenHash", "webhookSecret", "botToken", "passwordHash", "sessionToken", "Attention", "Health", "Risk", "Dashboard"]) assert.doesNotMatch(html, new RegExp(forbidden));
  const source = readFileSync("src/components/admin-user-detail.tsx", "utf8");
  assert.equal(source.includes("details-section\n    <form"), false);
  assert.ok(source.includes("AdminUserIdentity") && source.includes("AdminNavigationTabs") && source.includes("AdminUserAccountOverview"), "linear order");
});

test("loading, not-found and unavailable states stay simple and truthful", () => {
  const loading = readFileSync("src/app/admin/users/[userId]/loading.tsx", "utf8");
  assert.match(loading, /role="status"/);
  assert.match(loading, /common\.loading/);
  const notFound = readFileSync("src/app/admin/users/[userId]/not-found.tsx", "utf8");
  assert.match(notFound, /admin\.user\.detail\.notFound/);
  assert.match(notFound, /admin\.user\.detail\.backToUsers/);
  const page = readFileSync("src/app/admin/users/[userId]/page.tsx", "utf8");
  assert.match(page, /notFound\(\)/);
  assert.match(page, /admin\.user\.detail\.unavailable/);
  assert.match(page, /common\.retry/);
  assert.doesNotMatch(page, /className="hero"/);
});

test("detail copy exists in UK RU and EN", () => {
  const messages = readFileSync("src/i18n/messages.ts", "utf8");
  for (const key of ["admin.user.detail.backToUsers", "admin.user.detail.accountOverview", "admin.user.detail.passwordChange", "admin.user.detail.passwordNotRequired", "admin.user.detail.manageAccess", "admin.user.detail.accessSecurity", "admin.user.detail.accessDescription", "admin.user.detail.notFound", "admin.user.detail.unavailable"]) {
    const line = messages.split("\n").find((candidate) => candidate.includes(`"${key}"`));
    assert.ok(line, key); assert.match(line, /ru:\s*"[^"]+"/); assert.match(line, /uk:\s*"[^"]+"/); assert.match(line, /en:\s*"[^"]+"/);
  }
  const uk = renderOverview(admin, "uk");
  assert.ok(uk.includes("Огляд облікового запису"), "uk overview");
  const ru = renderIdentity(admin, true, "ru");
  assert.ok(ru.includes("Администратор"), "ru role");
  assert.ok(ru.includes("Назад к пользователям"), "ru back");
});

test("detail styling stays within the low-cost decorative budget", () => {
  const css = readFileSync("src/styles/admin-user-detail-v2.css", "utf8");
  assert.match(css, /max-width:\s*1020px/);
  assert.match(css, /\.admin-user-detail-v2__overview[\s\S]*?max-width:\s*800px/);
  assert.match(css, /scroll-margin-top/);
  for (const forbidden of ["box-shadow", "linear-gradient", "text-shadow", "transition:", "animation:"]) assert.doesNotMatch(css, new RegExp(forbidden));
});

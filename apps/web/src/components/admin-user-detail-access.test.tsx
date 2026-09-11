import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n/client";
import type { AuthPermission } from "../lib/auth/auth-contract";
import type { AdminManagedUser } from "../lib/admin-users/admin-users-contract";
import { AdminAccessManagement, AdminAccessPendingChanges, AdminSecuritySection, isAccessDirty } from "./admin-user-detail";

const admin: AdminManagedUser = { id: "admin-id", login: "admin", role: "ADMIN", disabled: false, mustChangePassword: false, permissions: [], telegramStatus: "NOT_CONNECTED", createdAt: "2026-08-21T15:09:00.000Z", updatedAt: "2026-08-21T15:09:00.000Z" };
const operator: AdminManagedUser = { id: "user-id", login: "operator", role: "USER", disabled: false, mustChangePassword: false, permissions: ["fleet.view", "vehicles.view"], telegramStatus: "CONNECTED", createdAt: "2026-08-22T10:00:00.000Z", updatedAt: "2026-09-01T10:00:00.000Z" };
const noop = () => undefined;

const renderPending = (user: AdminManagedUser, role: "ADMIN" | "USER", permissions: readonly AuthPermission[], locale: "uk" | "ru" | "en" = "en") => renderToStaticMarkup(<I18nProvider locale={locale}><AdminAccessPendingChanges user={user} role={role} permissions={permissions} /></I18nProvider>);
const renderManagement = (overrides: Partial<ComponentProps<typeof AdminAccessManagement>> = {}, locale: "uk" | "ru" | "en" = "en") => renderToStaticMarkup(<I18nProvider locale={locale}><AdminAccessManagement user={operator} self={false} role="USER" permissions={operator.permissions} busy={false} saveTrigger={<button type="submit">Save access</button>} onRoleChange={noop} onPermissionsChange={noop} onSubmit={noop} {...overrides} /></I18nProvider>);
const enActions = (disabled: boolean, telegram: boolean): Pick<ComponentProps<typeof AdminSecuritySection>, "statusAction" | "passwordAction" | "telegramAction"> => ({
  statusAction: disabled ? <button type="button">Enable account</button> : <button type="button">Disable account</button>,
  passwordAction: <button type="button">Reset password</button>,
  telegramAction: telegram ? <button type="button">Disconnect Telegram</button> : null,
});
const renderSecurity = (user: AdminManagedUser, telegram = true, locale: "uk" | "ru" | "en" = "en") => renderToStaticMarkup(<I18nProvider locale={locale}><AdminSecuritySection user={user} {...enActions(user.disabled, telegram)} /></I18nProvider>);

test("draft detection ignores order but catches role and permission changes", () => {
  assert.equal(isAccessDirty(admin, "ADMIN", []), false);
  assert.equal(isAccessDirty(operator, "USER", ["vehicles.view", "fleet.view"]), false);
  assert.equal(isAccessDirty(operator, "ADMIN", []), true);
  assert.equal(isAccessDirty(admin, "USER", []), true);
  assert.equal(isAccessDirty(operator, "USER", ["fleet.view"]), true);
  assert.equal(isAccessDirty(operator, "USER", [...operator.permissions, "trips.view"]), true);
  assert.equal(isAccessDirty(admin, "ADMIN", ["fleet.view"]), false);
});

test("pending block stays hidden without changes and explains real diffs", () => {
  assert.equal(renderPending(operator, "USER", operator.permissions), "");
  assert.equal(renderPending(admin, "ADMIN", []), "");
  const demote = renderPending(admin, "USER", ["fleet.view"]);
  assert.ok(demote.includes("Pending changes"), "heading");
  assert.ok(demote.includes("Administrator") && demote.includes("User"), "role arrow values");
  assert.ok(demote.includes("Added: Fleet"), "added permission");
  const trimmed = renderPending({ ...operator, permissions: ["fleet.view", "vehicles.view", "trips.view"] }, "USER", ["fleet.view"]);
  assert.ok(trimmed.includes("Removed: Vehicles, Trips"), "removed permissions");
  assert.ok(!demote.includes("fleet.view") && !trimmed.includes("vehicles.view"), "no raw enums");
  const toAdmin = renderPending(operator, "ADMIN", []);
  assert.ok(toAdmin.includes("Full administrative authority"), "demotion result");
});

test("access editor binds role, matrix, self note, and save trigger", () => {
  const userHtml = renderManagement();
  assert.equal((userHtml.match(/admin-user-detail-access__matrix-row/g) ?? []).length, 4);
  assert.ok(userHtml.includes("Requires: Vehicles"), "dependency helper");
  assert.ok(userHtml.includes('aria-describedby="access-requires-1-1"'), "helper association");
  const adminHtml = renderManagement({ role: "ADMIN", user: admin });
  assert.ok(adminHtml.includes("Full administrative authority") || adminHtml.includes("full access"), "admin note");
  assert.doesNotMatch(adminHtml, /type="checkbox"/);
  const selfHtml = renderManagement({ self: true, user: admin, role: "ADMIN" });
  assert.ok(selfHtml.includes("You cannot change your own role or permissions here."), "self note");
  assert.doesNotMatch(renderManagement(), /You cannot change your own/);
});

test("security rows expose status, password, and telegram operations with consequences", () => {
  const activeHtml = renderSecurity(operator);
  assert.ok(activeHtml.includes("Security"), "section");
  assert.ok(activeHtml.includes("Account status") && activeHtml.includes("Active"), "status fact");
  assert.ok(activeHtml.includes("blocks account access"), "disable consequence");
  assert.ok(activeHtml.includes("Disable account"), "disable action");
  assert.ok(activeHtml.includes("Reset password") && activeHtml.includes("revokes sessions"), "password row");
  assert.ok(activeHtml.includes("Connected") && activeHtml.includes("Disconnect Telegram"), "telegram row");
  assert.ok(activeHtml.includes("managed by the account owner"), "owner note");
  const disabledHtml = renderSecurity({ ...operator, disabled: true });
  assert.ok(disabledHtml.includes("Enable account") && disabledHtml.includes("restores account access"), "enable row");
  assert.doesNotMatch(disabledHtml, /Disable account/);
  const offlineHtml = renderSecurity({ ...operator, telegramStatus: "NOT_CONNECTED" }, false);
  assert.ok(offlineHtml.includes("Not connected"), "offline fact");
  assert.doesNotMatch(offlineHtml, /Disconnect Telegram/);
  const brokenHtml = renderSecurity({ ...operator, telegramStatus: "BROKEN" });
  assert.ok(brokenHtml.includes("Not connected") && brokenHtml.includes("Disconnect Telegram"), "broken stays disconnectable");
});

test("dialog errors stay scoped to the open operation", () => {
  const source = readFileSync("src/components/admin-user-detail.tsx", "utf8");
  for (const kind of ["demote", "disable", "reset", "telegram"]) {
    assert.ok(source.includes(`open={confirm === "${kind}"`), `${kind} dialog wiring`);
    assert.ok(source.includes(`{dialogError("${kind}")}`), `${kind} error scoping`);
  }
  assert.ok(source.includes("const closeConfirmation = (kind: \"demote\" | \"disable\" | \"reset\" | \"telegram\") => (open: boolean) =>"), "dialog adapter");
});

test("access composition reuses the accepted create grouping without touching Screen 3", () => {
  const detail = readFileSync("src/components/admin-user-detail.tsx", "utf8");
  assert.ok(detail.includes("CREATE_CAPABILITY_GROUPS") && detail.includes("toggleCreatePermission"), "shared pattern");
  assert.doesNotMatch(detail, /PermissionSelector/);
  assert.ok(detail.includes("AdminAccessManagement") && detail.includes("AdminSecuritySection") && detail.includes("AdminAccessPendingChanges"), "pure units");
  assert.ok(detail.includes("isAccessDirty") && detail.includes("disabled={busy || self || !dirty}"), "dirty-gated save");
  const create = readFileSync("src/components/admin-user-create-form.tsx", "utf8");
  assert.doesNotMatch(create, /admin-user-detail-access/);
});

test("security copy exists in UK RU and EN", () => {
  const messages = readFileSync("src/i18n/messages.ts", "utf8");
  for (const key of ["admin.user.access.pendingChanges", "admin.user.access.added", "admin.user.access.removed", "admin.user.access.selfLocked", "admin.user.security.title", "admin.user.security.accountStatus", "admin.user.security.password", "admin.user.security.disableAccount", "admin.user.security.enableAccount", "admin.user.security.disableConsequence", "admin.user.security.enableConsequence", "admin.user.security.resetConsequence", "admin.user.security.telegramOwner"]) {
    const line = messages.split("\n").find((candidate) => candidate.includes(`"${key}"`));
    assert.ok(line, key); assert.match(line, /ru:\s*"[^"]+"/); assert.match(line, /uk:\s*"[^"]+"/); assert.match(line, /en:\s*"[^"]+"/);
  }
  assert.ok(renderPending(admin, "USER", [], "uk").includes("Незбережені зміни"), "uk pending");
  assert.ok(renderSecurity(operator, true, "ru").includes("Безопасность"), "ru security");
  assert.ok(renderManagement({ role: "ADMIN", user: admin, self: true }, "ru").includes("Здесь нельзя изменить собственные роль и разрешения."), "ru self note");
});

test("access styling stays structural without decoration", () => {
  const css = readFileSync("src/styles/admin-user-detail-access.css", "utf8");
  assert.match(css, /\.admin-user-detail-access[\s\S]*?max-width:\s*820px/);
  assert.match(css, /\.admin-user-detail-access__form[\s\S]*?display:\s*grid/);
  assert.match(css, /\.admin-user-detail-access__save[\s\S]*?justify-self:\s*start/);
  assert.match(css, /\.admin-user-detail-access__matrix-row[\s\S]*?grid-template-columns:\s*200px minmax\(0, 1fr\)/);
  assert.match(css, /\.admin-user-detail-access__security-row \+ \.admin-user-detail-access__security-row[\s\S]*?border-top/);
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*?\.admin-user-detail-access__matrix-row[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  for (const forbidden of ["box-shadow", "linear-gradient", "text-shadow", "transition:", "animation:", "border-radius"]) assert.doesNotMatch(css, new RegExp(forbidden));
});

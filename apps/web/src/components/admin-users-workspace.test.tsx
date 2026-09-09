import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n/client";
import type { AdminManagedUser } from "../lib/admin-users/admin-users-contract";
import { EMPTY_ADMIN_USERS_QUERY } from "../lib/admin-users/admin-users-directory-model";
import { AdminUsersWorkspace } from "./admin-users-workspace";

const admin: AdminManagedUser = { id: "internal-admin-id", login: "owner", role: "ADMIN", disabled: false, mustChangePassword: false, permissions: [], telegramStatus: "CONNECTED", createdAt: "2026-08-01T10:00:00Z", updatedAt: "2026-09-01T10:00:00Z" };
const user: AdminManagedUser = { id: "internal-user-id", login: "operator", role: "USER", disabled: true, mustChangePassword: true, permissions: ["vehicles.view", "trips.view", "reports.view"], telegramStatus: "BROKEN", createdAt: "2026-08-02T10:00:00Z", updatedAt: "2026-09-02T10:00:00Z" };
const render = (node: React.ReactNode, locale: "uk" | "ru" | "en" = "en") => renderToStaticMarkup(<I18nProvider locale={locale}>{node}</I18nProvider>);

test("directory records expose identity, simple authority, factual state and one descriptive detail action", () => {
  const html = render(<AdminUsersWorkspace users={[admin, user]} actorId={admin.id} initialQuery={EMPTY_ADMIN_USERS_QUERY} />);
  for (const text of ["owner", "You", "Administrator", "Full administrative authority", "operator", "User", "Permissions: 3", "Disabled", "Password change required", "Connected", "Not connected", "Open account operator"]) assert.ok(html.includes(text), text);
  for (const forbidden of ["vehicles.view", "trips.view", "BROKEN", "CONNECTED", "createdAt", "passwordHash", "telegramChatId", "Attention", "Risk", "Health"]) assert.doesNotMatch(html, new RegExp(forbidden));
});

test("empty no-results and load failure remain distinct and recoverable", () => {
  const empty = render(<AdminUsersWorkspace users={[]} actorId={admin.id} initialQuery={EMPTY_ADMIN_USERS_QUERY} />);
  const noResults = render(<AdminUsersWorkspace users={[admin]} actorId={admin.id} initialQuery={{ ...EMPTY_ADMIN_USERS_QUERY, q: "missing" }} />);
  const error = render(<AdminUsersWorkspace users={null} actorId={admin.id} initialQuery={EMPTY_ADMIN_USERS_QUERY} />);
  assert.match(empty, /No accounts exist/); assert.doesNotMatch(empty, /current filters|unavailable/);
  assert.match(noResults, /No accounts match the current filters/); assert.match(noResults, /Reset filters/);
  assert.match(error, /Accounts unavailable/); assert.match(error, /Retry/); assert.doesNotMatch(error, /Showing 0 of 0/);
});

test("responsive composition uses one Ant table or one continuous divided list and no horizontal scroll", () => {
  const source = readFileSync("src/components/admin-users-workspace.tsx", "utf8");
  const css = readFileSync("src/styles/admin-users.css", "utf8");
  assert.match(source, /screens\.lg \? <AdminUsersTable/); assert.match(source, /<Listy className="admin-users-list"/); assert.match(source, /<Table<AdminManagedUser>/);
  assert.doesNotMatch(source, /scroll=\{\{ x:|pagination=\{\{|Drawer|Tag/);
  assert.match(css, /@media \(max-width: 767px\)/); assert.match(css, /@media \(max-width: 575px\)/);
  assert.doesNotMatch(css, /overflow-x|box-shadow|border-radius|linear-gradient|#[0-9a-f]{3,8}|transition:/i);
});

test("new concise directory copy exists in UK RU and EN", () => {
  const messages = readFileSync("src/i18n/messages.ts", "utf8");
  for (const key of ["navigation.adminSwitcherLabel", "admin.users.search", "admin.users.fullAuthority", "admin.users.permissionsCount", "admin.users.telegramNotConnected", "admin.users.showing", "admin.users.noMatches", "admin.users.errorTitle", "admin.users.loading"]) {
    const line = messages.split("\n").find((candidate) => candidate.includes(`"${key}"`));
    assert.ok(line, key); assert.match(line, /ru:\s*"[^"]+"/); assert.match(line, /uk:\s*"[^"]+"/); assert.match(line, /en:\s*"[^"]+"/);
  }
});

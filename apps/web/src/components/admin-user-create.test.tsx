import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AUTH_PERMISSIONS } from "../lib/auth/auth-contract";
import { I18nProvider } from "../i18n/client";
import { AdminUserCreateFields, AdminUserCreateSuccess, CREATE_CAPABILITY_GROUPS, buildCreateUserPayload, toggleCreatePermission } from "./admin-user-create-form";

const fields = (overrides: Partial<React.ComponentProps<typeof AdminUserCreateFields>> = {}, locale: "uk" | "ru" | "en" = "en") => renderToStaticMarkup(<I18nProvider locale={locale}><AdminUserCreateFields login="" role="USER" permissions={[]} access={{ mode: null, groupIds: [], vehicleIds: [] }} groups={[]} vehicles={[]} accessError={null} busy={false} loginError={null} error={null} onLoginChange={() => undefined} onRoleChange={() => undefined} onTogglePermission={() => undefined} onAccessModeChange={() => undefined} onToggleAccessGroup={() => undefined} onToggleAccessVehicle={() => undefined} onSubmit={() => undefined} {...overrides} /></I18nProvider>);

test("USER payload keeps the normalized selection while ADMIN payload carries no permissions", () => {
  assert.deepEqual(buildCreateUserPayload("operator", "USER", ["trips.view"], { mode: "ALL", groupIds: [], vehicleIds: [] }), { login: "operator", role: "USER", permissions: ["vehicles.view", "trips.view"], vehicleAccess: { mode: "ALL", groupIds: [], vehicleIds: [] } });
  assert.deepEqual(buildCreateUserPayload("owner", "ADMIN", ["fleet.view"]), { login: "owner", role: "ADMIN", permissions: [], vehicleAccess: { mode: "ALL", groupIds: [], vehicleIds: [] } });
  assert.deepEqual(buildCreateUserPayload("  operator  ", "USER", [], { mode: "SELECTED", groupIds: ["g"], vehicleIds: ["v"] }), { login: "  operator  ", role: "USER", permissions: [], vehicleAccess: { mode: "SELECTED", groupIds: ["g"], vehicleIds: ["v"] } });
});

test("capability groups cover every permission exactly once with readable labels", () => {
  const grouped = CREATE_CAPABILITY_GROUPS.flatMap((group) => [...group.permissions]);
  assert.deepEqual([...grouped].sort(), [...AUTH_PERMISSIONS].sort());
  assert.equal(new Set(grouped).size, AUTH_PERMISSIONS.length);
  const html = fields();
  for (const title of ["Fleet operations", "Vehicle &amp; trip analysis", "Reporting", "GPS history operations"]) assert.ok(html.includes(title), title);
  for (const label of ["Fleet", "Map", "Events", "Vehicles", "Trips", "Reports", "View GPS history", "Populate GPS history"]) assert.ok(html.includes(label), label);
  for (const raw of AUTH_PERMISSIONS) assert.ok(!html.includes(raw), raw);
});

test("permission dependencies are automatic and understandable", () => {
  assert.deepEqual(toggleCreatePermission([], "trips.view", true), ["vehicles.view", "trips.view"]);
  assert.deepEqual(toggleCreatePermission([], "historyAdmin.populate", true), ["historyAdmin.view", "historyAdmin.populate"]);
  assert.deepEqual(toggleCreatePermission(["vehicles.view", "trips.view"], "vehicles.view", false), []);
  assert.deepEqual(toggleCreatePermission(["fleet.view"], "fleet.view", false), []);
  const html = fields();
  assert.ok(html.includes("Requires:"), "dependency prefix");
  assert.ok(html.includes("Requires: Vehicles"), "trips requirement");
  assert.ok(html.includes("Requires: View GPS history"), "populate requirement");
});

test("resulting access summarizes ADMIN authority and USER selections factually", () => {
  const adminHtml = fields({ role: "ADMIN" });
  assert.ok(adminHtml.includes("Administrator"), "admin role");
  assert.ok(adminHtml.includes("Full administrative authority"), "admin authority");
  assert.doesNotMatch(adminHtml, /checkbox/i);
  const userHtml = fields({ permissions: ["fleet.view", "vehicles.view", "trips.view"] });
  assert.ok(userHtml.includes("User"), "user role");
  assert.ok(userHtml.includes("Permissions"), "permissions row");
  assert.ok(userHtml.includes("Permissions: 3"), "permission count");
  assert.ok(userHtml.includes("Fleet, Vehicles, Trips"), "permission list");
  const emptyHtml = fields();
  assert.ok(emptyHtml.includes("No access"), "empty selection");
});

test("USER creation requires an explicit vehicle access decision", () => {
  const undecided = fields({ access: { mode: null, groupIds: [], vehicleIds: [] }, accessError: "Choose vehicle access: all or selected." });
  assert.ok(undecided.includes("Vehicle access"), "access section");
  assert.ok(undecided.includes("Choose vehicle access: all or selected."), "explicit choice error");
  assert.ok(undecided.includes("All vehicles") && undecided.includes("Selected vehicles and groups"), "mode choice");
  const adminHtml = fields({ role: "ADMIN" });
  assert.ok(adminHtml.includes("full fleet access"), "admin fleet note");
});

test("login keeps native constraints and surfaces concise validation near the field", () => {
  const html = fields({ loginError: "Enter your login" });
  assert.match(html, /name="login"|id="create-login"/);
  assert.match(html, /autocomplete="off"/i);
  assert.match(html, /role="alert"/);
  assert.ok(html.includes("Enter your login"), "validation message");
});

test("success handoff names the account, masks the secret, and requires a password change", () => {
  const secret = "B".repeat(24);
  const html = renderToStaticMarkup(<I18nProvider locale="en"><AdminUserCreateSuccess login="operator" secret={secret} onDone={() => undefined} /></I18nProvider>);
  assert.ok(html.includes("User created"), "created heading");
  assert.ok(html.includes("operator"), "login fact");
  assert.match(html, /••••••••••••••••••••••••/);
  assert.equal(html.includes(secret), false);
  assert.ok(html.includes("The user must change it after signing in."), "must-change note");
  assert.ok(html.includes("Done"), "done action");
});

test("form keeps values on failure and never exposes the secret outside the handoff", () => {
  const source = readFileSync("src/components/admin-user-create-form.tsx", "utf8");
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|document\.cookie|console\.|location\.|\bDELETE\b/);
  assert.doesNotMatch(source, /type=["']password/);
  assert.doesNotMatch(source, /body\.message|\.message\s*\?\?/);
  assert.match(source, /disabled=\{busy\}/);
  assert.match(source, /if \(pendingRef\.current\) return;/);
  assert.match(source, /setSecret\(result\.temporaryPassword\)/);
  assert.match(source, /<OneTimePassword password=\{secret\}/);
  assert.match(source, /router\.push\("\/admin\/users"\)/);
  assert.match(source, /fetch\("\/api\/admin\/users", \{ method: "POST"/);
});

test("create copy exists in UK RU and EN", () => {
  const messages = readFileSync("src/i18n/messages.ts", "utf8");
  for (const key of ["admin.user.create.description", "admin.user.create.groupFleet", "admin.user.create.groupVehicles", "admin.user.create.groupReports", "admin.user.create.groupHistory", "admin.user.create.permissions", "admin.user.create.resultingAccess", "admin.user.create.mustChangeSignIn"]) {
    const line = messages.split("\n").find((candidate) => candidate.includes(`"${key}"`));
    assert.ok(line, key); assert.match(line, /ru:\s*"[^"]+"/); assert.match(line, /uk:\s*"[^"]+"/); assert.match(line, /en:\s*"[^"]+"/);
  }
  const uk = fields({}, "uk");
  assert.ok(uk.includes("Створити користувача"), "uk create");
  assert.ok(uk.includes("Операції автопарку"), "uk group");
  const ru = fields({ role: "ADMIN" }, "ru");
  assert.ok(ru.includes("Полные административные полномочия"), "ru authority");
});

test("create styling stays within the low-cost decorative budget", () => {
  const css = readFileSync("src/styles/admin-user-create-v2.css", "utf8");
  assert.match(css, /max-width:\s*760px/);
  assert.match(css, /\.admin-user-create-v2__matrix[\s\S]*?border:\s*1px solid var\(--line\)/);
  assert.match(css, /\.admin-user-create-v2__matrix-row[\s\S]*?grid-template-columns:\s*200px minmax\(0, 1fr\)/);
  assert.match(css, /\.admin-user-create-v2__matrix-row \+ \.admin-user-create-v2__matrix-row[\s\S]*?border-top/);
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(css, /\.admin-user-create-v2__submit[\s\S]*?justify-self:\s*start/);
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*?\.admin-user-create-v2__matrix-controls[\s\S]*?flex-direction:\s*column/);
  for (const forbidden of ["box-shadow", "linear-gradient", "text-shadow", "transition:", "animation:", "border-radius"]) assert.doesNotMatch(css, new RegExp(forbidden));
});

test("access groups own their options and internal headings stay subordinate to the page title", () => {
  const html = fields();
  assert.equal(html.match(/class="admin-user-create-v2__matrix-row"/g)?.length ?? 0, 4);
  assert.equal(html.match(/class="admin-user-create-v2__matrix-controls"/g)?.length ?? 0, 4);
  assert.ok(html.includes("Fleet operations") && html.indexOf("Fleet operations") < html.indexOf("Fleet</span>"), "label precedes controls");
  assert.ok(html.includes("<h3"), "restrained section headings");
  assert.doesNotMatch(html, /<h2/);
  assert.ok(html.includes("admin-user-create-v2__submit"), "submit hook");
  const populated = fields({ permissions: ["fleet.view", "map.view", "events.view", "vehicles.view", "trips.view", "reports.view"] });
  assert.ok(populated.includes("Permissions: 6"), "populated resulting access");
  assert.ok(populated.includes("Fleet, Map, Events, Vehicles, Trips, Reports"), "readable permission list");
  const empty = fields();
  assert.ok(empty.includes("Role") && empty.includes("No access"), "structured resulting access");
});

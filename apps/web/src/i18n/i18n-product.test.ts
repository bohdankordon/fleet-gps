import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { AUTH_PERMISSIONS } from "../lib/auth/auth-contract";
import { auditItemsFixture } from "../lib/audit/audit-fixture";
import { auditActorLabel, auditDetailsLines, auditEventLabel, auditTargetTypeLabel } from "../lib/audit/audit-ui-model";
import { adminUserErrorMessage } from "./errors";
import { createTranslator } from "./core";
import { permissionLabel, roleLabel } from "./domain-labels";
import { SUPPORTED_LOCALES } from "./locales";

test("roles and every canonical permission have localized labels while codes stay unchanged", () => {
  assert.deepEqual(AUTH_PERMISSIONS, ["fleet.view", "map.view", "events.view", "vehicles.view", "trips.view", "reports.view", "historyAdmin.view", "historyAdmin.populate"]);
  for (const locale of SUPPORTED_LOCALES) {
    assert.notEqual(roleLabel("ADMIN", locale), "ADMIN");
    assert.notEqual(roleLabel("USER", locale), "USER");
    for (const permission of AUTH_PERMISSIONS) {
      assert.ok(permissionLabel(permission, locale).length > 1, `${locale}:${permission}`);
      assert.notEqual(permissionLabel(permission, locale), permission);
    }
  }
  assert.deepEqual([roleLabel("ADMIN", "ru"), roleLabel("ADMIN", "uk"), roleLabel("ADMIN", "en")], ["Администратор", "Адміністратор", "Administrator"]);
  assert.deepEqual([roleLabel("USER", "ru"), roleLabel("USER", "uk"), roleLabel("USER", "en")], ["Пользователь", "Користувач", "User"]);
});

test("known errors are localized and unknown raw backend messages never become UI authority", () => {
  const raw = "СЕКРЕТНОЕ СООБЩЕНИЕ BACKEND";
  for (const locale of SUPPORTED_LOCALES) {
    const t = createTranslator(locale);
    for (const key of ["auth.login.invalidCredentials", "history.population.already", "history.retention.error.stale", "audit.loadError"] as const) assert.ok(t(key).length > 5, `${locale}:${key}`);
    assert.equal(adminUserErrorMessage({ error: "DUPLICATE_LOGIN", message: raw }, t, "create"), t("admin.user.error.DUPLICATE_LOGIN"));
    assert.equal(adminUserErrorMessage({ error: "Internal Server Error", message: raw }, t, "create"), t("admin.user.createError"));
    assert.equal(adminUserErrorMessage({ message: raw }, t), t("admin.user.actionError"));
    assert.equal(adminUserErrorMessage({ message: raw }, t).includes(raw), false);
  }
  const sources = `${readFileSync("src/components/admin-user-create-form.tsx", "utf8")}\n${readFileSync("src/components/admin-user-detail.tsx", "utf8")}\n${readFileSync("src/components/change-password-form.tsx", "utf8")}`;
  assert.doesNotMatch(sources, /body\.message|\.message\s*\?\?/);
});

test("representative audit events, SYSTEM actor, targets, and unavailable details localize in all locales", () => {
  const items = auditItemsFixture();
  const requested = ["USER_CREATED", "USER_ACCESS_CHANGED", "SHORT_POPULATION_EXECUTED", "AUTOMATIC_RETENTION_EXECUTED"] as const;
  for (const locale of SUPPORTED_LOCALES) {
    for (const eventType of requested) {
      const item = items.find((candidate) => candidate.eventType === eventType)!;
      assert.equal(item.eventType, eventType);
      assert.ok(auditEventLabel(eventType, locale).length > 4);
      assert.ok(auditTargetTypeLabel(item.target.type, locale).length > 3);
      assert.ok(auditDetailsLines(item, locale).every((line) => line.length > 2));
    }
    const system = items.find((item) => item.actor.type === "SYSTEM")!;
    assert.equal(auditActorLabel(system, locale), createTranslator(locale)("audit.actor.system"));
    const unavailable = { ...items[0]!, details: { status: "UNAVAILABLE" as const } };
    assert.deepEqual(auditDetailsLines(unavailable, locale), [createTranslator(locale)("audit.unavailableDetails")]);
  }
});

test("all ten major surface groups expose source-controlled copy in ru, uk, and en", () => {
  const representatives = {
    authentication: "auth.login.title",
    navigation: "navigation.fleet",
    dashboard: "dashboard.description",
    vehicles: "vehicle.eyebrow",
    events: "events.title",
    trips: "trips.title",
    reports: "reports.title",
    history: "history.title",
    adminUsers: "admin.users.title",
    audit: "audit.description",
  } as const;
  for (const [surface, key] of Object.entries(representatives)) {
    for (const locale of SUPPORTED_LOCALES) {
      const message = createTranslator(locale)(key);
      assert.ok(message.length > 1, `${surface}:${locale}`);
      assert.notEqual(message, key);
    }
  }
});

test("selector is global, single-POST, non-submitting, non-retrying, and route-stable", () => {
  const selector = readFileSync("src/components/language-selector.tsx", "utf8");
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  assert.match(layout, /<LanguageSelector/);
  assert.match(layout, /<AuthProvider/);
  for (const expected of ["Русский", "Українська", "English"]) assert.ok(readFileSync("src/i18n/locales.ts", "utf8").includes(expected));
  assert.match(selector, /aria-pressed=\{value === locale\}/);
  assert.match(selector, /type="button"/);
  assert.match(selector, /disabled=\{pending\}/);
  assert.match(selector, /router\.refresh\(\)/);
  assert.equal((selector.match(/fetch\("\/api\/preferences\/locale"/g) ?? []).length, 1);
  assert.doesNotMatch(selector, /router\.(?:push|replace)|logout|taxi_session|retry|setTimeout|setInterval/i);
});

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? filesUnder(join(directory, entry.name)) : [join(directory, entry.name)]);
}

test("locale is cookie-only with no schema, migration, auth, audit, or external translation integration", () => {
  const schema = readFileSync("../../apps/api/prisma/schema.prisma", "utf8");
  assert.doesNotMatch(schema, /\blocale\b|taxi_locale/i);
  const migrations = readdirSync("../../apps/api/prisma/migrations", { withFileTypes: true }).filter((entry) => entry.isDirectory());
  assert.equal(migrations.length, 11);
  for (const migration of migrations) assert.doesNotMatch(readFileSync(join("../../apps/api/prisma/migrations", migration.name, "migration.sql"), "utf8"), /taxi_locale|\blocale\b/i);
  const preference = readFileSync("src/lib/preferences/locale-preference.ts", "utf8");
  assert.doesNotMatch(preference, /AuthUser|ApplicationSettings|AuditEvent|prisma|fetch\(/);
  const packageJson = readFileSync("package.json", "utf8");
  assert.doesNotMatch(packageJson, /i18next|formatjs|lingui|lokalise|crowdin|phrase/i);
  const i18nSource = filesUnder("src/i18n").filter((file) => !file.includes(".test.")).map((file) => readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(i18nSource, /https?:\/\/|fetch\(|XMLHttpRequest|WebSocket/);
});


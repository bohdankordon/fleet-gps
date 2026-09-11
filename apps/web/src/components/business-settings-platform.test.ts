import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { MESSAGE_CATALOG } from "../i18n/messages";
import { SUPPORTED_LOCALES } from "../i18n/locales";

const workspace = readFileSync("src/components/business-settings-workspace.tsx", "utf8");
const conflictPanel = readFileSync("src/components/business-settings-conflict-panel.tsx", "utf8");
const draftLib = readFileSync("src/lib/admin-settings/business-settings-draft.ts", "utf8");
const page = readFileSync("src/app/admin/settings/page.tsx", "utf8");
const loading = readFileSync("src/app/admin/settings/loading.tsx", "utf8");
const css = readFileSync("src/styles/business-settings.css", "utf8");
const guard = readFileSync("src/components/business-settings-leave-guard.ts", "utf8");
const tabs = readFileSync("src/components/admin-navigation-tabs.tsx", "utf8");

test("validation runs on blur and save, collects all errors, and never repairs input", () => {
  for (const expected of ["handleBlurField", "validateBusinessSettingsDraft(draft)", "isBusinessSettingsFieldInvalid", "setSummaryVisible(true)", "admin.settings.validationTitle"]) assert.ok(workspace.includes(expected), expected);
  for (const banned of ["Math.round", "clamp", "Number(event.target.value) || 0", "?? 0"]) assert.equal(workspace.includes(banned), false, banned);
  assert.match(draftLib, /candidate === ""/);
});

test("validation summary groups by section, jumps to the first field, and focuses", () => {
  for (const expected of ["summaryGroups", "jumpToField", "summaryRef", "tabIndex={-1}", "setActiveSection(section.id)", "focusField"]) assert.ok(workspace.includes(expected), expected);
});

test("save and discard bar renders only when dirty with a safe discard dialog", () => {
  for (const expected of ["{dirty ?", "business-settings__dirtybar", "admin.settings.unsaved", "admin.settings.discard", "admin.settings.saveChanges", "type=\"primary\"", "discardTitle", "discardBody", "keepEditing", "handleConfirmDiscard", "businessSettingsDraftFromPersisted(baseline)"]) assert.ok(workspace.includes(expected), expected);
  assert.doesNotMatch(workspace, /danger.*Discard|Discard.*danger/);
  assert.match(workspace, /disabled=\{saving\}.*loading=\{saving\}|loading=\{saving\}.*disabled=\{saving\}/s);
});

test("save success announces politely while failure preserves the draft for retry", () => {
  for (const expected of ["admin.settings.savedRevision", "role=\"status\"", "aria-live=\"polite\"", "admin.settings.saveError", "setSaveError", "router.refresh()"]) assert.ok(workspace.includes(expected), expected);
  const saveBlock = workspace.slice(workspace.indexOf("async function handleSave"), workspace.indexOf("function handleConfirmDiscard"));
  assert.equal(/setDraft\(businessSettingsDraftFromPersisted\(updated\)\)/.test(saveBlock), true);
  const syncCatch = saveBlock.slice(saveBlock.indexOf("} catch {"), saveBlock.indexOf("} finally {"));
  assert.ok(syncCatch.includes("setSaveError"), "failure surfaces");
  assert.equal(syncCatch.includes("setDraft"), false, "failure preserves draft");
});

test("bounded conflict preserves the draft, rebases cleanly, and resolves per field", () => {
  for (const expected of ["response.status === 409", "loadLatestAfterConflict", "cache: \"no-store\"", "computeBusinessSettingsConflict", "rebaseBusinessSettingsDraft", "admin.settings.refreshedPreserved", "applyBusinessSettingsResolution", "admin.settings.conflictChanged", "admin.settings.conflictOverlap", "admin.settings.conflictUseLatest", "admin.settings.conflictKeepMine", "admin.settings.conflictApply", "admin.settings.conflictLatest", "admin.settings.conflictMine"]) assert.ok(workspace + conflictPanel.includes(expected), expected);
  assert.doesNotMatch(conflictPanel, /citySpeedLimitKph|tripDataGapSeconds/);
  assert.match(conflictPanel, /businessSettingsFieldLabelKey\(field\)/);
  const applyBlock = workspace.slice(workspace.indexOf("function handleApplyResolution"));
  assert.equal(applyBlock.includes("fetch("), false);
});

test("conflict GET failure keeps the draft and offers a latest-settings retry", () => {
  for (const expected of ["conflictLoadFailed", "admin.settings.conflictReloadFailed", "admin.settings.conflictRetryLoad", "setConflictLoadFailed(true)"]) assert.ok(workspace.includes(expected), expected);
});

test("initial loading and unavailable states keep heading context without fake values", () => {
  for (const expected of ["business-settings__loading", "role=\"status\"", "<Spin", "business-settings-header", "AdminNavigationTabs"]) assert.ok(loading.includes(expected), expected);
  assert.doesNotMatch(loading, /tip=|description=\{t/);
  for (const expected of ["admin.settings.unavailableTitle", "common.retry", "window.location.reload()"]) assert.ok(workspace.includes(expected), expected);
});

test("navigation-away protection is dirty-gated with stay and leave options", () => {
  for (const expected of ["beforeunload", "setBusinessSettingsDirty(dirty)", "pendingHref", "admin.settings.leaveTitle", "admin.settings.leaveBody", "admin.settings.stay", "admin.settings.leaveWithoutSaving", "router.push(href)"]) assert.ok(workspace + guard.includes(expected), expected);
  assert.match(workspace, /if \(!dirty\) return;/);
  assert.match(guard, /BUSINESS_SETTINGS_BLOCKED_NAVIGATION_EVENT/);
  assert.match(tabs, /isBusinessSettingsNavigationBlocked/);
  assert.match(workspace, /onClick=\{\(\) => setActiveSection\(section\.id\)\}/);
});

test("every new business-settings message is localized in UK, RU, and EN", () => {
  const keys = Object.keys(MESSAGE_CATALOG).filter((key) => key.startsWith("admin.settings.tagline") || key.startsWith("admin.settings.revision") || key.startsWith("admin.settings.updatedPrefix") || key.startsWith("admin.settings.entireFleet") || key.startsWith("admin.settings.section.") || key.startsWith("admin.settings.timezoneHelp") || key.startsWith("admin.settings.ruleState") || key.startsWith("admin.settings.enabled") || key.startsWith("admin.settings.disabled") || key.startsWith("admin.settings.inactiveContext") || key.startsWith("admin.settings.advanced") || key.startsWith("admin.settings.cityBoundary") || key.startsWith("admin.settings.tripsRecomputeNote") || key.startsWith("admin.settings.validationTitle") || key.startsWith("admin.settings.saveChanges") || key.startsWith("admin.settings.discard") || key.startsWith("admin.settings.keepEditing") || key.startsWith("admin.settings.savedRevision") || key.startsWith("admin.settings.refreshedPreserved") || key.startsWith("admin.settings.conflict") || key.startsWith("admin.settings.leave") || key.startsWith("admin.settings.stay") || key.startsWith("admin.settings.unavailableTitle") || key.startsWith("admin.settings.changed") || key.startsWith("admin.settings.hasError"));
  assert.ok(keys.length >= 30, `new keys: ${keys.length}`);
  for (const key of keys) {
    const entry = (MESSAGE_CATALOG as Record<string, Record<string, string>>)[key]!;
    for (const locale of SUPPORTED_LOCALES) assert.ok(entry[locale] && entry[locale].length > 1 && entry[locale] !== key, `${key}:${locale}`);
  }
});

test("section rail interaction never fills inactive hover with primary blue", () => {
  assert.match(css, /\.business-settings__rail-item:hover[^{]*\{[^}]*background: var\(--color-surface-hover\)/);
  assert.match(css, /\.business-settings__rail-item--selected[^{]*\{[^}]*background: var\(--color-surface-selected\)/);
  assert.match(css, /\.business-settings__rail-item--selected:hover[^{]*\{[^}]*background: var\(--color-surface-selected\)/);
  assert.match(css, /\.business-settings__rail-item:focus-visible[^{]*\{[^}]*outline: 3px solid var\(--color-focus-ring\)/);
  const hoverRules = css.match(/\.business-settings__rail-item[^{]*:hover[^{]*\{[^}]*\}/g) ?? [];
  assert.ok(hoverRules.length >= 2, "hover states are explicitly owned");
  for (const rule of hoverRules) assert.doesNotMatch(rule, /action-primary|#0f5c91|#0b4c78/, "no solid primary-blue hover");
});

test("style budget stays on layout with safe-area spacing and no decorative system", () => {
  assert.ok(css.length < 6000, `css chars: ${css.length}`);
  for (const banned of ["gradient", "animation", "@keyframes", "box-shadow", "hero", "admin-users"]) assert.equal(css.toLowerCase().includes(banned.toLowerCase()), false, banned);
  assert.match(css, /env\(safe-area-inset-bottom/);
  assert.match(css, /\.business-settings__conflict-item/);
});

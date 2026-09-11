import type { AdminSettings } from "./admin-settings-contract";
import { numericAdminSettingsBounds, type EditableAdminSettings } from "../../components/admin-settings-form-model";
import {
  BUSINESS_SETTINGS_EDITABLE_FIELDS,
  type BusinessSettingsEditableField,
} from "./business-settings-sections";

export type { BusinessSettingsEditableField };
export type BusinessSettingsDraft = EditableAdminSettings;

export function businessSettingsDraftFromPersisted(settings: AdminSettings): BusinessSettingsDraft {
  const { cityGeofence: _geofence, updatedAt: _updatedAt, revision: _revision, ...value } = settings;
  return value;
}

function draftValuesEqual(a: BusinessSettingsDraft[keyof BusinessSettingsDraft], b: BusinessSettingsDraft[keyof BusinessSettingsDraft]): boolean {
  return a === b;
}

export function businessSettingsChangedFields(draft: BusinessSettingsDraft, baseline: AdminSettings): BusinessSettingsEditableField[] {
  const base = businessSettingsDraftFromPersisted(baseline);
  return (BUSINESS_SETTINGS_EDITABLE_FIELDS as readonly BusinessSettingsEditableField[]).filter(
    (field) => !draftValuesEqual(draft[field], base[field]),
  );
}

export function isBusinessSettingsDirty(draft: BusinessSettingsDraft, baseline: AdminSettings): boolean {
  return businessSettingsChangedFields(draft, baseline).length > 0;
}

export function changedBusinessSettingsPayload(
  draft: BusinessSettingsDraft,
  baseline: AdminSettings,
): Readonly<{ revision: number } & Partial<BusinessSettingsDraft>> {
  const base = businessSettingsDraftFromPersisted(baseline);
  const payload: Partial<BusinessSettingsDraft> & { revision: number } = { revision: baseline.revision };
  for (const field of BUSINESS_SETTINGS_EDITABLE_FIELDS as readonly BusinessSettingsEditableField[]) {
    if (!draftValuesEqual(draft[field], base[field])) {
      (payload as Record<string, unknown>)[field] = draft[field];
    }
  }
  return Object.freeze(payload);
}

const ZERO_ALLOWED_NUMERIC_FIELDS = Object.freeze([
  "minimumDailyDistanceMeters",
  "speedToleranceKph",
  "inactivityDistanceMeters",
] as const);

export function isBusinessSettingsFieldInvalid(draft: BusinessSettingsDraft, field: BusinessSettingsEditableField): boolean {
  if (field === "timezone" || field === "speedRuleEnabled" || field === "inactivityRuleEnabled") {
    if (field !== "timezone") return typeof draft[field] !== "boolean";
    if (typeof draft.timezone !== "string" || draft.timezone.length === 0) return true;
    try {
      new Intl.DateTimeFormat("en-CA", { timeZone: draft.timezone }).format(new Date(0));
      return false;
    } catch {
      return true;
    }
  }
  const bounds = numericAdminSettingsBounds[field as keyof typeof numericAdminSettingsBounds];
  if (!bounds) return true;
  const candidate = draft[field as keyof BusinessSettingsDraft];
  if (candidate === "") return true;
  if (typeof candidate !== "number" || !Number.isSafeInteger(candidate)) return true;
  const [min, max] = bounds as readonly [number, number?];
  if (candidate < min) return true;
  if (max !== undefined && candidate > max) return true;
  void ZERO_ALLOWED_NUMERIC_FIELDS;
  return false;
}

export function validateBusinessSettingsDraft(draft: BusinessSettingsDraft): BusinessSettingsEditableField[] {
  return (BUSINESS_SETTINGS_EDITABLE_FIELDS as readonly BusinessSettingsEditableField[]).filter((field) =>
    isBusinessSettingsFieldInvalid(draft, field),
  );
}

export type BusinessSettingsConflictAnalysis = Readonly<{
  userChanged: readonly BusinessSettingsEditableField[];
  serverChanged: readonly BusinessSettingsEditableField[];
  overlap: readonly BusinessSettingsEditableField[];
}>;

export function computeBusinessSettingsConflict(
  original: AdminSettings,
  draft: BusinessSettingsDraft,
  latest: AdminSettings,
): BusinessSettingsConflictAnalysis {
  const origEditable = businessSettingsDraftFromPersisted(original);
  const latestEditable = businessSettingsDraftFromPersisted(latest);
  const userChanged = (BUSINESS_SETTINGS_EDITABLE_FIELDS as readonly BusinessSettingsEditableField[]).filter(
    (field) => !draftValuesEqual(draft[field], origEditable[field]),
  );
  const serverChanged = (BUSINESS_SETTINGS_EDITABLE_FIELDS as readonly BusinessSettingsEditableField[]).filter(
    (field) => !draftValuesEqual(latestEditable[field], origEditable[field]),
  );
  const userSet = new Set(userChanged);
  const serverSet = new Set(serverChanged);
  const overlap = (BUSINESS_SETTINGS_EDITABLE_FIELDS as readonly BusinessSettingsEditableField[]).filter(
    (field) => userSet.has(field) && serverSet.has(field) && !draftValuesEqual(draft[field], latestEditable[field]),
  );
  return Object.freeze({ userChanged: Object.freeze([...userChanged]), serverChanged: Object.freeze([...serverChanged]), overlap: Object.freeze([...overlap]) });
}

export function rebaseBusinessSettingsDraft(
  latest: AdminSettings,
  draft: BusinessSettingsDraft,
  original: AdminSettings,
): BusinessSettingsDraft {
  const latestEditable = businessSettingsDraftFromPersisted(latest);
  const origEditable = businessSettingsDraftFromPersisted(original);
  const rebased: Record<string, unknown> = { ...latestEditable };
  for (const field of BUSINESS_SETTINGS_EDITABLE_FIELDS as readonly BusinessSettingsEditableField[]) {
    if (!draftValuesEqual(draft[field], origEditable[field])) {
      rebased[field] = draft[field];
    }
  }
  return rebased as BusinessSettingsDraft;
}

export type BusinessSettingsConflictChoice = "mine" | "latest";

export function applyBusinessSettingsResolution(
  latest: AdminSettings,
  draft: BusinessSettingsDraft,
  original: AdminSettings,
  choices: Readonly<Partial<Record<BusinessSettingsEditableField, BusinessSettingsConflictChoice>>>,
): BusinessSettingsDraft {
  const latestEditable = businessSettingsDraftFromPersisted(latest);
  const origEditable = businessSettingsDraftFromPersisted(original);
  const resolved: Record<string, unknown> = { ...latestEditable };
  for (const field of BUSINESS_SETTINGS_EDITABLE_FIELDS as readonly BusinessSettingsEditableField[]) {
    const locallyChanged = !draftValuesEqual(draft[field], origEditable[field]);
    if (!locallyChanged) continue;
    const serverChanged = !draftValuesEqual(latestEditable[field], origEditable[field]);
    const isOverlap = serverChanged && !draftValuesEqual(draft[field], latestEditable[field]);
    if (isOverlap) {
      if (choices[field] === "mine") resolved[field] = draft[field];
    } else {
      resolved[field] = draft[field];
    }
  }
  return resolved as BusinessSettingsDraft;
}

export function formatBusinessSettingsUpdatedAt(locale: string, iso: string, timeZone: string): string | null {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone }).format(date);
  } catch {
    return null;
  }
}

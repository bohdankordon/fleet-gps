// Pure notification-preferences model: parsing, draft/dirty semantics,
// PATCH shaping, validation, and conflict merge without React, so the
// preference contract is unit-testable. Drafts never leave React memory.
import type { MessageKey } from "../../i18n/messages";

export type VehicleScope = "ALL" | "SELECTED";

export type PreferenceVehicle = Readonly<{ id: string; name: string; disabled: boolean; groupId: string | null; groupName: string | null }>;

export type PreferenceDraft = Readonly<{
  enabled: boolean;
  speedingEnabled: boolean;
  inactivityEnabled: boolean;
  vehicleScope: VehicleScope;
  selectedVehicleIds: readonly string[];
}>;

export type PreferenceBaseline = Readonly<{
  draft: PreferenceDraft;
  revision: number;
  canSelectVehicles: boolean;
  hasDormantSelections: boolean;
  vehicles: readonly PreferenceVehicle[];
}>;

export type PreferenceField = "enabled" | "speedingEnabled" | "inactivityEnabled" | "vehicleScope" | "selectedVehicleIds";

// Scalar fields are booleans or a binary scope, so a genuine same-field
// three-way conflict is impossible: whenever both sides moved, they moved
// to the same value. Vehicle sets union-merge from the common original.
// The merge is therefore total and the UI review never needs per-field
// Keep-mine/Use-latest choices.
export type FieldResolution = Readonly<{
  field: PreferenceField;
  resolution: "take-latest" | "keep-mine" | "resolved-same" | "merged";
  value: boolean | VehicleScope | readonly string[];
}>

function isScope(value: unknown): value is VehicleScope {
  return value === "ALL" || value === "SELECTED";
}

function isVehicle(value: unknown): value is PreferenceVehicle {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === "string" && typeof candidate.name === "string" && typeof candidate.disabled === "boolean" && (candidate.groupId === null || typeof candidate.groupId === "string") && (candidate.groupName === null || typeof candidate.groupName === "string");
}

function sameIdSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const owned = new Set(left);
  return right.every((id) => owned.has(id));
}

// Parses one authoritative preferences view. Anything malformed (or missing
// the capability metadata) is rejected so the screen renders unavailable
// instead of fabricated defaults. Unknown extras are dropped.
export function parsePreferenceBaseline(value: unknown): PreferenceBaseline | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.enabled !== "boolean"
    || typeof candidate.speedingEnabled !== "boolean"
    || typeof candidate.inactivityEnabled !== "boolean"
    || !isScope(candidate.vehicleScope)
    || !Array.isArray(candidate.selectedVehicleIds)
    || candidate.selectedVehicleIds.some((id) => typeof id !== "string")
    || !Number.isInteger(candidate.revision)
    || (candidate.revision as number) < 0
    || typeof candidate.canSelectVehicles !== "boolean"
    || typeof candidate.hasDormantSelections !== "boolean"
    || !Array.isArray(candidate.vehicles)
    || candidate.vehicles.some((vehicle) => !isVehicle(vehicle))
  ) return null;
  return Object.freeze({
    draft: Object.freeze({
      enabled: candidate.enabled,
      speedingEnabled: candidate.speedingEnabled,
      inactivityEnabled: candidate.inactivityEnabled,
      vehicleScope: candidate.vehicleScope,
      selectedVehicleIds: Object.freeze([...(candidate.selectedVehicleIds as string[])]),
    }),
    revision: candidate.revision as number,
    canSelectVehicles: candidate.canSelectVehicles as boolean,
    hasDormantSelections: candidate.hasDormantSelections as boolean,
    vehicles: Object.freeze((candidate.vehicles as PreferenceVehicle[]).map((vehicle) => Object.freeze({ id: vehicle.id, name: vehicle.name, disabled: vehicle.disabled, groupId: vehicle.groupId, groupName: vehicle.groupName }))),
  });
}

export function draftFromBaseline(baseline: PreferenceBaseline): PreferenceDraft {
  return { ...baseline.draft, selectedVehicleIds: [...baseline.draft.selectedVehicleIds] };
}

// Structural dirty detection. Vehicle IDs compare as a set (order never
// makes a draft dirty); vehicle fields are excluded without capability.
export function isDraftDirty(baseline: PreferenceBaseline, draft: PreferenceDraft): boolean {
  if (baseline.draft.enabled !== draft.enabled) return true;
  if (baseline.draft.speedingEnabled !== draft.speedingEnabled) return true;
  if (baseline.draft.inactivityEnabled !== draft.inactivityEnabled) return true;
  if (!baseline.canSelectVehicles) return false;
  if (baseline.draft.vehicleScope !== draft.vehicleScope) return true;
  return !sameIdSet(baseline.draft.selectedVehicleIds, draft.selectedVehicleIds);
}

export type PreferencesPatchBody = Readonly<Record<string, boolean | VehicleScope | readonly string[] | number>>;

// Shapes the exact PATCH body. Capability-gated keys are omitted without
// capability; IDs are de-duplicated (set semantics) and never trimmed or
// invented. Under ALL the preserved selection travels along untouched.
export function buildPreferencesPatchBody(baseline: PreferenceBaseline, draft: PreferenceDraft): PreferencesPatchBody {
  const body: Record<string, boolean | VehicleScope | readonly string[] | number> = {
    expectedRevision: baseline.revision,
    enabled: draft.enabled,
    speedingEnabled: draft.speedingEnabled,
    inactivityEnabled: draft.inactivityEnabled,
  };
  if (baseline.canSelectVehicles) {
    body.vehicleScope = draft.vehicleScope;
    body.selectedVehicleIds = Object.freeze([...new Set(draft.selectedVehicleIds)]);
  }
  return Object.freeze(body);
}

export type DraftValidationError = Readonly<{ field: "vehicleScope"; messageKey: MessageKey }>;

// The only client-checkable backend rule: SELECTED needs at least one
// visible vehicle, unless dormant stored selections exist that the backend
// hides but preserves. Everything else is valid input; the backend stays
// authoritative.
export function validatePreferencesDraft(draft: PreferenceDraft, canSelectVehicles: boolean, hasDormantSelections = false): readonly DraftValidationError[] {
  if (canSelectVehicles && draft.vehicleScope === "SELECTED" && draft.selectedVehicleIds.length === 0 && !hasDormantSelections) {
    return Object.freeze([{ field: "vehicleScope", messageKey: "telegram.preferences.error.selection" }]);
  }
  return Object.freeze([]);
}

// Three-way field merge after a 409: original baseline, user draft, latest
// server snapshot. Untouched fields take latest; one-sided edits are kept;
// matching edits resolve silently.
export function resolvePreferencesConflict(original: PreferenceDraft, mine: PreferenceDraft, latest: PreferenceDraft): readonly FieldResolution[] {
  const scalar = (field: PreferenceField, mineValue: boolean | VehicleScope, latestValue: boolean | VehicleScope, originalValue: boolean | VehicleScope): FieldResolution => {
    if (mineValue === latestValue) return { field, resolution: mineValue === originalValue ? "take-latest" : "resolved-same", value: latestValue };
    if (mineValue === originalValue) return { field, resolution: "take-latest", value: latestValue };
    return { field, resolution: "keep-mine", value: mineValue };
  };
  // Vehicle sets always merge from the common original: each side's
  // additions survive unless the other side removed that same vehicle, and
  // each side's removals stick. There is no ambiguous set state left that
  // would justify forcing an explicit whole-set choice.
  const mineSet = new Set(mine.selectedVehicleIds);
  const latestSet = new Set(latest.selectedVehicleIds);
  const originalSet = new Set(original.selectedVehicleIds);
  const mineAdded = mine.selectedVehicleIds.filter((id) => !originalSet.has(id));
  const mineRemoved = original.selectedVehicleIds.filter((id) => !mineSet.has(id));
  let ids: FieldResolution;
  if (sameIdSet(mine.selectedVehicleIds, latest.selectedVehicleIds)) {
    ids = { field: "selectedVehicleIds", resolution: sameIdSet(mine.selectedVehicleIds, original.selectedVehicleIds) ? "take-latest" : "resolved-same", value: [...latest.selectedVehicleIds] };
  } else if (sameIdSet(mine.selectedVehicleIds, original.selectedVehicleIds)) {
    ids = { field: "selectedVehicleIds", resolution: "take-latest", value: [...latest.selectedVehicleIds] };
  } else if (sameIdSet(latest.selectedVehicleIds, original.selectedVehicleIds)) {
    ids = { field: "selectedVehicleIds", resolution: "keep-mine", value: [...mine.selectedVehicleIds] };
  } else {
    const merged = [...latest.selectedVehicleIds, ...mineAdded.filter((id) => !latestSet.has(id))]
      .filter((id) => !mineRemoved.includes(id));
    ids = { field: "selectedVehicleIds", resolution: "merged", value: merged };
  }
  return Object.freeze([
    scalar("enabled", mine.enabled, latest.enabled, original.enabled),
    scalar("speedingEnabled", mine.speedingEnabled, latest.speedingEnabled, original.speedingEnabled),
    scalar("inactivityEnabled", mine.inactivityEnabled, latest.inactivityEnabled, original.inactivityEnabled),
    scalar("vehicleScope", mine.vehicleScope, latest.vehicleScope, original.vehicleScope),
    ids,
  ]);
}
// Selector ergonomics: 10 rows fit the ~610px Account working column with
// one-line wrapped names without turning the page into an endless list.
export const VEHICLE_PAGE_SIZE = 10;

// Local name-only search. Ephemeral UI state: never touches the draft,
// never saved, never placed in the URL.
export function filterVehiclesByName(vehicles: readonly PreferenceVehicle[], query: string): readonly PreferenceVehicle[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return vehicles;
  return Object.freeze(vehicles.filter((vehicle) => vehicle.name.toLowerCase().includes(needle)));
}

export function paginateVehicles<T>(items: readonly T[], page: number, pageSize: number): Readonly<{ items: readonly T[]; page: number; totalPages: number }> {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);
  return Object.freeze({ items: Object.freeze(items.slice((current - 1) * pageSize, current * pageSize)), page: current, totalPages });
}

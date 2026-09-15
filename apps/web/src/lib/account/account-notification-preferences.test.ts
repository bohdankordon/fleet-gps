import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPreferencesPatchBody,
  draftFromBaseline,
  filterVehiclesByName,
  isDraftDirty,
  paginateVehicles,
  parsePreferenceBaseline,
  resolvePreferencesConflict,
  validatePreferencesDraft,
  VEHICLE_PAGE_SIZE,
  type PreferenceBaseline,
} from "./account-notification-preferences";

const vehicles = Object.freeze([
  Object.freeze({ id: "11111111-1111-1111-8111-111111111111", name: "Car one", disabled: false }),
  Object.freeze({ id: "22222222-2222-2222-8222-222222222222", name: "Car two", disabled: true }),
]);
const view = (overrides: Record<string, unknown> = {}) => ({
  enabled: true,
  speedingEnabled: true,
  inactivityEnabled: false,
  vehicleScope: "SELECTED",
  selectedVehicleIds: ["11111111-1111-1111-8111-111111111111"],
  revision: 3,
  canSelectVehicles: true,
  hasDormantSelections: false,
  vehicles: [...vehicles],
  ...overrides,
});
const baseline = (): PreferenceBaseline => parsePreferenceBaseline(view())!;

test("valid reads parse including virtual revision 0, malformed reads fail", () => {
  const parsed = baseline();
  assert.equal(parsed.revision, 3);
  assert.equal(parsed.draft.selectedVehicleIds.length, 1);
  assert.deepEqual(parsePreferenceBaseline(view({ revision: 0 }))?.revision, 0);
  for (const bad of [null, undefined, 7, "x", [], { ...view(), enabled: "yes" }, { ...view(), vehicleScope: "SOME" },
    { ...view(), selectedVehicleIds: "nope" }, { ...view(), selectedVehicleIds: [42] }, { ...view(), revision: 1.5 },
    { ...view(), revision: -1 }, { ...view(), canSelectVehicles: 1 }, { ...view(), hasDormantSelections: 1 },
    { ...view(), vehicles: [{ id: "x" }] }, { enabled: true }]) {
    assert.equal(parsePreferenceBaseline(bad), null, JSON.stringify(bad)?.slice(0, 80));
  }
  const serialized = JSON.stringify(parsePreferenceBaseline(view()));
  for (const sensitive of ["chatId", "userId", "tokenHash", "webhook", "secret", "revision"]) {
    if (sensitive === "revision") continue;
    assert.doesNotMatch(serialized, new RegExp(sensitive, "i"));
  }
});

test("dirty detection is structural with order-insensitive vehicle sets", () => {
  const base = baseline();
  assert.equal(isDraftDirty(base, draftFromBaseline(base)), false);
  assert.equal(isDraftDirty(base, { ...draftFromBaseline(base), enabled: false }), true);
  assert.equal(isDraftDirty(base, { ...draftFromBaseline(base), speedingEnabled: false }), true);
  assert.equal(isDraftDirty(base, { ...draftFromBaseline(base), inactivityEnabled: true }), true);
  assert.equal(isDraftDirty(base, { ...draftFromBaseline(base), vehicleScope: "ALL" }), true);
  const pair = parsePreferenceBaseline(view({ selectedVehicleIds: ["11111111-1111-1111-8111-111111111111", "22222222-2222-2222-8222-222222222222"] }))!;
  assert.equal(isDraftDirty(pair, { ...draftFromBaseline(pair), selectedVehicleIds: ["22222222-2222-2222-8222-222222222222", "11111111-1111-1111-8111-111111111111"] }), false);
  assert.equal(isDraftDirty(pair, { ...draftFromBaseline(pair), selectedVehicleIds: ["11111111-1111-1111-8111-111111111111"] }), true);
  assert.equal(isDraftDirty(base, { ...draftFromBaseline(base), selectedVehicleIds: [] }), true);
  // Without capability, vehicle fields never make a draft dirty.
  const limited = parsePreferenceBaseline(view({ canSelectVehicles: false, selectedVehicleIds: [], vehicles: [] }))!;
  assert.equal(isDraftDirty(limited, { ...draftFromBaseline(limited), vehicleScope: "SELECTED", selectedVehicleIds: ["x"] }), false);
  assert.equal(isDraftDirty(limited, { ...draftFromBaseline(limited), enabled: false }), true);
});

test("PATCH body carries exactly the allowed keys with raw values", () => {
  const base = baseline();
  assert.deepEqual(buildPreferencesPatchBody(base, { ...draftFromBaseline(base), vehicleScope: "ALL" }), {
    expectedRevision: 3,
    enabled: true,
    speedingEnabled: true,
    inactivityEnabled: false,
    vehicleScope: "ALL",
    selectedVehicleIds: ["11111111-1111-1111-8111-111111111111"],
  });
  // Duplicates collapse; values are never trimmed or repaired.
  const duped = buildPreferencesPatchBody(base, { ...draftFromBaseline(base), selectedVehicleIds: ["b", "a", "b", "a"] });
  assert.deepEqual([...(duped.selectedVehicleIds as readonly string[])].sort(), ["a", "a", "b", "b"].filter((v, i, all) => all.indexOf(v) === i).sort());
  const limited = parsePreferenceBaseline(view({ canSelectVehicles: false, selectedVehicleIds: [], vehicles: [] }))!;
  assert.deepEqual(buildPreferencesPatchBody(limited, draftFromBaseline(limited)), {
    expectedRevision: 3,
    enabled: true,
    speedingEnabled: true,
    inactivityEnabled: false,
  });
});

test("only SELECTED-without-vehicles is client-invalid", () => {
  const base = baseline();
  assert.deepEqual(validatePreferencesDraft(draftFromBaseline(base), true), []);
  assert.deepEqual(validatePreferencesDraft({ ...draftFromBaseline(base), selectedVehicleIds: [] }, true), [
    { field: "vehicleScope", messageKey: "telegram.preferences.error.selection" },
  ]);
  assert.deepEqual(validatePreferencesDraft({ ...draftFromBaseline(base), selectedVehicleIds: [] }, true, true), []);
  assert.deepEqual(validatePreferencesDraft({ ...draftFromBaseline(base), vehicleScope: "ALL", selectedVehicleIds: [] }, true), []);
  assert.deepEqual(validatePreferencesDraft({ enabled: false, speedingEnabled: false, inactivityEnabled: false, vehicleScope: "ALL", selectedVehicleIds: [] }, true), []);
  assert.deepEqual(validatePreferencesDraft(draftFromBaseline(base), false), []);
});

test("conflict merge carries non-overlapping edits and flags real conflicts", () => {
  const original = baseline().draft;
  const latest = { ...original, enabled: false };
  const mine = { ...original, inactivityEnabled: true };
  const review = resolvePreferencesConflict(original, mine, latest);
  const byField = Object.fromEntries(review.map((entry) => [entry.field, entry]));
  assert.equal(byField.enabled.resolution, "take-latest");
  assert.equal(byField.inactivityEnabled.resolution, "keep-mine");
  assert.equal(byField.speedingEnabled.resolution, "take-latest");
  // Same change on both sides resolves without a choice.
  const agreed = resolvePreferencesConflict(original, { ...original, enabled: false }, { ...original, enabled: false });
  assert.equal(agreed.find((entry) => entry.field === "enabled")?.resolution, "resolved-same");
  // Binary fields cannot three-way conflict: latest kept its value here,
  // so the user's edit is carried forward.
  const clash = resolvePreferencesConflict(original, { ...original, enabled: false }, { ...original, enabled: true, speedingEnabled: false });
  assert.equal(clash.find((entry) => entry.field === "enabled")?.resolution, "keep-mine");
  assert.equal(clash.find((entry) => entry.field === "speedingEnabled")?.resolution, "take-latest");
  // Disjoint vehicle edits merge; overlapping edits conflict.
  const idA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const idB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const idC = "cccccccc-cccc-cccc-cccc-cccccccccccc";
  const base = { ...original, selectedVehicleIds: [idA, idB] };
  // Disjoint edits union-merge: latest dropped B while mine added C.
  const merged = resolvePreferencesConflict(base, { ...base, selectedVehicleIds: [idA, idB, idC] }, { ...base, selectedVehicleIds: [idA] });
  const idsMerged = merged.find((entry) => entry.field === "selectedVehicleIds")!;
  assert.equal(idsMerged.resolution, "merged");
  assert.deepEqual([...(idsMerged as { value: readonly string[] }).value].sort(), [idA, idC].sort());
  // Apparent set clashes still merge: mine dropped B and added C while
  // latest dropped A, so the union intent is exactly [C].
  const clashIds = resolvePreferencesConflict(base, { ...base, selectedVehicleIds: [idA, idC] }, { ...base, selectedVehicleIds: [idB, idC] });
  const idsClash = clashIds.find((entry) => entry.field === "selectedVehicleIds")!;
  assert.equal(idsClash.resolution, "merged");
  assert.deepEqual([...(idsClash as { value: readonly string[] }).value].sort(), [idC]);
});
test("vehicle search is local, name-only, and case-insensitive", () => {
  const fleet = [
    { id: "a", name: "Alpha Bus", disabled: false },
    { id: "b", name: "beta van", disabled: false },
    { id: "c", name: "Gamma", disabled: true },
  ] as const;
  assert.deepEqual(filterVehiclesByName(fleet, ""), fleet);
  assert.deepEqual(filterVehiclesByName(fleet, "  "), fleet);
  assert.deepEqual(filterVehiclesByName(fleet, "alp").map((vehicle) => vehicle.id), ["a"]);
  assert.deepEqual(filterVehiclesByName(fleet, "BETA").map((vehicle) => vehicle.id), ["b"]);
  assert.deepEqual(filterVehiclesByName(fleet, "Gamma").map((vehicle) => vehicle.id), ["c"]);
  // IDs and flags never match, only names.
  assert.deepEqual(filterVehiclesByName(fleet, "b").map((vehicle) => vehicle.id), ["a", "b"]);
  assert.deepEqual(filterVehiclesByName(fleet, "zzz"), []);
});

test("pagination bounds the list with clamped pages", () => {
  assert.equal(VEHICLE_PAGE_SIZE, 10);
  const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
  const first = paginateVehicles(items, 1, VEHICLE_PAGE_SIZE);
  assert.deepEqual([...first.items], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(first.totalPages, 2);
  const second = paginateVehicles(items, 2, VEHICLE_PAGE_SIZE);
  assert.deepEqual([...second.items], [11, 12]);
  assert.equal(paginateVehicles(items, 99, VEHICLE_PAGE_SIZE).page, 2);
  assert.equal(paginateVehicles(items, 0, VEHICLE_PAGE_SIZE).page, 1);
  const single = paginateVehicles([1], 1, VEHICLE_PAGE_SIZE);
  assert.equal(single.totalPages, 1);
  assert.deepEqual(paginateVehicles([], 1, VEHICLE_PAGE_SIZE).items, []);
});

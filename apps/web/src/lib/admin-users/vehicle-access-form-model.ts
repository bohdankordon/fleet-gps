import type { AdminVehicleAccess, VehicleAccessMode } from "./admin-users-contract";

export type VehicleAccessDraft = Readonly<{
  mode: VehicleAccessMode | null;
  groupIds: readonly string[];
  vehicleIds: readonly string[];
}>;

export const EMPTY_VEHICLE_ACCESS_DRAFT: VehicleAccessDraft = Object.freeze({ mode: null, groupIds: Object.freeze([]), vehicleIds: Object.freeze([]) });

export function draftFromVehicleAccess(access: AdminVehicleAccess): VehicleAccessDraft {
  return Object.freeze({ mode: access.mode, groupIds: [...access.groupIds], vehicleIds: [...access.vehicleIds] });
}

function toggleId(current: readonly string[], id: string, checked: boolean): readonly string[] {
  if (checked) return current.includes(id) ? current : Object.freeze([...current, id]);
  return Object.freeze(current.filter((value) => value !== id));
}

export function toggleAccessGroup(draft: VehicleAccessDraft, groupId: string, checked: boolean): VehicleAccessDraft {
  return Object.freeze({ ...draft, groupIds: toggleId(draft.groupIds, groupId, checked) });
}

export function toggleAccessVehicle(draft: VehicleAccessDraft, vehicleId: string, checked: boolean): VehicleAccessDraft {
  return Object.freeze({ ...draft, vehicleIds: toggleId(draft.vehicleIds, vehicleId, checked) });
}

export function buildVehicleAccessPayload(draft: VehicleAccessDraft): AdminVehicleAccess {
  if (draft.mode === "SELECTED") return Object.freeze({ mode: "SELECTED" as const, groupIds: Object.freeze([...draft.groupIds]), vehicleIds: Object.freeze([...draft.vehicleIds]) });
  return Object.freeze({ mode: "ALL" as const, groupIds: Object.freeze([]), vehicleIds: Object.freeze([]) });
}

export function effectiveVehicleIds(selectedGroupIds: readonly string[], groupVehicles: Readonly<Record<string, readonly string[]>>, directVehicleIds: readonly string[]): ReadonlySet<string> {
  const effective = new Set<string>(directVehicleIds);
  for (const groupId of selectedGroupIds) {
    for (const vehicleId of groupVehicles[groupId] ?? []) effective.add(vehicleId);
  }
  return effective;
}

export function isVehicleAccessDirty(persisted: AdminVehicleAccess, draft: VehicleAccessDraft): boolean {
  if (draft.mode === null || draft.mode !== persisted.mode) return true;
  if (draft.mode === "ALL") return false;
  const same = (left: readonly string[], right: readonly string[]): boolean => left.length === right.length && left.every((id) => right.includes(id));
  return !same(draft.groupIds, persisted.groupIds) || !same(draft.vehicleIds, persisted.vehicleIds);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export const VEHICLE_GROUP_COLORS = ["BLUE", "CYAN", "GREEN", "GOLD", "ORANGE", "PURPLE", "MAGENTA", "GRAY"] as const;

export type VehicleGroupColor = (typeof VEHICLE_GROUP_COLORS)[number];

export const DEFAULT_VEHICLE_GROUP_COLOR: VehicleGroupColor = "BLUE";

export function isVehicleGroupColor(value: unknown): value is VehicleGroupColor {
  return typeof value === "string" && (VEHICLE_GROUP_COLORS as readonly string[]).includes(value);
}

export const VEHICLE_GROUP_TAG_COLORS: Readonly<Record<VehicleGroupColor, "blue" | "cyan" | "green" | "gold" | "orange" | "purple" | "magenta" | "default">> = Object.freeze({
  BLUE: "blue",
  CYAN: "cyan",
  GREEN: "green",
  GOLD: "gold",
  ORANGE: "orange",
  PURPLE: "purple",
  MAGENTA: "magenta",
  GRAY: "default",
});

export type VehicleGroupSummary = Readonly<{
  id: string;
  name: string;
  color: VehicleGroupColor;
  vehicleCount: number;
  userGrantCount: number;
  createdAt: string;
  updatedAt: string;
}>;

export type VehicleGroupVehicle = Readonly<{ id: string; name: string; externalDeviceId: number; disabled: boolean }>;

export type VehicleGroupDetail = VehicleGroupSummary & Readonly<{ vehicles: readonly VehicleGroupVehicle[] }>;

export type ManagedVehicle = Readonly<{ id: string; name: string; disabled: boolean; groupId: string | null }>;

function parseSummary(value: unknown): VehicleGroupSummary | null {
  if (typeof value !== "object" || value === null) return null;
  const group = value as Record<string, unknown>;
  if (!isUuid(group.id) || typeof group.name !== "string" || !isVehicleGroupColor(group.color) || typeof group.vehicleCount !== "number" || typeof group.userGrantCount !== "number" || typeof group.createdAt !== "string" || typeof group.updatedAt !== "string") return null;
  return Object.freeze({ id: group.id, name: group.name, color: group.color, vehicleCount: group.vehicleCount, userGrantCount: group.userGrantCount, createdAt: group.createdAt, updatedAt: group.updatedAt });
}

export function parseVehicleGroupSummaries(value: unknown): readonly VehicleGroupSummary[] | null {
  if (!Array.isArray(value)) return null;
  const groups = value.map(parseSummary);
  return groups.some((group) => !group) ? null : Object.freeze(groups as VehicleGroupSummary[]);
}

function parseDetailVehicle(value: unknown): VehicleGroupVehicle | null {
  if (typeof value !== "object" || value === null) return null;
  const vehicle = value as Record<string, unknown>;
  if (!isUuid(vehicle.id) || typeof vehicle.name !== "string" || typeof vehicle.externalDeviceId !== "number" || typeof vehicle.disabled !== "boolean") return null;
  return Object.freeze({ id: vehicle.id, name: vehicle.name, externalDeviceId: vehicle.externalDeviceId, disabled: vehicle.disabled });
}

export function parseVehicleGroupDetail(value: unknown): VehicleGroupDetail | null {
  const summary = parseSummary(value);
  if (!summary || !Array.isArray((value as Record<string, unknown>).vehicles)) return null;
  const vehicles = ((value as Record<string, unknown>).vehicles as unknown[]).map(parseDetailVehicle);
  return vehicles.some((vehicle) => !vehicle) ? null : Object.freeze({ ...summary, vehicles: Object.freeze(vehicles as VehicleGroupVehicle[]) });
}

function parseManagedVehicle(value: unknown): ManagedVehicle | null {
  if (typeof value !== "object" || value === null) return null;
  const vehicle = value as Record<string, unknown>;
  if (!isUuid(vehicle.id) || typeof vehicle.name !== "string" || typeof vehicle.disabled !== "boolean" || !(vehicle.groupId === null || isUuid(vehicle.groupId))) return null;
  return Object.freeze({ id: vehicle.id, name: vehicle.name, disabled: vehicle.disabled, groupId: vehicle.groupId });
}

export function parseManagedVehicles(value: unknown): readonly ManagedVehicle[] | null {
  if (!Array.isArray(value)) return null;
  const vehicles = value.map(parseManagedVehicle);
  return vehicles.some((vehicle) => !vehicle) ? null : Object.freeze(vehicles as ManagedVehicle[]);
}

export function ungroupedVehicles(vehicles: readonly ManagedVehicle[]): readonly ManagedVehicle[] {
  return Object.freeze(vehicles.filter((vehicle) => vehicle.groupId === null));
}

export function validateGroupName(value: string): string | null {
  if (value.trim().length === 0) return "empty";
  if (value.trim().length > 128) return "tooLong";
  return null;
}

export const PRODUCT_GROUP_FILTER_ALL = "ALL";
export const PRODUCT_GROUP_FILTER_UNGROUPED = "ungrouped";

export type ProductGroupOption = Readonly<{ id: string; name: string }>;

export type ProductGroupCarrier = Readonly<{ group: Readonly<{ id: string; name: string; color: VehicleGroupColor }> | null }>;

export type ProductNotificationGroupCarrier = Readonly<{ groupId: string | null; groupName: string | null; groupColor: VehicleGroupColor | null }>;

export function productGroupOptionsFromVehicles(vehicles: readonly ProductGroupCarrier[]): Readonly<{ options: readonly ProductGroupOption[]; hasUngrouped: boolean }> {
  const seen = new Map<string, string>();
  let hasUngrouped = false;
  for (const vehicle of vehicles) {
    if (!vehicle.group) { hasUngrouped = true; continue; }
    if (!seen.has(vehicle.group.id)) seen.set(vehicle.group.id, vehicle.group.name);
  }
  const options = [...seen].map(([id, name]) => ({ id, name })).sort((left, right) => left.name.localeCompare(right.name, "uk", { numeric: true }) || left.id.localeCompare(right.id));
  return Object.freeze({ options: Object.freeze(options), hasUngrouped });
}

export function productGroupOptionsFromNotificationVehicles(vehicles: readonly ProductNotificationGroupCarrier[]): Readonly<{ options: readonly ProductGroupOption[]; hasUngrouped: boolean }> {
  const seen = new Map<string, string>();
  let hasUngrouped = false;
  for (const vehicle of vehicles) {
    if (!vehicle.groupId || !vehicle.groupName) { hasUngrouped = true; continue; }
    if (!seen.has(vehicle.groupId)) seen.set(vehicle.groupId, vehicle.groupName);
  }
  const options = [...seen].map(([id, name]) => ({ id, name })).sort((left, right) => left.name.localeCompare(right.name, "uk", { numeric: true }) || left.id.localeCompare(right.id));
  return Object.freeze({ options: Object.freeze(options), hasUngrouped });
}

export function matchesProductGroupFilter(group: Readonly<{ id: string }> | null, filter: string): boolean {
  if (filter === PRODUCT_GROUP_FILTER_ALL) return true;
  if (filter === PRODUCT_GROUP_FILTER_UNGROUPED) return group === null;
  return group?.id === filter;
}

export function matchesProductNotificationGroupFilter(vehicle: ProductNotificationGroupCarrier, filter: string): boolean {
  if (filter === PRODUCT_GROUP_FILTER_ALL) return true;
  if (filter === PRODUCT_GROUP_FILTER_UNGROUPED) return vehicle.groupId === null;
  return vehicle.groupId === filter;
}

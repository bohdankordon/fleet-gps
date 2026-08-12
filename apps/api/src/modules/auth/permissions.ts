export const PERMISSIONS = Object.freeze([
  "fleet.view",
  "map.view",
  "events.view",
  "vehicles.view",
  "trips.view",
  "reports.view",
  "historyAdmin.view",
  "historyAdmin.populate",
] as const);

export type Permission = (typeof PERMISSIONS)[number];
const registry = new Set<string>(PERMISSIONS);
export const PERMISSION_DEPENDENCIES = Object.freeze({
  "trips.view": Object.freeze(["vehicles.view"] as const),
  "historyAdmin.populate": Object.freeze(["historyAdmin.view"] as const),
}) satisfies Readonly<Partial<Record<Permission, readonly Permission[]>>>;

export function isPermission(value: string): value is Permission { return registry.has(value); }
export function resolvePermissions(values: readonly string[]): readonly Permission[] {
  const result = new Set<Permission>();
  const dependencies: Readonly<Partial<Record<Permission, readonly Permission[]>>> = PERMISSION_DEPENDENCIES;
  const visit = (key: Permission): void => {
    if (result.has(key)) return;
    result.add(key);
    for (const dependency of dependencies[key] ?? []) visit(dependency);
  };
  for (const value of values) if (isPermission(value)) visit(value);
  return Object.freeze(PERMISSIONS.filter((key) => result.has(key)));
}

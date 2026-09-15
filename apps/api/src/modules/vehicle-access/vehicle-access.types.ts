import type { Prisma, VehicleAccessMode } from "../../generated/prisma/client";

export type ConfiguredVehicleAccess = Readonly<{
  mode: VehicleAccessMode;
  groupIds: readonly string[];
  vehicleIds: readonly string[];
}>;

export type VehicleScope =
  | Readonly<{ kind: "UNRESTRICTED" }>
  | Readonly<{ kind: "FILTERED"; where: Prisma.VehicleWhereInput }>;

export type VehicleGroupRef = Readonly<{ id: string; name: string }>;

export type VehicleGroupOption = Readonly<{ id: string; name: string }>;

export type GroupFilter =
  | Readonly<{ kind: "ALL" }>
  | Readonly<{ kind: "UNGROUPED" }>
  | Readonly<{ kind: "GROUP"; groupId: string }>;

import type { Prisma, VehicleAccessMode } from "../../generated/prisma/client";

export type ConfiguredVehicleAccess = Readonly<{
  mode: VehicleAccessMode;
  groupIds: readonly string[];
  vehicleIds: readonly string[];
}>;

export type VehicleScope =
  | Readonly<{ kind: "UNRESTRICTED" }>
  | Readonly<{ kind: "FILTERED"; where: Prisma.VehicleWhereInput }>;

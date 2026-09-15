import type { VehicleGroupColor } from "../../generated/prisma/client";

export type VehicleGroupSummary = Readonly<{
  id: string;
  name: string;
  color: VehicleGroupColor;
  vehicleCount: number;
  userGrantCount: number;
  createdAt: Date;
  updatedAt: Date;
}>;

export type VehicleGroupDetail = VehicleGroupSummary & Readonly<{
  vehicles: readonly Readonly<{ id: string; name: string; externalDeviceId: number; disabled: boolean }>[];
}>;
export type VehicleGroupManagedVehicle = Readonly<{
  id: string;
  name: string;
  disabled: boolean;
  groupId: string | null;
}>;

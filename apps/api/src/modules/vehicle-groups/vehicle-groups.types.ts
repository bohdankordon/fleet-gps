export type VehicleGroupSummary = Readonly<{
  id: string;
  name: string;
  vehicleCount: number;
  userGrantCount: number;
  createdAt: Date;
  updatedAt: Date;
}>;

export type VehicleGroupDetail = VehicleGroupSummary & Readonly<{
  vehicles: readonly Readonly<{ id: string; name: string; externalDeviceId: number; disabled: boolean }>[];
}>;

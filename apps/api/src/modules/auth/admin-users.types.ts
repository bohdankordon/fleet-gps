import type { AuthRole, VehicleAccessMode } from "../../generated/prisma/enums";
import type { Permission } from "./permissions";

export type SafeAdminUser = Readonly<{
  id: string;
  login: string;
  role: AuthRole;
  disabled: boolean;
  mustChangePassword: boolean;
  permissions: readonly Permission[];
  vehicleAccess: Readonly<{ mode: VehicleAccessMode; groupIds: readonly string[]; vehicleIds: readonly string[] }>;
  telegramStatus: "NOT_CONNECTED" | "CONNECTED" | "BROKEN" | "DISCONNECTED";
  createdAt: Date;
  updatedAt: Date;
}>;

export type OneTimePasswordResult = Readonly<{ user: SafeAdminUser; temporaryPassword: string }>;

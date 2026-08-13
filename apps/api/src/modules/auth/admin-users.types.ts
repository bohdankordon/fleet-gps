import type { AuthRole } from "../../generated/prisma/enums";
import type { Permission } from "./permissions";

export type SafeAdminUser = Readonly<{
  id: string;
  login: string;
  role: AuthRole;
  disabled: boolean;
  mustChangePassword: boolean;
  permissions: readonly Permission[];
  createdAt: Date;
  updatedAt: Date;
}>;

export type OneTimePasswordResult = Readonly<{ user: SafeAdminUser; temporaryPassword: string }>;

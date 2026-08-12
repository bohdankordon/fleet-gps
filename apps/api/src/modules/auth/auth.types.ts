import type { AuthRole } from "../../generated/prisma/enums";
import type { Permission } from "./permissions";

export type SafeAuthUser = Readonly<{
  id: string;
  login: string;
  role: AuthRole;
  permissions: readonly Permission[];
  mustChangePassword: boolean;
}>;

export type AuthenticatedPrincipal = SafeAuthUser & Readonly<{ sessionTokenHash: Uint8Array<ArrayBuffer> }>;
export type AuthenticatedRequest = Readonly<{ headers: Readonly<{ cookie?: string }>; auth?: AuthenticatedPrincipal }>;

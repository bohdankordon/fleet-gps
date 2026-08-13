import { SetMetadata } from "@nestjs/common";
import type { Permission } from "./permissions";

export const AUTH_PUBLIC = "auth:public";
export const AUTH_PERMISSIONS = "auth:permissions";
export const AUTHENTICATED_ONLY = "auth:authenticated-only";
export const AUTH_ALLOW_MUST_CHANGE = "auth:allow-must-change";
export const AUTH_ADMIN_ONLY = "auth:admin-only";

export const Public = () => SetMetadata(AUTH_PUBLIC, true);
export const AuthenticatedOnly = () => SetMetadata(AUTHENTICATED_ONLY, true);
export const AllowMustChangePassword = () => SetMetadata(AUTH_ALLOW_MUST_CHANGE, true);
export const RequireAnyPermission = (...permissions: readonly Permission[]) => SetMetadata(AUTH_PERMISSIONS, permissions);
export const AdminOnly = () => SetMetadata(AUTH_ADMIN_ONLY, true);

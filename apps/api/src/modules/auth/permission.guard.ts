import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthRole } from "../../generated/prisma/enums";
import { AUTH_ADMIN_ONLY, AUTHENTICATED_ONLY, AUTH_PERMISSIONS, AUTH_PUBLIC } from "./auth.decorators";
import type { AuthenticatedRequest } from "./auth.types";
import type { Permission } from "./permissions";

@Injectable()
export class PermissionGuard implements CanActivate {
  public constructor(private readonly reflector: Reflector) {}
  public canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(AUTH_PUBLIC, targets)) return true;
    const principal = context.switchToHttp().getRequest<AuthenticatedRequest>().auth;
    if (!principal) return false;
    if (this.reflector.getAllAndOverride<boolean>(AUTH_ADMIN_ONLY, targets) && principal.role !== AuthRole.ADMIN) throw new ForbiddenException();
    if (principal.role === AuthRole.ADMIN) return true;
    if (this.reflector.getAllAndOverride<boolean>(AUTHENTICATED_ONLY, targets)) return true;
    const required = this.reflector.getAllAndOverride<readonly Permission[]>(AUTH_PERMISSIONS, targets);
    if (required?.some((permission) => principal.permissions.includes(permission))) return true;
    throw new ForbiddenException();
  }
}

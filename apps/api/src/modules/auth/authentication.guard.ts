import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AUTH_ALLOW_MUST_CHANGE, AUTH_PUBLIC } from "./auth.decorators";
import { AuthService } from "./auth.service";
import type { AuthenticatedRequest } from "./auth.types";
import { readSessionCookie } from "./session";

@Injectable()
export class AuthenticationGuard implements CanActivate {
  public constructor(private readonly reflector: Reflector, private readonly auth: AuthService) {}
  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(AUTH_PUBLIC, targets)) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest & { auth?: AuthenticatedRequest["auth"] }>();
    const token = readSessionCookie(request.headers.cookie);
    const principal = token ? await this.auth.authenticate(token) : null;
    if (!principal) throw new UnauthorizedException();
    request.auth = principal;
    if (principal.mustChangePassword && !this.reflector.getAllAndOverride<boolean>(AUTH_ALLOW_MUST_CHANGE, targets)) throw new ForbiddenException();
    return true;
  }
}

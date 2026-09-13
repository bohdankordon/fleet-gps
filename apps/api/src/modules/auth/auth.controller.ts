import { Body, Controller, Get, HttpException, Post, Req, Res } from "@nestjs/common";
import { AllowMustChangePassword, AuthenticatedOnly, Public } from "./auth.decorators";
import { INVALID_CREDENTIALS_MESSAGE } from "./auth.constants";
import { AuthService, InvalidCredentialsError, InvalidPasswordError, LoginRateLimitedError } from "./auth.service";
import type { AuthenticatedRequest, SafeAuthUser } from "./auth.types";
import { clearedSessionCookie, sessionCookie } from "./session";

type HttpResponse = { setHeader(name: string, value: string): void };
type LoginBody = Readonly<{ login?: unknown; password?: unknown }>;
type ChangeBody = Readonly<{ currentPassword?: unknown; newPassword?: unknown }>;
function invalidCredentials(): HttpException { return new HttpException({ statusCode: 401, error: "Unauthorized", message: INVALID_CREDENTIALS_MESSAGE }, 401); }

@Controller("auth")
@AuthenticatedOnly()
export class AuthController {
  public constructor(private readonly auth: AuthService) {}

  @Post("login")
  @Public()
  public async login(@Body() body: LoginBody, @Res({ passthrough: true }) response: HttpResponse): Promise<SafeAuthUser> {
    try { const result = await this.auth.login(body?.login, body?.password); response.setHeader("Set-Cookie", sessionCookie(result.token)); return result.user; }
    catch (error) {
      if (error instanceof LoginRateLimitedError) throw new HttpException({ statusCode: 429, error: "LOGIN_RATE_LIMITED" }, 429);
      if (error instanceof InvalidCredentialsError) throw invalidCredentials();
      throw error;
    }
  }

  @Get("me")
  @AllowMustChangePassword()
  public me(@Req() request: AuthenticatedRequest): SafeAuthUser {
    const { sessionTokenHash: _secret, ...user } = request.auth!;
    return user;
  }

  @Post("logout")
  @AllowMustChangePassword()
  public async logout(@Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: HttpResponse): Promise<Readonly<{ ok: true }>> {
    await this.auth.logout(request.auth!.sessionTokenHash);
    response.setHeader("Set-Cookie", clearedSessionCookie());
    return Object.freeze({ ok: true });
  }

  @Post("change-password")
  @AllowMustChangePassword()
  public async changePassword(@Req() request: AuthenticatedRequest, @Body() body: ChangeBody, @Res({ passthrough: true }) response: HttpResponse): Promise<SafeAuthUser> {
    try { const result = await this.auth.changePassword(request.auth!, body?.currentPassword, body?.newPassword); response.setHeader("Set-Cookie", sessionCookie(result.token)); return result.user; }
    catch (error) {
      if (error instanceof InvalidPasswordError) throw new HttpException({ statusCode: 400, error: "Bad Request", message: "Пароль должен содержать от 15 до 128 символов." }, 400);
      if (error instanceof InvalidCredentialsError) throw invalidCredentials();
      throw error;
    }
  }
}

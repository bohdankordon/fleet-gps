import { Body, Controller, Get, HttpException, Param, Patch, Post, Req, Res } from "@nestjs/common";
import { AdminOnly } from "./auth.decorators";
import type { AuthenticatedRequest } from "./auth.types";
import type { OneTimePasswordResult, SafeAdminUser } from "./admin-users.types";
import { AdminUsersError, AdminUsersService } from "./admin-users.service";
import { normalizeUuid } from "../../common/uuid.validation";
import { buildUserActor } from "../audit";

type HttpResponse = { setHeader(name: string, value: string): void };

function requireEmptyBody(body: unknown): void { if (body !== undefined && (typeof body !== "object" || body === null || Array.isArray(body) || Object.keys(body).length > 0)) throw new AdminUsersError("INVALID_INPUT"); }
function targetId(value: string): string { const normalized = normalizeUuid(value); if (!normalized) throw new AdminUsersError("NOT_FOUND"); return normalized; }

function adminError(error: unknown): never {
  if (!(error instanceof AdminUsersError)) throw error;
  const status = error.code === "NOT_FOUND" ? 404 : error.code === "INVALID_INPUT" || error.code === "DUPLICATE_LOGIN" ? 400 : 409;
  const messages: Record<AdminUsersError["code"], string> = {
    INVALID_INPUT: "Проверьте логин, роль и выбранные разрешения.",
    DUPLICATE_LOGIN: "Пользователь с таким логином уже существует.",
    NOT_FOUND: "Пользователь больше не существует.",
    SELF_PROTECTED: "Это действие недоступно для вашей собственной учётной записи.",
    LAST_ENABLED_ADMIN: "Нельзя отключить или понизить последнего активного администратора.",
  };
  throw new HttpException({ statusCode: status, error: error.code, message: messages[error.code] }, status);
}

@Controller("admin/users")
@AdminOnly()
export class AdminUsersController {
  public constructor(private readonly users: AdminUsersService) {}

  @Get()
  public list(): Promise<readonly SafeAdminUser[]> { return this.users.list(); }

  @Post()
  public async create(@Req() request: AuthenticatedRequest, @Body() body: unknown, @Res({ passthrough: true }) response: HttpResponse): Promise<OneTimePasswordResult> {
    response.setHeader("Cache-Control", "no-store");
    try { return await this.users.create(buildUserActor(request.auth!.id, request.auth!.login), body); } catch (error) { return adminError(error); }
  }

  @Get(":userId")
  public async detail(@Param("userId") userId: string): Promise<SafeAdminUser> { try { return await this.users.detail(targetId(userId)); } catch (error) { return adminError(error); } }

  @Patch(":userId/access")
  public async access(@Req() request: AuthenticatedRequest, @Param("userId") userId: string, @Body() body: unknown): Promise<SafeAdminUser> { try { return await this.users.updateAccess(buildUserActor(request.auth!.id, request.auth!.login), targetId(userId), body); } catch (error) { return adminError(error); } }

  @Post(":userId/disable")
  public async disable(@Req() request: AuthenticatedRequest, @Param("userId") userId: string, @Body() body: unknown): Promise<SafeAdminUser> { try { requireEmptyBody(body); return await this.users.disable(buildUserActor(request.auth!.id, request.auth!.login), targetId(userId)); } catch (error) { return adminError(error); } }

  @Post(":userId/enable")
  public async enable(@Req() request: AuthenticatedRequest, @Param("userId") userId: string, @Body() body: unknown): Promise<SafeAdminUser> { try { requireEmptyBody(body); return await this.users.enable(buildUserActor(request.auth!.id, request.auth!.login), targetId(userId)); } catch (error) { return adminError(error); } }

  @Post(":userId/reset-password")
  public async reset(@Req() request: AuthenticatedRequest, @Param("userId") userId: string, @Body() body: unknown, @Res({ passthrough: true }) response: HttpResponse): Promise<OneTimePasswordResult> {
    response.setHeader("Cache-Control", "no-store");
    try { requireEmptyBody(body); return await this.users.resetPassword(buildUserActor(request.auth!.id, request.auth!.login), targetId(userId)); } catch (error) { return adminError(error); }
  }
}

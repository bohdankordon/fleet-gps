import { Body, Controller, Get, Headers, HttpCode, HttpException, Param, Patch, Post, Req } from "@nestjs/common";
import { AdminOnly, AuthenticatedOnly, Public } from "../auth/auth.decorators";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { buildUserActor } from "../audit";
import { NotificationPreferencesError, TelegramLinkingError, TelegramLinkingService, type TelegramInbound } from "./telegram-linking.service";

function error(error: unknown): never {
  if (error instanceof NotificationPreferencesError) { const status = error.code === "CONFLICT" ? 409 : error.code === "FORBIDDEN" ? 403 : 400; throw new HttpException({ statusCode: status, error: error.code }, status); }
  if (!(error instanceof TelegramLinkingError)) throw error;
  const status = error.code === "RATE_LIMITED" ? 429 : error.code === "DISABLED" ? 409 : 403;
  throw new HttpException({ statusCode: status, error: error.code }, status);
}
function inbound(value: unknown): TelegramInbound | null {
  if (typeof value !== "object" || value === null) return null; const update = value as Record<string, unknown>; const message = update.message;
  if (typeof update.update_id !== "number" || !Number.isSafeInteger(update.update_id) || typeof message !== "object" || message === null) return null;
  const m = message as Record<string, unknown>; const chat = m.chat; const from = m.from;
  if (typeof chat !== "object" || chat === null || typeof from !== "object" || from === null) return null;
  const c = chat as Record<string, unknown>; const f = from as Record<string, unknown>;
  if (typeof c.id !== "number" || !Number.isSafeInteger(c.id) || typeof f.id !== "number" || !Number.isSafeInteger(f.id) || typeof c.type !== "string") return null;
  return Object.freeze({ updateId: BigInt(update.update_id), chatId: BigInt(c.id), userId: BigInt(f.id), chatType: c.type, text: typeof m.text === "string" ? m.text : null });
}

@Controller("account/notifications") @AuthenticatedOnly()
export class AccountNotificationsController {
  public constructor(private readonly telegram: TelegramLinkingService) {}
  @Get() public async status(@Req() request: AuthenticatedRequest) { const [connection, preferences] = await Promise.all([this.telegram.status(request.auth!.id), this.telegram.preferences(request.auth!.id, request.auth!.permissions)]); return Object.freeze({ ...connection, preferences }); }
  @Patch("preferences") public async preferences(@Req() request: AuthenticatedRequest, @Body() body: unknown) { try { return await this.telegram.updatePreferences(request.auth!.id, request.auth!.permissions, body); } catch (cause) { return error(cause); } }
  @Post("telegram/link") public async link(@Req() request: AuthenticatedRequest) { try { return await this.telegram.createLink(request.auth!.id); } catch (cause) { return error(cause); } }
  @Post("telegram/disconnect") public async disconnect(@Req() request: AuthenticatedRequest) { try { return await this.telegram.disconnect(buildUserActor(request.auth!.id, request.auth!.login), request.auth!.id); } catch (cause) { return error(cause); } }
}

@Controller("admin/users") @AdminOnly()
export class AdminTelegramController {
  public constructor(private readonly telegram: TelegramLinkingService) {}
  @Post(":userId/telegram/disconnect") public async disconnect(@Req() request: AuthenticatedRequest, @Param("userId") target: string, @Body() body: unknown) {
    if (body !== undefined && (typeof body !== "object" || body === null || Array.isArray(body) || Object.keys(body).length)) throw new HttpException({ statusCode: 400, error: "INVALID_INPUT" }, 400);
    return this.telegram.disconnect(buildUserActor(request.auth!.id, request.auth!.login), request.auth!.id, target);
  }
}

@Controller("telegram/product") @Public()
export class TelegramProductWebhookController {
  public constructor(private readonly telegram: TelegramLinkingService) {}
  @Post("webhook") @HttpCode(200) public async webhook(@Headers("x-telegram-bot-api-secret-token") secret: string | undefined, @Headers("content-type") contentType: string | undefined, @Body() body: unknown): Promise<Readonly<{ ok: true }>> {
    if (!this.telegram.verifySecret(secret ?? null)) throw new HttpException({ statusCode: 401, error: "Unauthorized" }, 401);
    if (!contentType?.toLowerCase().startsWith("application/json")) throw new HttpException({ statusCode: 400, error: "Bad Request" }, 400);
    const update = inbound(body); if (update) await this.telegram.consume(update);
    return Object.freeze({ ok: true });
  }
}

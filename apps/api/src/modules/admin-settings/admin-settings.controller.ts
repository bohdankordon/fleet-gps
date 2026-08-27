import { Body, Controller, Get, HttpException, Patch, Req } from "@nestjs/common";
import { buildUserActor } from "../audit";
import { AdminOnly } from "../auth/auth.decorators";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { AdminSettingsService } from "./admin-settings.service";
import { AdminSettingsError, type AdminSettingsResponse } from "./admin-settings.types";

function fail(error: unknown): never { if (!(error instanceof AdminSettingsError)) throw error; const status = error.code === "INVALID_INPUT" ? 400 : error.code === "CONFLICT" ? 409 : 503; throw new HttpException({ statusCode: status, error: error.code, message: error.code === "CONFLICT" ? "Settings changed elsewhere. Reload and retry." : "Settings are unavailable." }, status); }
@Controller("admin/settings")
@AdminOnly()
export class AdminSettingsController {
  public constructor(private readonly settings: AdminSettingsService) {}
  @Get() public async get(): Promise<AdminSettingsResponse> { try { return await this.settings.get(); } catch (error) { return fail(error); } }
  @Patch() public async patch(@Req() request: AuthenticatedRequest, @Body() body: unknown): Promise<AdminSettingsResponse> { try { return await this.settings.update(buildUserActor(request.auth!.id, request.auth!.login), body); } catch (error) { return fail(error); } }
}

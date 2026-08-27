import { Controller, Get, HttpException } from "@nestjs/common";
import { AuthenticatedOnly } from "../auth/auth.decorators";
import { AlertSettingsService } from "./alert-settings.service";

@Controller("settings")
@AuthenticatedOnly()
export class RuntimeSettingsController {
  public constructor(private readonly settings: AlertSettingsService) {}
  @Get("runtime") public async get(): Promise<Readonly<{ timezone: string }>> {
    try { return Object.freeze({ timezone: (await this.settings.getSettings()).timezone }); }
    catch { throw new HttpException({ statusCode: 503, error: "Service Unavailable" }, 503); }
  }
}

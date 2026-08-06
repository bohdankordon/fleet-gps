import { Controller, Get, HttpException } from "@nestjs/common";
import { AlertSettingsService } from "./alert-settings.service";
import type { AlertRulesSettings } from "./alert-settings.types";

@Controller("system")
export class AlertSettingsController {
  public constructor(private readonly service: AlertSettingsService) {}

  @Get("alert-settings")
  public async getSettings(): Promise<AlertRulesSettings> {
    try {
      return await this.service.getSettings();
    } catch {
      throw new HttpException({ statusCode: 500, error: "Internal Server Error" }, 500);
    }
  }
}

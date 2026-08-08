import { Controller, Get, HttpException, Query } from "@nestjs/common";
import { AlertEventsQueryParamsError, parseAlertEventsQueryParams } from "./alert-events-query-params";
import type { AlertEventsListResponse, AlertEventsSummaryResponse } from "./alert-events-read-models";
import { AlertEventsQueryService } from "./alert-events-query.service";

@Controller("alert-events")
export class AlertEventsController {
  public constructor(private readonly query: AlertEventsQueryService) {}

  @Get("summary")
  public async getSummary(): Promise<AlertEventsSummaryResponse> {
    try {
      return await this.query.getSummary();
    } catch {
      throw new HttpException({ statusCode: 500, error: "Internal Server Error" }, 500);
    }
  }

  @Get()
  public async list(@Query() rawQuery: Record<string, unknown>): Promise<AlertEventsListResponse> {
    try {
      return await this.query.list(parseAlertEventsQueryParams(rawQuery));
    } catch (error) {
      if (error instanceof AlertEventsQueryParamsError) throw new HttpException({ statusCode: 400, error: "Bad Request" }, 400);
      throw new HttpException({ statusCode: 500, error: "Internal Server Error" }, 500);
    }
  }
}

import { Controller, Get, HttpException, Param, Query, Req } from "@nestjs/common";
import { normalizeUuid } from "../../common/uuid.validation";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { AlertEventsQueryParamsError, parseAlertEventsQueryParams } from "./alert-events-query-params";
import type { AlertEventsListResponse, AlertEventsSummaryResponse, AlertEventsVehicleOption, OpenAlertMapResponse, SpeedingEventInvestigationResponse } from "./alert-events-read-models";
import { AlertEventInvestigationNotFoundError, AlertEventsQueryService } from "./alert-events-query.service";
import { RequireAnyPermission } from "../auth/auth.decorators";

@Controller("alert-events")
export class AlertEventsController {
  public constructor(private readonly query: AlertEventsQueryService) {}

  @Get(":eventId/investigation")
  @RequireAnyPermission("events.view")
  public async getInvestigation(@Param("eventId") rawEventId: string, @Req() request: AuthenticatedRequest): Promise<SpeedingEventInvestigationResponse> {
    const eventId = normalizeUuid(rawEventId);
    if (!eventId) throw new HttpException({ statusCode: 404, error: "Not Found" }, 404);
    try { return await this.query.getSpeedingInvestigation(eventId, request.auth!.id); }
    catch (error) {
      if (error instanceof AlertEventInvestigationNotFoundError) throw new HttpException({ statusCode: 404, error: "Not Found" }, 404);
      throw new HttpException({ statusCode: 500, error: "Internal Server Error" }, 500);
    }
  }

  @Get("vehicles")
  @RequireAnyPermission("events.view")
  public async getVehicleOptions(@Req() request: AuthenticatedRequest): Promise<readonly AlertEventsVehicleOption[]> {
    try { return await this.query.getVehicleOptions(request.auth!.id); }
    catch { throw new HttpException({ statusCode: 500, error: "Internal Server Error" }, 500); }
  }

  @Get("summary")
  @RequireAnyPermission("events.view")
  public async getSummary(@Req() request: AuthenticatedRequest): Promise<AlertEventsSummaryResponse> {
    try {
      return await this.query.getSummary(request.auth!.id);
    } catch {
      throw new HttpException({ statusCode: 500, error: "Internal Server Error" }, 500);
    }
  }

  @Get("map")
  @RequireAnyPermission("map.view", "events.view")
  public async getOpenMap(@Req() request: AuthenticatedRequest): Promise<OpenAlertMapResponse> {
    try {
      return await this.query.getOpenMap(request.auth!.id);
    } catch {
      throw new HttpException({ statusCode: 500, error: "Internal Server Error" }, 500);
    }
  }

  @Get()
  @RequireAnyPermission("events.view")
  public async list(@Query() rawQuery: Record<string, unknown>, @Req() request: AuthenticatedRequest): Promise<AlertEventsListResponse> {
    try {
      return await this.query.list(parseAlertEventsQueryParams(rawQuery), request.auth!.id);
    } catch (error) {
      if (error instanceof AlertEventsQueryParamsError) throw new HttpException({ statusCode: 400, error: "Bad Request" }, 400);
      throw new HttpException({ statusCode: 500, error: "Internal Server Error" }, 500);
    }
  }
}

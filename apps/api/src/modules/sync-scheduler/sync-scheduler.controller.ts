import { Controller, Get, Res } from "@nestjs/common";
import { SyncSchedulerStatusQueryService } from "./sync-scheduler-status-query.service";
import type { SyncSchedulerStatus } from "./sync-scheduler.types";

type HttpResponse = { status(code: number): { json(body: unknown): void } };

@Controller("system")
export class SyncSchedulerController {
  public constructor(private readonly queryService: SyncSchedulerStatusQueryService) {}

  @Get("sync-status")
  public getStatus(@Res() response: HttpResponse): void {
    try {
      response.status(200).json(this.queryService.getStatus());
    } catch {
      response.status(500).json({ statusCode: 500, error: "Internal Server Error" });
    }
  }
}

export type { SyncSchedulerStatus };

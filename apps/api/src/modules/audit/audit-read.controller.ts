import { Controller, Get, HttpException, Query, Res } from "@nestjs/common";
import { AdminOnly } from "../auth/auth.decorators";
import { AuditReadQueryError, parseAuditReadQuery } from "./audit-read.query";
import { AuditReadService } from "./audit-read.service";
import type { AuditReadResponse } from "./audit-read.types";

type HttpResponse = { setHeader(name: string, value: string): void };

@Controller("admin/audit")
@AdminOnly()
export class AuditReadController {
  public constructor(private readonly audit: AuditReadService) {}

  @Get()
  public async list(@Query() query: Record<string, unknown>, @Res({ passthrough: true }) response: HttpResponse): Promise<AuditReadResponse> {
    response.setHeader("Cache-Control", "no-store");
    try {
      return await this.audit.list(parseAuditReadQuery(query));
    } catch (error) {
      if (error instanceof AuditReadQueryError) throw new HttpException({ statusCode: 400, error: "Bad Request" }, 400);
      throw new HttpException({ statusCode: 500, error: "Internal Server Error" }, 500);
    }
  }
}

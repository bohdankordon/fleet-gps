import { Controller, Get, Res } from "@nestjs/common";
import { DatabaseReadinessService } from "../database/database-readiness.service";
type HealthHttpResponse = { status(code: number): { json(body: unknown): void } };
import { HealthService, type HealthResponse } from "./health.service";
import { Public } from "../auth/auth.decorators";

@Controller("health")
@Public()
export class HealthController {
  public constructor(private readonly healthService: HealthService, private readonly readiness: DatabaseReadinessService) {}

  @Get()
  public getHealth(): HealthResponse {
    return this.healthService.getHealth();
  }

  @Get("ready")
  public async getReadiness(@Res() response: HealthHttpResponse): Promise<void> {
    const readiness = await this.readiness.check();
    response.status(readiness.status === "ready" ? 200 : 503).json({ status: readiness.status, service: "taxi-gps-api", database: readiness.status, timestamp: new Date().toISOString() });
  }
}

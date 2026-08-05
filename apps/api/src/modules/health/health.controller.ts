import { Controller, Get } from "@nestjs/common";
import { HealthService, type HealthResponse } from "./health.service";

@Controller("health")
export class HealthController {
  public constructor(private readonly healthService: HealthService) {}

  @Get()
  public getHealth(): HealthResponse {
    return this.healthService.getHealth();
  }
}

import { Injectable } from "@nestjs/common";

export type HealthResponse = {
  status: "ok";
  service: "taxi-gps-api";
  timestamp: string;
};

@Injectable()
export class HealthService {
  public getHealth(): HealthResponse {
    return {
      status: "ok",
      service: "taxi-gps-api",
      timestamp: new Date().toISOString(),
    };
  }
}

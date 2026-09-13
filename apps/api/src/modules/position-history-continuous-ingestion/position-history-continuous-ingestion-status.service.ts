import { Injectable } from "@nestjs/common";
import type { PositionHistoryContinuousCycleResult, PositionHistoryContinuousStatus } from "./position-history-continuous-ingestion.types";

const zero = (): PositionHistoryContinuousCycleResult => ({ vehicles: 0, requests: 0, providerRows: 0, inserted: 0, duplicates: 0, invalid: 0, retries: 0, rateLimitResponses: 0, cursorAdvancements: 0, recentTailCompleted: 0, backlogCompleted: 0, providerBlocked: 0, failedWork: 0, lockUnavailable: 0 });

@Injectable()
export class PositionHistoryContinuousIngestionStatusService {
  private cyclesStarted = 0;
  private cyclesCompleted = 0;
  private running = false;
  private totals = zero();

  public start(): boolean {
    if (this.running) return false;
    this.running = true;
    this.cyclesStarted += 1;
    return true;
  }

  public complete(result: PositionHistoryContinuousCycleResult): void {
    this.running = false;
    this.cyclesCompleted += 1;
    const next = { ...this.totals };
    for (const key of Object.keys(this.totals) as Array<keyof PositionHistoryContinuousCycleResult>) next[key] += result[key];
    this.totals = Object.freeze(next);
  }

  public fail(): void {
    this.running = false;
    this.cyclesCompleted += 1;
    this.totals = Object.freeze({ ...this.totals, failedWork: this.totals.failedWork + 1 });
  }

  public snapshot(enabled: boolean): PositionHistoryContinuousStatus {
    return Object.freeze({ enabled, running: this.running, cyclesStarted: this.cyclesStarted, cyclesCompleted: this.cyclesCompleted, ...this.totals });
  }
}

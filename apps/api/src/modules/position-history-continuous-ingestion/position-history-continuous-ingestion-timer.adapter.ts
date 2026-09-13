import { Injectable } from "@nestjs/common";
import type { PositionHistoryContinuousTimer } from "./position-history-continuous-ingestion.types";

@Injectable()
export class PositionHistoryContinuousIngestionTimerAdapter implements PositionHistoryContinuousTimer {
  private readonly timeouts = new Map<string, NodeJS.Timeout>();
  private readonly intervals = new Map<string, NodeJS.Timeout>();

  public addTimeout(name: string, callback: () => void, milliseconds: number): void {
    if (this.timeouts.has(name)) throw new Error("Continuous history timeout already exists.");
    const handle = setTimeout(() => { this.timeouts.delete(name); callback(); }, milliseconds);
    handle.unref();
    this.timeouts.set(name, handle);
  }

  public addInterval(name: string, callback: () => void, milliseconds: number): void {
    if (this.intervals.has(name)) throw new Error("Continuous history interval already exists.");
    const handle = setInterval(callback, milliseconds);
    handle.unref();
    this.intervals.set(name, handle);
  }

  public deleteTimeout(name: string): void {
    const handle = this.timeouts.get(name);
    if (handle === undefined) return;
    clearTimeout(handle);
    this.timeouts.delete(name);
  }

  public deleteInterval(name: string): void {
    const handle = this.intervals.get(name);
    if (handle === undefined) return;
    clearInterval(handle);
    this.intervals.delete(name);
  }
}

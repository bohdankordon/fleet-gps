import { Injectable } from "@nestjs/common";
import type { SchedulerTimerAdapter } from "../sync-scheduler/scheduler-timer.adapter";

@Injectable()
export class AlertNotificationSchedulerTimerAdapter implements SchedulerTimerAdapter {
  private readonly intervals = new Map<string, ReturnType<typeof setInterval>>();

  public addInterval(name: string, callback: () => void, milliseconds: number): void {
    if (this.intervals.has(name)) throw new Error("Alert notification scheduler interval already exists");
    const handle = setInterval(callback, milliseconds);
    handle.unref?.();
    this.intervals.set(name, handle);
  }

  public deleteInterval(name: string): void {
    const handle = this.intervals.get(name);
    if (handle === undefined) return;
    clearInterval(handle);
    this.intervals.delete(name);
  }

  public hasInterval(name: string): boolean {
    return this.intervals.has(name);
  }
}


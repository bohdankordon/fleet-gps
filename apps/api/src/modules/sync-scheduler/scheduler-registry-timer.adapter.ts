import { Injectable } from "@nestjs/common";
import { SchedulerRegistry } from "@nestjs/schedule";
import type { SchedulerTimerAdapter } from "./scheduler-timer.adapter";

class SchedulerTimerStateError extends Error {
  public constructor() {
    super("Invalid scheduler timer state.");
    this.name = "SchedulerTimerStateError";
  }
}

@Injectable()
export class SchedulerRegistryTimerAdapter implements SchedulerTimerAdapter {
  public constructor(private readonly registry: SchedulerRegistry) {}

  public addInterval(name: string, callback: () => void, milliseconds: number): void {
    if (this.registry.doesExist("interval", name)) throw new SchedulerTimerStateError();

    const interval = setInterval(() => {
      void Promise.resolve().then(callback).catch(() => undefined);
    }, milliseconds);

    try {
      this.registry.addInterval(name, interval);
    } catch {
      clearInterval(interval);
      throw new SchedulerTimerStateError();
    }
  }

  public deleteInterval(name: string): void {
    if (!this.registry.doesExist("interval", name)) return;

    try {
      this.registry.deleteInterval(name);
    } catch {
      return;
    }
  }

  public hasInterval(name: string): boolean {
    return this.registry.doesExist("interval", name);
  }
}

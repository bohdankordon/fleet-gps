export class SchedulerBackendUnavailableError extends Error {
  public constructor() { super("Scheduler backend unavailable."); this.name = "SchedulerBackendUnavailableError"; }
}

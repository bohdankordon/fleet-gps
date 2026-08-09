export type FleetMapClock = Readonly<{ now(): Date }>;

export class FleetMapQueryInternalError extends Error {
  public constructor() {
    super("Fleet map query failed.");
    this.name = "FleetMapQueryInternalError";
  }
}

export class TripStopAnalyticsTargetError extends Error {
  public constructor() { super("Invalid trip/stop analytics target."); this.name = "TripStopAnalyticsTargetError"; }
}

export class TripStopAnalyticsVehicleNotFoundError extends Error {
  public constructor() { super("Trip/stop analytics vehicle was not found."); this.name = "TripStopAnalyticsVehicleNotFoundError"; }
}


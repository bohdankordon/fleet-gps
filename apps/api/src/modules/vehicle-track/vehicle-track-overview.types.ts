export class VehicleTrackOverviewNotFoundError extends Error {
  public constructor() { super("Vehicle not found."); this.name = "VehicleTrackOverviewNotFoundError"; }
}

export class VehicleTrackOverviewTooFragmentedError extends Error {
  public constructor() { super("Vehicle track has too many raw segments for a bounded overview."); this.name = "VehicleTrackOverviewTooFragmentedError"; }
}

export class VehicleTrackOverviewStateError extends Error {
  public constructor() { super("Vehicle track overview query failed."); this.name = "VehicleTrackOverviewStateError"; }
}

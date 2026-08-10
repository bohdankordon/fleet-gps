export type VehicleTrackClock = Readonly<{ now(): Date }>;

export class VehicleTrackNotFoundError extends Error {
  public constructor() { super("Vehicle not found."); this.name = "VehicleTrackNotFoundError"; }
}

export class VehicleTrackTooDenseError extends Error {
  public constructor() { super("Vehicle track exceeds the point limit."); this.name = "VehicleTrackTooDenseError"; }
}

export class VehicleTrackStateError extends Error {
  public constructor() { super("Vehicle track query failed."); this.name = "VehicleTrackStateError"; }
}

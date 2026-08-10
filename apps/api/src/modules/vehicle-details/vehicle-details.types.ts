export type VehicleDetailsClock = Readonly<{ now(): Date }>;

export class VehicleDetailsNotFoundError extends Error {
  public constructor() {
    super("Vehicle not found.");
    this.name = "VehicleDetailsNotFoundError";
  }
}

export class VehicleDetailsStateError extends Error {
  public constructor() {
    super("Vehicle details query failed.");
    this.name = "VehicleDetailsStateError";
  }
}

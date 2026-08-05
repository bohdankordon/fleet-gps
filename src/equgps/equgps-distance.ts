export function metersToKilometers(meters: number): number {
  if (meters < 0) {
    throw new RangeError("Distance in meters must not be negative.");
  }

  return meters / 1_000;
}

export function knotsToKmh(knots: number): number {
  if (knots < 0) {
    throw new RangeError("Speed in knots must not be negative.");
  }

  return knots * 1.852;
}

export type DistanceComparison = { absoluteDifference: number | undefined; percentageDifference: number | undefined };

export function compareDistances(reference: number | undefined, compared: number | undefined): DistanceComparison {
  if (reference === undefined || compared === undefined) return { absoluteDifference: undefined, percentageDifference: undefined };
  const absoluteDifference = Math.abs(reference - compared);
  return { absoluteDifference, percentageDifference: reference === 0 ? (absoluteDifference === 0 ? 0 : undefined) : (absoluteDifference / Math.abs(reference)) * 100 };
}

export function toFiniteNumber(value: number | string | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

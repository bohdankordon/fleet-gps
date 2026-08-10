import { createHash } from "node:crypto";
import type { PositionIngestionSource } from "../../generated/prisma/client";

export type PositionHistoryNormalizationInput = Readonly<{
  observedAt: Date | null;
  latitude: number | null;
  longitude: number | null;
  speedKph: number | null;
  valid: boolean | null;
  outdated: boolean | null;
  fetchedAt: Date;
  ingestionSource: PositionIngestionSource;
}>;

export type PositionHistoryCandidate = Readonly<{
  fixFingerprint: string;
  observedAt: Date;
  latitude: number;
  longitude: number;
  speedKph: number | null;
  valid: boolean | null;
  outdated: boolean | null;
  fetchedAt: Date;
  ingestionSource: PositionIngestionSource;
}>;

const fingerprintVersion = "taxi-gps-position-fix-v1\0";

function finiteDate(value: Date | null): value is Date {
  return value !== null && Number.isFinite(value.getTime());
}

function canonicalNumber(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function updateDouble(hash: ReturnType<typeof createHash>, value: number): void {
  const bytes = Buffer.allocUnsafe(8);
  bytes.writeDoubleBE(canonicalNumber(value));
  hash.update(bytes);
}

export function buildPositionFixFingerprint(input: Readonly<Pick<PositionHistoryCandidate, "observedAt" | "latitude" | "longitude" | "speedKph">>): string {
  const hash = createHash("sha256");
  hash.update(fingerprintVersion, "utf8");
  const timestamp = Buffer.allocUnsafe(8);
  timestamp.writeBigInt64BE(BigInt(input.observedAt.getTime()));
  hash.update(timestamp);
  updateDouble(hash, input.latitude);
  updateDouble(hash, input.longitude);
  hash.update(Buffer.from([input.speedKph === null ? 0 : 1]));
  if (input.speedKph !== null) updateDouble(hash, input.speedKph);
  return hash.digest("hex");
}

export function normalizePositionHistoryCandidate(input: PositionHistoryNormalizationInput): PositionHistoryCandidate | null {
  if (
    !finiteDate(input.observedAt)
    || !finiteDate(input.fetchedAt)
    || input.latitude === null
    || !Number.isFinite(input.latitude)
    || input.latitude < -90
    || input.latitude > 90
    || input.longitude === null
    || !Number.isFinite(input.longitude)
    || input.longitude < -180
    || input.longitude > 180
  ) return null;

  const latitude = canonicalNumber(input.latitude);
  const longitude = canonicalNumber(input.longitude);
  const speedKph = input.speedKph !== null && Number.isFinite(input.speedKph) && input.speedKph >= 0
    ? canonicalNumber(input.speedKph)
    : null;
  const identity = Object.freeze({ observedAt: new Date(input.observedAt.getTime()), latitude, longitude, speedKph });
  return Object.freeze({
    fixFingerprint: buildPositionFixFingerprint(identity),
    ...identity,
    valid: input.valid,
    outdated: input.outdated,
    fetchedAt: new Date(input.fetchedAt.getTime()),
    ingestionSource: input.ingestionSource,
  });
}

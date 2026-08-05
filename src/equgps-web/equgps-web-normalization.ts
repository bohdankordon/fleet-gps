import { knotsToKmh } from "../equgps/equgps-speed.js";
import { metersToKilometers } from "../equgps/equgps-distance.js";
import type { z } from "zod";
import { mode1DataGoSchema, mode1DataPositionsSchema } from "./equgps-web-schemas.js";

export type OptionalNumericStatus = "valid" | "missing" | "unrecognized";

export function parseRequiredNumericString(value: string, fieldName: string): number {
  const trimmed = value.trim();
  if (trimmed === "") throw new Error(`Invalid required numeric string for ${fieldName}.`);
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid required numeric string for ${fieldName}.`);
  return parsed;
}

export function parseOptionalNumericString(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function describeOptionalNumericString(value: string | null | undefined): {
  value: number | null;
  status: OptionalNumericStatus;
  format: { length: number; trimmedLength: number; mask: string } | undefined;
} {
  const parsed = parseOptionalNumericString(value);
  if (value === null || value === undefined || value.trim() === "") {
    return { value: null, status: "missing", format: undefined };
  }
  if (parsed !== null) return { value: parsed, status: "valid", format: undefined };
  const trimmed = value.trim();
  return {
    value: null,
    status: "unrecognized",
    format: {
      length: value.length,
      trimmedLength: trimmed.length,
      mask: value.replace(/\d/g, "0").replace(/[A-Za-z]/g, "A").replace(/ /g, "_").replace(/[^0A_.,+-]/g, "?"),
    },
  };
}

export function unixSecondsToDate(value: number): Date {
  if (!Number.isInteger(value) || value < 0) throw new Error("Expected a non-negative integer Unix timestamp in seconds.");
  const date = new Date(value * 1_000);
  if (Number.isNaN(date.getTime())) throw new Error("Unix timestamp is outside the supported range.");
  return date;
}

export function parseCoordinateTuple(value: string[] | undefined): readonly [number, number] | undefined {
  if (value === undefined) return undefined;
  if (value.length !== 2) throw new Error("Expected a coordinate tuple with two values.");
  const first = Number(value[0]);
  const second = Number(value[1]);
  if (!Number.isFinite(first) || !Number.isFinite(second)) throw new Error("Coordinate tuple contains a non-numeric value.");
  return [first, second];
}

type Mode1DataPositions = z.infer<typeof mode1DataPositionsSchema>;
type Mode1DataGo = z.infer<typeof mode1DataGoSchema>;

export function normalizeMode1DataPositions(value: Mode1DataPositions) {
  const maxSpeed = describeOptionalNumericString(value.maxSpeed);
  return {
    distanceMeters: value.distance,
    distanceKilometers: value.distance === undefined ? undefined : metersToKilometers(value.distance),
    maxSpeedKnots: maxSpeed.value,
    maxSpeedKmh: maxSpeed.value === null ? null : knotsToKmh(maxSpeed.value),
    maxSpeedStatus: maxSpeed.status,
    maxSpeedFormat: maxSpeed.format,
    startCoordinates: parseCoordinateTuple(value.startC), endCoordinates: parseCoordinateTuple(value.endC),
    lastTime: value.lastTime === undefined ? undefined : unixSecondsToDate(value.lastTime),
  };
}

export function normalizeMode1DataGo(value: Mode1DataGo) {
  const maxSpeed = describeOptionalNumericString(value.maxSpeed);
  return {
    distanceMeters: value.distance, distanceKilometers: value.distance === undefined ? undefined : metersToKilometers(value.distance),
    maxSpeedKnots: maxSpeed.value, maxSpeedKmh: maxSpeed.value === null ? null : knotsToKmh(maxSpeed.value),
    maxSpeedStatus: maxSpeed.status, maxSpeedFormat: maxSpeed.format,
    startCoordinates: parseCoordinateTuple(value.startC), endCoordinates: parseCoordinateTuple(value.endC),
    startTime: value.startTime === undefined ? undefined : unixSecondsToDate(value.startTime), endTime: value.endTime === undefined ? undefined : unixSecondsToDate(value.endTime),
  };
}

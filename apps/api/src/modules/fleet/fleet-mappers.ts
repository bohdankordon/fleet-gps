import type { EquGpsDevice, EquGpsPosition } from "@taxi-gps/equgps";
import { VehicleStatus } from "../../generated/prisma/client";
import type { FleetCurrentPosition, FleetPositionObservation, FleetSnapshotVehicle } from "./fleet.types";

type DateParseResult = Readonly<{ value: Date | null; invalid: boolean }>;

export type SelectedPosition = Readonly<{
  deviceId: number;
  position: EquGpsPosition;
  fixTime: Date | null;
  invalidFixTime: boolean;
}>;

const explicitTimezone = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/i;

function parseExplicitTimezoneDate(value: string | null): DateParseResult {
  if (value === null) return { value: null, invalid: false };
  const match = explicitTimezone.exec(value);
  if (!match) return { value: null, invalid: true };
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) return { value: null, invalid: true };
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return { value: null, invalid: true };
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? { value: null, invalid: true } : { value: date, invalid: false };
}

function mapStatus(value: string | null): VehicleStatus {
  switch (value?.trim().toLowerCase()) {
    case "online": return VehicleStatus.ONLINE;
    case "offline": return VehicleStatus.OFFLINE;
    default: return VehicleStatus.UNKNOWN;
  }
}

function safeName(name: string | null, externalDeviceId: number): string {
  const normalized = name?.trim() ?? "";
  return normalized === "" ? `Device ${externalDeviceId}` : normalized;
}

function toPosition(position: EquGpsPosition, fixTime: Date | null): FleetCurrentPosition {
  const coordinates = Number.isFinite(position.latitude) && Number.isFinite(position.longitude) && position.latitude !== null && position.longitude !== null && position.latitude >= -90 && position.latitude <= 90 && position.longitude >= -180 && position.longitude <= 180
    ? { latitude: position.latitude, longitude: position.longitude }
    : { latitude: null, longitude: null };
  const speedKph = position.speedKnots === null || !Number.isFinite(position.speedKnots) || position.speedKnots < 0 ? null : position.speedKnots * 1.852;
  return { fixTime, ...coordinates, speedKph, valid: position.valid, outdated: position.outdated };
}

export function selectLatestPositions(positions: readonly EquGpsPosition[]): Readonly<{ selected: ReadonlyMap<number, SelectedPosition>; duplicatePositions: number; invalidPositionFixDates: number }> {
  const selected = new Map<number, SelectedPosition>();
  let duplicatePositions = 0;
  let invalidPositionFixDates = 0;
  for (const position of positions) {
    const parsed = parseExplicitTimezoneDate(position.fixTime);
    if (parsed.invalid) invalidPositionFixDates += 1;
    const candidate: SelectedPosition = { deviceId: position.deviceId, position, fixTime: parsed.value, invalidFixTime: parsed.invalid };
    const previous = selected.get(position.deviceId);
    if (!previous) { selected.set(position.deviceId, candidate); continue; }
    duplicatePositions += 1;
    if (candidate.fixTime !== null && (previous.fixTime === null || candidate.fixTime.getTime() > previous.fixTime.getTime())) selected.set(position.deviceId, candidate);
  }
  return { selected, duplicatePositions, invalidPositionFixDates };
}

export function mapFleetSnapshot(devices: readonly EquGpsDevice[], positions: readonly EquGpsPosition[], fetchedAt: Date): Readonly<{ vehicles: readonly FleetSnapshotVehicle[]; positionObservations: readonly FleetPositionObservation[]; devicesWithoutPosition: number; unmatchedPositions: number; duplicatePositions: number; invalidDeviceLastUpdateDates: number; invalidPositionFixDates: number }> {
  const selectedPositions = selectLatestPositions(positions);
  const deviceIds = new Set(devices.map((device) => device.id));
  let unmatchedPositions = 0;
  for (const position of positions) if (!deviceIds.has(position.deviceId)) unmatchedPositions += 1;
  let devicesWithoutPosition = 0;
  let invalidDeviceLastUpdateDates = 0;
  const vehicles = devices.map((device) => {
    const parsedLastUpdate = parseExplicitTimezoneDate(device.lastUpdate);
    if (parsedLastUpdate.invalid) invalidDeviceLastUpdateDates += 1;
    const selected = selectedPositions.selected.get(device.id);
    if (!selected) devicesWithoutPosition += 1;
    return {
      externalDeviceId: device.id,
      name: safeName(device.name, device.id),
      disabled: device.disabled === true,
      status: mapStatus(device.status),
      externalLastUpdateAt: parsedLastUpdate.value,
      fetchedAt,
      position: selected ? toPosition(selected.position, selected.fixTime) : null,
    };
  });
  const positionObservations: FleetPositionObservation[] = [];
  for (const position of positions) {
    if (!deviceIds.has(position.deviceId)) continue;
    const parsed = parseExplicitTimezoneDate(position.fixTime);
    const normalized = toPosition(position, parsed.value);
    positionObservations.push(Object.freeze({
      externalDeviceId: position.deviceId,
      observedAt: normalized.fixTime,
      latitude: normalized.latitude,
      longitude: normalized.longitude,
      speedKph: normalized.speedKph,
      valid: normalized.valid,
      outdated: normalized.outdated,
      fetchedAt,
    }));
  }
  return { vehicles, positionObservations: Object.freeze(positionObservations), devicesWithoutPosition, unmatchedPositions, duplicatePositions: selectedPositions.duplicatePositions, invalidDeviceLastUpdateDates, invalidPositionFixDates: selectedPositions.invalidPositionFixDates };
}

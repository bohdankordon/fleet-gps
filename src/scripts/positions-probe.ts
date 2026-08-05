import { loadConfig } from "../config.js";
import { normalizeEqugpsDate } from "../equgps/equgps-date.js";
import { EqugpsClient } from "../equgps/equgps-client.js";
import type { Device } from "../equgps/equgps-schemas.js";
import type { Position } from "../equgps/equgps-position-schemas.js";
import { knotsToKmh } from "../equgps/equgps-speed.js";

const emptyValue = "—";
const futureToleranceMs = 5 * 60 * 1_000;

type PositionAge =
  | "up_to_5_minutes"
  | "5_to_15_minutes"
  | "15_minutes_to_1_hour"
  | "1_to_24_hours"
  | "over_24_hours"
  | "missing"
  | "unrecognized"
  | "future";

const ageLabels: Record<PositionAge, string> = {
  up_to_5_minutes: "≤5 min",
  "5_to_15_minutes": "5–15 min",
  "15_minutes_to_1_hour": "15 min–1 h",
  "1_to_24_hours": "1–24 h",
  over_24_hours: ">24 h",
  missing: "date missing",
  unrecognized: "date unrecognized",
  future: "future date",
};

function getPositionAge(position: Position, now: Date): PositionAge {
  const timestamp = position.fixTime ?? position.serverTime;
  const normalized = normalizeEqugpsDate(timestamp);

  if (normalized.status === "missing") return "missing";
  if (normalized.status === "unrecognized") return "unrecognized";

  const ageMs = now.getTime() - normalized.date.getTime();
  if (ageMs < -futureToleranceMs) return "future";
  if (ageMs <= 5 * 60 * 1_000) return "up_to_5_minutes";
  if (ageMs <= 15 * 60 * 1_000) return "5_to_15_minutes";
  if (ageMs <= 60 * 60 * 1_000) return "15_minutes_to_1_hour";
  if (ageMs <= 24 * 60 * 60 * 1_000) return "1_to_24_hours";
  return "over_24_hours";
}

function countByStatus(devices: Device[]): Record<string, number> {
  return devices.reduce<Record<string, number>>((counts, device) => {
    const status = device.status ?? "(missing)";
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {});
}

function formatBoolean(value: boolean | null | undefined): boolean | string {
  return value ?? emptyValue;
}

function formatSpeed(speed: number | null | undefined): { speedKnots: number | string; speedKmh: number | string } {
  if (speed === null || speed === undefined) {
    return { speedKnots: emptyValue, speedKmh: emptyValue };
  }

  return {
    speedKnots: speed,
    speedKmh: Math.round(knotsToKmh(speed) * 10) / 10,
  };
}

try {
  const config = loadConfig();
  const client = new EqugpsClient(config);

  const devicesStartedAt = performance.now();
  const devices = await client.getDevices();
  const devicesDurationMs = Math.round(performance.now() - devicesStartedAt);

  const positionsStartedAt = performance.now();
  const positions = await client.getLatestPositions();
  const positionsDurationMs = Math.round(performance.now() - positionsStartedAt);
  const now = new Date();

  const positionsByDeviceId = new Map<number, Position[]>();
  for (const position of positions) {
    const byDevice = positionsByDeviceId.get(position.deviceId) ?? [];
    byDevice.push(position);
    positionsByDeviceId.set(position.deviceId, byDevice);
  }

  const deviceIds = new Set(devices.flatMap((device) => (device.id === undefined ? [] : [device.id])));
  const uniquePositionDeviceIds = new Set(positions.map((position) => position.deviceId));
  const ageCounts = positions.reduce<Record<PositionAge, number>>(
    (counts, position) => {
      const age = getPositionAge(position, now);
      counts[age] += 1;
      return counts;
    },
    {
      up_to_5_minutes: 0,
      "5_to_15_minutes": 0,
      "15_minutes_to_1_hour": 0,
      "1_to_24_hours": 0,
      over_24_hours: 0,
      missing: 0,
      unrecognized: 0,
      future: 0,
    },
  );

  const devicesWithoutPosition = devices.filter(
    (device) => device.id === undefined || !uniquePositionDeviceIds.has(device.id),
  ).length;
  const positionsWithoutDevice = positions.filter((position) => !deviceIds.has(position.deviceId)).length;
  const duplicatePositions = positions.length - uniquePositionDeviceIds.size;

  console.log(`GET /devices duration: ${devicesDurationMs} ms`);
  console.log(`GET /positions duration: ${positionsDurationMs} ms`);
  console.log(`Devices: ${devices.length}`);
  console.log(`Disabled devices: ${devices.filter((device) => device.disabled === true).length}`);
  console.log("Devices by status:", countByStatus(devices));
  console.log(`Positions: ${positions.length}`);
  console.log(`Unique position deviceIds: ${uniquePositionDeviceIds.size}`);
  console.log(`Devices without position: ${devicesWithoutPosition}`);
  console.log(`Positions without matching device: ${positionsWithoutDevice}`);
  console.log(`Duplicate positions for a deviceId: ${duplicatePositions}`);
  console.log(`Positions valid=true: ${positions.filter((position) => position.valid === true).length}`);
  console.log(`Positions valid=false: ${positions.filter((position) => position.valid === false).length}`);
  console.log(`Positions outdated=true: ${positions.filter((position) => position.outdated === true).length}`);
  console.log(`Positions outdated=false: ${positions.filter((position) => position.outdated === false).length}`);
  console.log(`Positions without speed: ${positions.filter((position) => position.speed === null || position.speed === undefined).length}`);
  console.table(
    Object.entries(ageCounts).map(([age, count]) => ({ bucket: ageLabels[age as PositionAge], positions: count })),
  );

  console.table(
    devices.slice(0, 20).map((device) => {
      const position = device.id === undefined ? undefined : positionsByDeviceId.get(device.id)?.[0];
      return {
        deviceId: device.id ?? emptyValue,
        name: device.name ?? emptyValue,
        deviceStatus: device.status ?? emptyValue,
        positionFound: position !== undefined,
        valid: formatBoolean(position?.valid),
        outdated: formatBoolean(position?.outdated),
        positionAge: position === undefined ? emptyValue : ageLabels[getPositionAge(position, now)],
        ...formatSpeed(position?.speed),
      };
    }),
  );
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : "Positions probe failed.");
  process.exitCode = 1;
}

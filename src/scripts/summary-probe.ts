import { loadConfig } from "../config.js";
import { metersToKilometers } from "../equgps/equgps-distance.js";
import { EqugpsClient } from "../equgps/equgps-client.js";
import { EqugpsError } from "../equgps/equgps-errors.js";
import { getCurrentKyivDay, getPreviousKyivDay, type ReportPeriod } from "../equgps/equgps-periods.js";
import type { Device } from "../equgps/equgps-schemas.js";
import type { ReportSummary } from "../equgps/equgps-summary-schemas.js";
import { knotsToKmh } from "../equgps/equgps-speed.js";

const emptyValue = "—";

function selectDevice(devices: Device[]): Device & { id: number } {
  const enabled = devices.filter((device): device is Device & { id: number } => device.disabled !== true && device.id !== undefined);
  const selected = enabled.find((device) => device.status === "online") ?? enabled[0];
  if (selected === undefined) throw new Error("No enabled device with an id is available for the summary probe.");
  return selected;
}

function formatValue(value: number | null | undefined, decimals: number): number | string {
  return value === null || value === undefined ? emptyValue : Number(value.toFixed(decimals));
}

function printReport(label: string, period: ReportPeriod, rows: ReportSummary[], durationMs: number): void {
  const distances = rows.flatMap((row) => (row.distance === null || row.distance === undefined ? [] : [row.distance]));
  const speeds = rows.flatMap((row) => (row.maxSpeed === null || row.maxSpeed === undefined ? [] : [row.maxSpeed]));
  const totalDistance = distances.reduce((total, distance) => total + distance, 0);

  console.log(`${label}: ${period.description}`);
  console.log(`Request duration: ${durationMs} ms`);
  console.log(`Response rows: ${rows.length}`);
  console.log(`Selected devices without row: ${rows.length === 0 ? 1 : 0}`);
  console.log(`Total distance: ${Number(metersToKilometers(totalDistance).toFixed(2))} km`);
  console.log(`Average distance per returned device: ${rows.length === 0 ? emptyValue : Number(metersToKilometers(totalDistance / rows.length).toFixed(2))} km`);
  console.log(`Maximum speed: ${speeds.length === 0 ? emptyValue : Number(knotsToKmh(Math.max(...speeds)).toFixed(1))} km/h`);
  console.log(`Rows with zero distance: ${rows.filter((row) => row.distance === 0).length}`);
  console.log(`Rows without distance: ${rows.filter((row) => row.distance === null || row.distance === undefined).length}`);
  console.table(rows.slice(0, 1).map((row) => ({
    deviceId: row.deviceId,
    deviceName: row.deviceName ?? emptyValue,
    distanceMeters: row.distance ?? emptyValue,
    distanceKm: row.distance === null || row.distance === undefined ? emptyValue : Number(metersToKilometers(row.distance).toFixed(2)),
    averageSpeedKnots: row.averageSpeed ?? emptyValue,
    averageSpeedKmh: row.averageSpeed === null || row.averageSpeed === undefined ? emptyValue : Number(knotsToKmh(row.averageSpeed).toFixed(1)),
    maxSpeedKnots: row.maxSpeed ?? emptyValue,
    maxSpeedKmh: row.maxSpeed === null || row.maxSpeed === undefined ? emptyValue : Number(knotsToKmh(row.maxSpeed).toFixed(1)),
    spentFuel: formatValue(row.spentFuel, 2),
    engineHours: formatValue(row.engineHours, 2),
  })));
}

function printSafeDiagnostic(error: EqugpsError): void {
  if (error.diagnostic === undefined) return;
  console.error("HTTP 400 diagnostic:", {
    status: error.diagnostic.status,
    contentType: error.diagnostic.contentType ?? emptyValue,
    message: error.diagnostic.message ?? emptyValue,
    parameter: error.diagnostic.parameter ?? emptyValue,
    code: error.diagnostic.code ?? emptyValue,
  });
}

try {
  const config = loadConfig();
  const client = new EqugpsClient(config);
  const device = selectDevice(await client.getDevices());
  const previousPeriod = getPreviousKyivDay();

  console.log(`Request A prepared: ${previousPeriod.description}; selectedDevices=1`);
  const previousStartedAt = performance.now();
  const previousRows = await client.getReportSummary({ deviceIds: [device.id], ...previousPeriod });
  printReport("Request A", previousPeriod, previousRows, Math.round(performance.now() - previousStartedAt));

  const currentPeriod = getCurrentKyivDay();
  console.log(`Request B prepared: ${currentPeriod.description}; selectedDevices=1`);
  const currentStartedAt = performance.now();
  const currentRows = await client.getReportSummary({ deviceIds: [device.id], ...currentPeriod });
  printReport("Request B", currentPeriod, currentRows, Math.round(performance.now() - currentStartedAt));
} catch (error: unknown) {
  if (error instanceof EqugpsError) printSafeDiagnostic(error);
  console.error(error instanceof Error ? error.message : "Summary probe failed.");
  process.exitCode = 1;
}

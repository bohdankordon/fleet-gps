import { loadConfig } from "../config.js";
import { EqugpsClient } from "../equgps/equgps-client.js";
import { describeEqugpsDateFormat, normalizeEqugpsDate } from "../equgps/equgps-date.js";
import type { Device } from "../equgps/equgps-schemas.js";

const emptyValue = "—";
const reportedUnknownDateFormats = new Set<string>();

function formatLastUpdate(lastUpdate: Device["lastUpdate"]): string {
  const normalized = normalizeEqugpsDate(lastUpdate);
  if (normalized.status === "missing") return emptyValue;
  if (normalized.status === "recognized") return normalized.original;

  const diagnostic = describeEqugpsDateFormat(normalized.original);
  const key = JSON.stringify(diagnostic);
  if (!reportedUnknownDateFormats.has(key)) {
    reportedUnknownDateFormats.add(key);
    console.warn(
      "Unrecognized lastUpdate format:",
      `length=${diagnostic.length}`,
      `mask=${diagnostic.structuralMask}`,
      `hasT=${diagnostic.hasT}`,
      `hasDateTimeSpace=${diagnostic.hasDateTimeSpace}`,
      `hasZ=${diagnostic.hasZ}`,
      `hasTimezoneOffset=${diagnostic.hasTimezoneOffset}`,
    );
  }
  return "[unrecognized date format]";
}

function formatStartedAt(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: timezone,
  }).format(date);
}

try {
  const config = loadConfig();
  const startedAt = new Date();
  console.log(`Probe started: ${formatStartedAt(startedAt, config.timezone)} (${config.timezone})`);
  console.log(`Base URL: ${config.baseUrl}`);

  const client = new EqugpsClient(config);
  const requestStartedAt = performance.now();
  const devices = await client.getDevices();
  const durationMs = Math.round(performance.now() - requestStartedAt);

  console.log(`Request duration: ${durationMs} ms`);
  console.log(`Total devices: ${devices.length}`);
  console.table(
    devices.map((device) => ({
      id: device.id ?? emptyValue,
      name: device.name ?? emptyValue,
      status: device.status ?? emptyValue,
      lastUpdate: formatLastUpdate(device.lastUpdate),
      groupId: device.groupId ?? emptyValue,
    })),
  );
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : "Devices probe failed.");
  process.exitCode = 1;
}

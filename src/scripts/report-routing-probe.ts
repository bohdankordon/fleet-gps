import { loadConfig } from "../config.js";
import { normalizeEqugpsDate } from "../equgps/equgps-date.js";
import { EqugpsClient, type JsonResponse } from "../equgps/equgps-client.js";
import { EqugpsError } from "../equgps/equgps-errors.js";
import { getPreviousKyivDayHour } from "../equgps/equgps-periods.js";
import type { Position } from "../equgps/equgps-position-schemas.js";
import type { Device } from "../equgps/equgps-schemas.js";
import type { ReportSummary } from "../equgps/equgps-summary-schemas.js";

const emptyValue = "—";

function selectDevice(devices: Device[]): Device & { id: number } {
  const candidates = devices.filter(
    (device): device is Device & { id: number } =>
      device.disabled !== true && device.id !== undefined && device.positionId !== null && device.positionId !== undefined,
  );
  const selected = candidates.find((device) => device.status === "online") ?? candidates[0];
  if (selected === undefined) throw new Error("No enabled device with a known latest position is available.");
  return selected;
}

function printResponseMetadata(label: string, response: JsonResponse<unknown>, durationMs: number): void {
  console.log(`${label}: status=${response.metadata.status}; duration=${durationMs} ms; contentType=${response.metadata.contentType ?? emptyValue}; contentDispositionAttachment=${response.metadata.hasContentDispositionAttachment}`);
}

function printSafeError(label: string, error: EqugpsError, durationMs: number): void {
  const diagnostic = error.diagnostic;
  console.log(`${label}: status=${error.status ?? emptyValue}; duration=${durationMs} ms; contentType=${diagnostic?.contentType ?? emptyValue}; contentDispositionAttachment=${diagnostic?.hasContentDispositionAttachment ?? false}`);
  console.log(`exceptionType=${diagnostic?.exceptionType ?? "unknown"}; stackFrames=${diagnostic?.stackFrames.join(", ") || emptyValue}`);
}

function positionTimes(positions: Position[]): { earliest: string; latest: string } {
  const times = positions.flatMap((position) => {
    const normalized = normalizeEqugpsDate(position.fixTime ?? position.serverTime);
    return normalized.status === "recognized" ? [normalized.date.getTime()] : [];
  });
  if (times.length === 0) return { earliest: emptyValue, latest: emptyValue };
  return {
    earliest: new Date(Math.min(...times)).toISOString(),
    latest: new Date(Math.max(...times)).toISOString(),
  };
}

function printHistoricalPositions(response: JsonResponse<Position[]>, durationMs: number): void {
  printResponseMetadata("Historical /positions", response, durationMs);
  const times = positionTimes(response.data);
  console.log(`positions=${response.data.length}; atLeastTwo=${response.data.length >= 2}; earliestTime=${times.earliest}; latestTime=${times.latest}`);
}

function printRoute(response: JsonResponse<Position[]>, durationMs: number): void {
  printResponseMetadata("/reports/route", response, durationMs);
  console.log(`positions=${response.data.length}`);
}

function printSummary(response: JsonResponse<ReportSummary[]>, durationMs: number): void {
  printResponseMetadata("/reports/summary", response, durationMs);
  console.log(`rows=${response.data.length}`);
}

try {
  const client = new EqugpsClient(loadConfig());
  const device = selectDevice(await client.getDevices());
  const period = getPreviousKyivDayHour();
  const params = { deviceId: device.id, from: period.from, to: period.to };

  const positionsStartedAt = performance.now();
  let historical: JsonResponse<Position[]>;
  try {
    historical = await client.getHistoricalPositions(params);
  } catch (error: unknown) {
    if (error instanceof EqugpsError) printSafeError("Historical /positions", error, Math.round(performance.now() - positionsStartedAt));
    console.log("Conclusion C: historical positions need separate investigation; report endpoints were not checked.");
    process.exitCode = 1;
    throw error;
  }
  printHistoricalPositions(historical, Math.round(performance.now() - positionsStartedAt));

  const routeStartedAt = performance.now();
  let route: JsonResponse<Position[]>;
  try {
    route = await client.getRouteReport(params);
  } catch (error: unknown) {
    if (error instanceof EqugpsError) printSafeError("/reports/route", error, Math.round(performance.now() - routeStartedAt));
    console.log("Conclusion B: historical positions work, while report handling is likely affected by content negotiation or report-server configuration.");
    process.exitCode = 1;
    throw error;
  }
  printRoute(route, Math.round(performance.now() - routeStartedAt));

  const summaryStartedAt = performance.now();
  try {
    const summary = await client.getReportSummaryResponse({ deviceIds: [device.id], from: period.from, to: period.to });
    printSummary(summary, Math.round(performance.now() - summaryStartedAt));
    console.log("Conclusion D: all historical endpoints returned JSON; the earlier summary failure was likely caused by client headers.");
  } catch (error: unknown) {
    if (error instanceof EqugpsError) printSafeError("/reports/summary", error, Math.round(performance.now() - summaryStartedAt));
    console.log("Conclusion A: parameters and historical access work; summary is currently unreliable on the server.");
    process.exitCode = 1;
    throw error;
  }
} catch (error: unknown) {
  if (!(error instanceof EqugpsError)) console.error(error instanceof Error ? error.message : "Report routing probe failed.");
}

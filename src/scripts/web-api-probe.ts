import { DateTime } from "luxon";
import { loadConfig, loadWebConfig } from "../config.js";
import { EqugpsClient } from "../equgps/equgps-client.js";
import { EquGpsWebClient } from "../equgps-web/equgps-web-client.js";
import { compareDistances } from "../equgps-web/equgps-web-distance.js";
import { normalizeMode1DataGo, normalizeMode1DataPositions, parseCoordinateTuple, parseOptionalNumericString } from "../equgps-web/equgps-web-normalization.js";
import type { WebInfo, WebRoutes } from "../equgps-web/equgps-web-schemas.js";
import type { Device } from "../equgps/equgps-schemas.js";

const emptyValue = "—";

function selectDevice(devices: Device[]): Device & { id: number } {
  const enabled = devices.filter((device): device is Device & { id: number } => device.disabled !== true && device.id !== undefined);
  const selected = enabled.find((device) => device.status === "online") ?? enabled[0];
  if (selected === undefined) throw new Error("No enabled device is available for the web API probe.");
  return selected;
}

function firstMode1(response: WebInfo[]) { return response.find((item) => item.infoReport?.mode1 !== undefined)?.infoReport?.mode1; }
function firstMode2(response: WebInfo[]) { return response.find((item) => item.infoReport?.mode2 !== undefined)?.infoReport?.mode2; }
function sum(values: Array<number | undefined>): number { return values.reduce<number>((total, value) => total + (value ?? 0), 0); }
function format(value: number | undefined, decimals = 2): number | string { return value === undefined ? emptyValue : Number(value.toFixed(decimals)); }

function printMode1(mode1: NonNullable<ReturnType<typeof firstMode1>>): { positionsDistance: number | undefined; goDistance: number | undefined } {
  const dataGo = mode1.dataGo ?? [];
  const positions = mode1.dataPositions === undefined ? undefined : normalizeMode1DataPositions(mode1.dataPositions);
  const trips = dataGo.map(normalizeMode1DataGo);
  const goDistance = sum(trips.map((item) => item.distanceMeters));
  const movementValues = dataGo.map((item) => parseOptionalNumericString(item.runTime));
  const movement = movementValues.every((value) => value !== null) ? sum(movementValues) : undefined;
  const stops = sum(dataGo.map((item) => item.stopLongSeconds));
  const speedSamples = [positions, ...trips];
  const validSpeeds = speedSamples.flatMap((item) => item !== undefined && item.maxSpeedKnots !== null ? [item.maxSpeedKnots] : []);
  const missingSpeeds = speedSamples.filter((item) => item?.maxSpeedStatus === "missing").length;
  const unrecognizedSpeeds = speedSamples.flatMap((item) => item?.maxSpeedStatus === "unrecognized" ? [item] : []);
  const maxSpeedKnots = validSpeeds.length === 0 ? undefined : Math.max(...validSpeeds);
  const speedFormat = unrecognizedSpeeds.find((item) => item.maxSpeedFormat !== undefined)?.maxSpeedFormat;
  const hasCoordinates = positions?.startCoordinates !== undefined || positions?.endCoordinates !== undefined || trips.some((item) => item.startCoordinates !== undefined || item.endCoordinates !== undefined);
  const hasStartAddress = dataGo.filter((item) => item.startA?.trim()).length;
  const hasEndAddress = dataGo.filter((item) => item.endA?.trim()).length;
  const positionsDistance = positions?.distanceMeters;
  console.log(`mode1 distanceMeters=${format(positionsDistance)}; distanceKm=${format(positions?.distanceKilometers)}; trips=${dataGo.length}; tripDistanceMeters=${format(goDistance)}; movementSeconds=${format(movement, 0)}; stopLongSeconds=${format(stops, 0)}; recognizedMaxSpeed=${validSpeeds.length}; missingMaxSpeed=${missingSpeeds}; unrecognizedMaxSpeed=${unrecognizedSpeeds.length}; maxSpeedKnots=${maxSpeedKnots === undefined ? "unavailable" : format(maxSpeedKnots)}; maxSpeedKmh=${maxSpeedKnots === undefined ? "unavailable" : format(maxSpeedKnots * 1.852)}; hasStartEndCoordinates=${hasCoordinates}; tripsWithStartA=${hasStartAddress}; tripsWithEndA=${hasEndAddress}`);
  if (speedFormat !== undefined) console.log(`mode1 unrecognizedMaxSpeedFormat: length=${speedFormat.length}; trimmedLength=${speedFormat.trimmedLength}; mask=${speedFormat.mask}`);
  return { positionsDistance, goDistance };
}

function printMode2(mode2: NonNullable<ReturnType<typeof firstMode2>>): void {
  const events = mode2.dataSpeed ?? [];
  const maxSpeed = Math.max(...events.flatMap((item) => item.speed === undefined ? [] : [item.speed]));
  const coordinates = events.filter((item) => item.lat !== undefined && item.lon !== undefined).map((item) => parseCoordinateTuple([item.lat!, item.lon!]));
  console.log(`mode2 events=${events.length}; overLimitEvents=${events.filter((item) => (item.overPercent ?? 0) > 0).length}; stateMaxSpeed=${format(mode2.stateMaxSpeed)}; maxRegSpeed=${format(mode2.maxRegSpeed)}; maxEventSpeedKmh=${Number.isFinite(maxSpeed) ? format(maxSpeed) : emptyValue}; eventsWithCoordinates=${coordinates.length}`);
}

function printRoutes(routes: WebRoutes, responseSizeBytes: number): { positionsDistance: number | undefined; goDistance: number | undefined } {
  const dataGo = routes.dataGo ?? [];
  const positions = dataGo.reduce((count, item) => count + (item.positions?.length ?? 0), 0);
  const positionsDistance = routes.dataPositions === undefined ? undefined : normalizeMode1DataPositions(routes.dataPositions).distanceMeters;
  const goDistance = sum(dataGo.map((item) => normalizeMode1DataGo(item).distanceMeters));
  console.log(`routes responseSizeBytes=${responseSizeBytes}; trips=${dataGo.length}; nestedPositions=${positions}; tmPoints=${routes.tm_points?.length ?? 0}; geofences=${routes.geofences?.length ?? 0}; distanceMatchesMode1=${positionsDistance === undefined ? "unknown" : positionsDistance === mode1ReferenceDistance}`);
  return { positionsDistance, goDistance };
}

let mode1ReferenceDistance: number | undefined;

try {
  const officialClient = new EqugpsClient(loadConfig());
  const webClient = new EquGpsWebClient(loadWebConfig());
  const devices = await officialClient.getDevices();
  const device = selectDevice(devices);
  const today = DateTime.now().setZone("Europe/Kyiv").toISODate();
  if (today === null) throw new Error("Unable to build the web API date.");

  const runs = await webClient.getRuns();
  const runDistance = runs.find((item) => item.id === device.id)?.runDistance;
  const runValues = runs.flatMap((item) => item.runDistance === undefined ? [] : [item.runDistance]);
  const deviceIds = new Set(devices.flatMap((item) => item.id === undefined ? [] : [item.id]));
  const runIds = new Set(runs.flatMap((item) => item.id === undefined ? [] : [item.id]));
  console.log(`runs rows=${runs.length}; nonzeroDistances=${runValues.filter((value) => value !== 0).length}; totalDistance=${format(sum(runValues))}; devicesMissingInRuns=${[...deviceIds].filter((id) => !runIds.has(id)).length}`);

  const mode1 = firstMode1(await webClient.getInfoMode1(device.id, today));
  if (mode1 === undefined) throw new Error("Web mode1 response does not contain a mode1 report.");
  const mode1Distances = printMode1(mode1);

  const mode2 = firstMode2(await webClient.getInfoMode2(device.id, today));
  if (mode2 === undefined) throw new Error("Web mode2 response does not contain a mode2 report.");
  printMode2(mode2);

  mode1ReferenceDistance = mode1Distances.positionsDistance;
  const routes = await webClient.getRoutesNewWithMetadata(device.id, "now");
  const routesDistances = printRoutes(routes.data, routes.responseSizeBytes);
  console.table([
    ["runs vs mode1 positions", compareDistances(mode1Distances.positionsDistance, runDistance)],
    ["mode1 dataGo vs positions", compareDistances(mode1Distances.positionsDistance, mode1Distances.goDistance)],
    ["routes positions vs mode1", compareDistances(mode1Distances.positionsDistance, routesDistances.positionsDistance)],
    ["routes dataGo vs mode1", compareDistances(mode1Distances.positionsDistance, routesDistances.goDistance)],
  ].map(([comparison, result]) => ({ comparison, absoluteDifference: format((result as ReturnType<typeof compareDistances>).absoluteDifference), percentageDifference: format((result as ReturnType<typeof compareDistances>).percentageDifference) })));
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : "Web API probe failed.");
  process.exitCode = 1;
}

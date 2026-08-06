const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const DATASET_DIRECTORY = path.join("data", "geofences", "vinnytsia-city");
const DATASET_FILE = "vinnytsia-city.geojson";
const METADATA_FILE = "metadata.json";
const CHECKSUM_FILE = "SHA256SUMS";
const CONTROL_POINTS_FILE = "control-points.json";
const ATTRIBUTION = "© OpenStreetMap contributors";
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const EXPECTED_SOURCE_OBJECT_ID = "361818";
const EXPECTED_SOURCE_ADMIN_LEVEL = "9";
const EXPECTED_PLACE_NAME = "Вінниця";
const EXPECTED_SCOPE = "city";
const REQUIRED_OUTSIDE_POINT_IDS = new Set(["vinnytski-khutory-centre", "desna-centre"]);

function repositoryRoot() {
  return path.resolve(__dirname, "../../..");
}

function parseUtf8Json(fileSystem, filePath, maximumBytes = MAX_FILE_BYTES) {
  const stats = fileSystem.statSync(filePath);
  if (!stats.isFile() || stats.size > maximumBytes) throw new Error("invalid");
  const bytes = fileSystem.readFileSync(filePath);
  if (!Buffer.isBuffer(bytes) || bytes.length > maximumBytes) throw new Error("invalid");
  try {
    return { bytes, value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) };
  } catch {
    throw new Error("invalid");
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function hasCoordinatesKey(value) {
  if (Array.isArray(value)) return value.some(hasCoordinatesKey);
  if (!isPlainObject(value)) return false;
  return Object.entries(value).some(([key, child]) => key === "coordinates" || hasCoordinatesKey(child));
}

function assertMetadata(metadata, checksum, polygon) {
  if (!isPlainObject(metadata) || hasCoordinatesKey(metadata)) throw new Error("invalid");
  if (metadata.datasetId !== "vinnytsia-city-boundary" || metadata.placeName !== EXPECTED_PLACE_NAME || metadata.scope !== EXPECTED_SCOPE || metadata.country !== "Ukraine") throw new Error("invalid");
  if (metadata.source !== "OpenStreetMap" || metadata.sourceObjectType !== "relation" || metadata.sourceObjectId !== EXPECTED_SOURCE_OBJECT_ID) throw new Error("invalid");
  if (metadata.sourceBoundary !== "administrative" || metadata.sourceAdminLevel !== EXPECTED_SOURCE_ADMIN_LEVEL) throw new Error("invalid");
  if (metadata.retrievalMethod !== "Nominatim polygon_geojson" || metadata.geometryType !== "Polygon" || metadata.license !== "ODbL-1.0" || metadata.attribution !== ATTRIBUTION) throw new Error("invalid");
  if (typeof metadata.retrievedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(metadata.retrievedAt) || Number.isNaN(Date.parse(metadata.retrievedAt))) throw new Error("invalid");
  if (metadata.sha256 !== checksum || !SHA256_PATTERN.test(metadata.sha256)) throw new Error("invalid");
  const ringCount = polygon.coordinates.length;
  const positionCount = polygon.coordinates.reduce((count, ring) => count + ring.length, 0);
  if (metadata.ringCount !== ringCount || metadata.positionCount !== positionCount) throw new Error("invalid");
  return { ringCount, positionCount };
}

function readChecksum(fileSystem, checksumPath, checksum) {
  const stats = fileSystem.statSync(checksumPath);
  if (!stats.isFile() || stats.size > MAX_FILE_BYTES) throw new Error("invalid");
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(fileSystem.readFileSync(checksumPath));
  } catch {
    throw new Error("invalid");
  }
  if (text.trim() !== checksum + "  " + DATASET_FILE) throw new Error("invalid");
}

function assertPoint(point, expected) {
  if (!isPlainObject(point) || typeof point.id !== "string" || point.id.length === 0 || typeof point.reason !== "string" || point.reason.length === 0 || point.expectedClassification !== expected || typeof point.longitude !== "number" || !Number.isFinite(point.longitude) || typeof point.latitude !== "number" || !Number.isFinite(point.latitude)) throw new Error("invalid");
}

function verifyControlPoints(controlPoints, polygon, dependencies) {
  if (!isPlainObject(controlPoints)) throw new Error("invalid");
  const groups = [
    ["inside", "INSIDE", "CITY"],
    ["outside", "OUTSIDE", "OUTSIDE_CITY"],
    ["boundary", "BOUNDARY", "CITY"],
  ];
  const results = {};
  const before = JSON.stringify(polygon);
  const pointIds = new Set();
  for (const [key, expectedClassification, expectedPolicy] of groups) {
    const points = controlPoints[key];
    if (!Array.isArray(points) || points.length < 3) throw new Error("invalid");
    if (key === "outside") {
      const outsideIds = new Set(points.map((point) => point?.id));
      for (const requiredId of REQUIRED_OUTSIDE_POINT_IDS) if (!outsideIds.has(requiredId)) throw new Error("invalid");
    }
    let passed = 0;
    for (const point of points) {
      assertPoint(point, expectedClassification);
      if (point.id.trim().length === 0 || pointIds.has(point.id)) throw new Error("invalid");
      pointIds.add(point.id);
      const classification = dependencies.classifyPointInPolygon(polygon, point);
      if (classification !== expectedClassification || dependencies.classifySpeedLimitZone(classification) !== expectedPolicy) throw new Error("invalid");
      passed += 1;
    }
    results[key] = { checked: points.length, passed };
  }
  if (JSON.stringify(polygon) !== before) throw new Error("invalid");
  return results;
}

function verify(rootDir = repositoryRoot(), dependencies = {}) {
  const fileSystem = dependencies.fs ?? fs;
  const datasetDirectory = path.join(rootDir, DATASET_DIRECTORY);
  const geometryPath = path.join(datasetDirectory, DATASET_FILE);
  const metadataPath = path.join(datasetDirectory, METADATA_FILE);
  const checksumPath = path.join(datasetDirectory, CHECKSUM_FILE);
  const controlPointsPath = path.join(datasetDirectory, CONTROL_POINTS_FILE);
  const validateGeoJsonPolygon = dependencies.validateGeoJsonPolygon ?? require("../dist/modules/alert-settings/alert-settings.validation").validateGeoJsonPolygon;
  const classifyPointInPolygon = dependencies.classifyPointInPolygon ?? require("../dist/modules/city-geofence/city-geofence.geometry").classifyPointInPolygon;
  const classifySpeedLimitZone = dependencies.classifySpeedLimitZone ?? require("../dist/modules/city-geofence/city-geofence.policy").classifySpeedLimitZone;
  const geometry = parseUtf8Json(fileSystem, geometryPath);
  if (!isPlainObject(geometry.value) || geometry.value.type !== "Polygon") throw new Error("invalid");
  const polygon = validateGeoJsonPolygon(geometry.value);
  if (polygon === null || polygon.type !== "Polygon") throw new Error("invalid");
  const checksum = crypto.createHash("sha256").update(geometry.bytes).digest("hex");
  const metadata = parseUtf8Json(fileSystem, metadataPath).value;
  const counts = assertMetadata(metadata, checksum, polygon);
  readChecksum(fileSystem, checksumPath, checksum);
  const controlPoints = parseUtf8Json(fileSystem, controlPointsPath).value;
  const controls = verifyControlPoints(controlPoints, polygon, { classifyPointInPolygon, classifySpeedLimitZone });
  return { ...counts, controls };
}

function createSuccessOutput(result) {
  return [
    "dataset present: true",
    "metadata valid: true",
    "geometry type: Polygon",
    "polygon valid: true",
    "ring count: " + result.ringCount,
    "position count: " + result.positionCount,
    "checksum valid: true",
    "license: ODbL-1.0",
    "scope: city",
    "inside points checked: " + result.controls.inside.checked,
    "inside points passed: " + result.controls.inside.passed,
    "outside points checked: " + result.controls.outside.checked,
    "outside points passed: " + result.controls.outside.passed,
    "boundary points checked: " + result.controls.boundary.checked,
    "boundary points passed: " + result.controls.boundary.passed,
    "city policy points passed: " + (result.controls.inside.passed + result.controls.boundary.passed),
    "outside policy points passed: " + result.controls.outside.passed,
    "database initialized: false",
    "network requests: 0",
  ];
}

function run(options = {}) {
  const output = options.output ?? ((line) => console.log(line));
  try {
    const result = verify(options.rootDir, options.dependencies);
    for (const line of createSuccessOutput(result)) output(line);
    return 0;
  } catch {
    output("verification error: invalid dataset");
    return 1;
  }
}

if (require.main === module) process.exitCode = run();

module.exports = { ATTRIBUTION, DATASET_DIRECTORY, DATASET_FILE, EXPECTED_PLACE_NAME, EXPECTED_SCOPE, EXPECTED_SOURCE_ADMIN_LEVEL, EXPECTED_SOURCE_OBJECT_ID, MAX_FILE_BYTES, REQUIRED_OUTSIDE_POINT_IDS, createSuccessOutput, repositoryRoot, run, verify };

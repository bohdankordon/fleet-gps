"use strict";

// Development-only local data fixture.  This file is intentionally outside
// Nest modules and is never imported by application startup.
const crypto = require("node:crypto");
const { Client } = require("pg");
const { PrismaPg } = require("@prisma/adapter-pg");
const { DateTime } = require("luxon");
const { loadRootEnv } = require("./load-root-env.cjs");
const { parseLocalDevelopmentDatabase, LOCAL_DATABASE } = require("./dev-vehicle-detail-fixtures-safety.cjs");

const FIXTURE_PREFIX = "vehicle-detail-dev-fixture-v1";
const VEHICLES = Object.freeze([
  { key: "full", id: "d3e0f001-5a11-4b9d-8f00-000000000001", externalDeviceId: 1900000001, name: "DEMO FULL", disabled: false },
  { key: "stale", id: "d3e0f001-5a11-4b9d-8f00-000000000002", externalDeviceId: 1900000002, name: "DEMO STALE", disabled: false },
  { key: "none", id: "d3e0f001-5a11-4b9d-8f00-000000000003", externalDeviceId: 1900000003, name: "DEMO NO POSITION", disabled: false },
  { key: "disabled", id: "d3e0f001-5a11-4b9d-8f00-000000000004", externalDeviceId: 1900000004, name: "DEMO DISABLED", disabled: true },
]);

function fixtureId(label) {
  const value = crypto.createHash("sha256").update(`${FIXTURE_PREFIX}:${label}`).digest("hex");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-4${value.slice(13, 16)}-8${value.slice(17, 20)}-${value.slice(20, 32)}`;
}
function key(label) { return crypto.createHash("sha256").update(`${FIXTURE_PREFIX}:${label}`).digest("hex"); }
function haversine(a, b) {
  const r = 6_371_000; const rad = (v) => v * Math.PI / 180;
  const lat = rad(b.latitude - a.latitude); const lon = rad(b.longitude - a.longitude);
  const h = Math.sin(lat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(lon / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
function parseMode(argv) {
  if (argv.length !== 1 || !["--plan", "--apply", "--clean"].includes(argv[0])) throw new Error("Usage: npm run dev:fixtures:vehicle-detail -- --plan|--apply|--clean");
  return argv[0].slice(2);
}
function makeTimeline(now) {
  const latest = new Date(Math.floor((now.getTime() - 60_000) / 60_000) * 60_000);
  const offsets = [50, 26, 1.35];
  const observations = [];
  for (let block = 0; block < offsets.length; block += 1) {
    const start = new Date(latest.getTime() - offsets[block] * 3_600_000);
    let latitude = 49.2331 + block * 0.003; let longitude = 28.4682 + block * 0.002;
    const add = (minute, speedKph, moving, quality = {}) => {
      if (moving) { longitude += block % 2 === 0 ? 0.0038 : -0.0038; latitude += 0.00035; }
      else { latitude += 0.000005; longitude -= 0.000004; }
      observations.push({ id: fixtureId(`position-${observations.length}`), fixFingerprint: key(`position-${observations.length}`), observedAt: new Date(start.getTime() + minute * 60_000), latitude, longitude, speedKph, valid: quality.valid ?? true, outdated: quality.outdated ?? false });
    };
    for (let minute = 0; minute <= 5; minute += 1) add(minute, 0, false);
    for (let minute = 6; minute <= 20; minute += 1) add(minute, 23, true);
    for (let minute = 21; minute <= 26; minute += 1) add(minute, 0, false);
    for (let minute = 27; minute <= 41; minute += 1) add(minute, 26, true);
    // 41 -> 53 is a deliberate strict >300 second GPS gap.
    for (let minute = 53; minute <= 67; minute += 1) add(minute, 22, true, minute === 59 ? { valid: false } : {});
    for (let minute = 68; minute <= 74; minute += 1) add(minute, 0, false, minute === 70 ? { outdated: true } : {});
  }
  observations.sort((a, b) => a.observedAt - b.observedAt);
  return { latest, observations };
}
function buildPlan(now, settings) {
  const timeline = makeTimeline(now);
  const full = VEHICLES[0];
  const threshold = settings.citySpeedLimitKph + settings.speedToleranceKph;
  const active = [
    { id: fixtureId("event-active-speeding"), type: "SPEEDING", status: "OPEN", confirmedAt: new Date(timeline.latest - 45 * 60_000), lastObservedAt: new Date(timeline.latest - 10 * 60_000), resolvedAt: null, speedZone: "CITY", confirmationSpeedKph: threshold + 18, lastSpeedKph: threshold + 10, peakSpeedKph: threshold + 28, speedThresholdKph: threshold, confirmationTraveledDistanceMeters: null, lastTraveledDistanceMeters: null, minimumTraveledDistanceMeters: null, distanceThresholdMeters: null, durationThresholdMinutes: null },
    { id: fixtureId("event-active-inactivity"), type: "INACTIVITY", status: "OPEN", confirmedAt: new Date(timeline.latest - 52 * 60_000), lastObservedAt: new Date(timeline.latest - 8 * 60_000), resolvedAt: null, speedZone: null, confirmationSpeedKph: null, lastSpeedKph: null, peakSpeedKph: null, speedThresholdKph: null, confirmationTraveledDistanceMeters: 35, lastTraveledDistanceMeters: 42, minimumTraveledDistanceMeters: 18, distanceThresholdMeters: settings.inactivityDistanceMeters, durationThresholdMinutes: settings.inactivityDurationMinutes },
  ];
  const resolved = [
    ["SPEEDING", 125], ["INACTIVITY", 155], ["SPEEDING", 195], ["INACTIVITY", 225],
  ].map(([type, ago], index) => {
    const confirmedAt = new Date(timeline.latest - Number(ago) * 60_000); const resolvedAt = new Date(confirmedAt.getTime() + 12 * 60_000);
    return type === "SPEEDING"
      ? { id: fixtureId(`event-resolved-${index}`), type, status: "RESOLVED", confirmedAt, lastObservedAt: resolvedAt, resolvedAt, speedZone: "CITY", confirmationSpeedKph: threshold + 15, lastSpeedKph: threshold - 8, peakSpeedKph: threshold + 22, speedThresholdKph: threshold, confirmationTraveledDistanceMeters: null, lastTraveledDistanceMeters: null, minimumTraveledDistanceMeters: null, distanceThresholdMeters: null, durationThresholdMinutes: null }
      : { id: fixtureId(`event-resolved-${index}`), type, status: "RESOLVED", confirmedAt, lastObservedAt: resolvedAt, resolvedAt, speedZone: null, confirmationSpeedKph: null, lastSpeedKph: null, peakSpeedKph: null, speedThresholdKph: null, confirmationTraveledDistanceMeters: 55, lastTraveledDistanceMeters: 320, minimumTraveledDistanceMeters: 40, distanceThresholdMeters: settings.inactivityDistanceMeters, durationThresholdMinutes: settings.inactivityDurationMinutes };
  });
  // DailyVehicleStat stores the application's local calendar date as the
  // UTC timestamp at 00:00, matching the existing details repository query.
  const localDate = DateTime.fromJSDate(now, { zone: "utc" }).setZone(settings.timezone).toFormat("yyyy-LL-dd");
  const serviceDate = new Date(`${localDate}T00:00:00.000Z`);
  const todayStart = serviceDate.getTime();
  let distance = 0; let movementSeconds = 0;
  for (let index = 1; index < timeline.observations.length; index += 1) {
    const before = timeline.observations[index - 1]; const current = timeline.observations[index];
    const elapsed = current.observedAt - before.observedAt;
    if (before.observedAt >= todayStart && elapsed > 0 && elapsed <= settings.tripDataGapSeconds * 1_000) {
      distance += haversine(before, current); if (current.speedKph >= settings.tripMovementSpeedKph) movementSeconds += elapsed / 1_000;
    }
  }
  return { full, timeline, serviceDate, distance: Math.round(distance * 100) / 100, movementSeconds, events: [...active, ...resolved], activeCount: active.length, resolvedCount: resolved.length };
}
function expectedIds(plan) { return Object.freeze({ vehicle: VEHICLES.map((v) => v.id), position: plan.timeline.observations.map((p) => p.id), event: plan.events.map((e) => e.id), confirmation: plan.events.map((e) => key(`event-${e.id}`)), daily: [fixtureId("daily-full")] }); }
async function assertDatabaseIdentity(connectionString) {
  const client = new Client({ connectionString });
  try {
    await client.connect(); const result = await client.query("SELECT current_database() AS database");
    if (result.rows[0]?.database !== LOCAL_DATABASE) throw new Error("fixture database identity did not match the known local development database");
  } finally { await client.end().catch(() => {}); }
}
async function fixturePresence(prisma) {
  const matches = await prisma.vehicle.findMany({ where: { OR: [{ id: { in: VEHICLES.map((v) => v.id) } }, { externalDeviceId: { in: VEHICLES.map((v) => v.externalDeviceId) } }, { name: { in: VEHICLES.map((v) => v.name) } }] }, select: { id: true, name: true, externalDeviceId: true, disabled: true } });
  const collisions = [];
  for (const target of VEHICLES) {
    const found = matches.filter((row) => row.id === target.id || row.externalDeviceId === target.externalDeviceId || row.name === target.name);
    if (found.some((row) => row.id !== target.id || row.name !== target.name || row.externalDeviceId !== target.externalDeviceId || row.disabled !== target.disabled)) collisions.push(target.name);
  }
  return { present: matches.filter((row) => VEHICLES.some((v) => v.id === row.id)).length, collisions };
}
async function deleteOwned(transaction, ids) {
  const notifications = await transaction.alertNotification.findMany({ where: { alertEventId: { in: ids.event } }, select: { id: true } });
  const notificationIds = notifications.map((row) => row.id);
  const deliveries = notificationIds.length ? await transaction.alertNotificationDelivery.deleteMany({ where: { notificationId: { in: notificationIds } } }) : { count: 0 };
  const notification = await transaction.alertNotification.deleteMany({ where: { alertEventId: { in: ids.event } } });
  const outbox = await transaction.alertNotificationOutbox.deleteMany({ where: { alertEventId: { in: ids.event } } });
  const confirmations = await transaction.alertEventConfirmation.deleteMany({ where: { dedupeKey: { in: ids.confirmation } } });
  const events = await transaction.alertEvent.deleteMany({ where: { id: { in: ids.event } } });
  const positions = await transaction.vehiclePositionObservation.deleteMany({ where: { id: { in: ids.position } } });
  const daily = await transaction.dailyVehicleStat.deleteMany({ where: { id: { in: ids.daily } } });
  const states = await transaction.vehicleCurrentState.deleteMany({ where: { vehicleId: { in: ids.vehicle } } });
  const vehicles = await transaction.vehicle.deleteMany({ where: { id: { in: ids.vehicle } } });
  return { deliveries: deliveries.count, notifications: notification.count, outbox: outbox.count, confirmations: confirmations.count, events: events.count, observations: positions.count, dailyStats: daily.count, currentStates: states.count, vehicles: vehicles.count };
}
async function applyFixture(prisma, plan) {
  const ids = expectedIds(plan);
  return prisma.$transaction(async (transaction) => {
    const deleted = await deleteOwned(transaction, ids);
    await transaction.vehicle.createMany({ data: VEHICLES.map(({ id, externalDeviceId, name, disabled }) => ({ id, externalDeviceId, name, disabled })) });
    await transaction.vehicleCurrentState.createMany({ data: [
      { vehicleId: VEHICLES[0].id, status: "ONLINE", externalLastUpdateAt: plan.timeline.latest, fixTime: plan.timeline.latest, latitude: plan.timeline.observations.at(-1).latitude, longitude: plan.timeline.observations.at(-1).longitude, speedKph: 24, valid: true, outdated: false, fetchedAt: plan.timeline.latest },
      { vehicleId: VEHICLES[1].id, status: "ONLINE", externalLastUpdateAt: new Date(plan.timeline.latest - 8 * 3_600_000), fixTime: new Date(plan.timeline.latest - 8 * 3_600_000), latitude: 49.229, longitude: 28.455, speedKph: 0, valid: true, outdated: false, fetchedAt: plan.timeline.latest },
      { vehicleId: VEHICLES[2].id, status: "UNKNOWN", externalLastUpdateAt: null, fixTime: null, latitude: null, longitude: null, speedKph: null, valid: null, outdated: null, fetchedAt: plan.timeline.latest },
      { vehicleId: VEHICLES[3].id, status: "OFFLINE", externalLastUpdateAt: new Date(plan.timeline.latest - 2 * 3_600_000), fixTime: new Date(plan.timeline.latest - 2 * 3_600_000), latitude: 49.241, longitude: 28.477, speedKph: 0, valid: true, outdated: false, fetchedAt: plan.timeline.latest },
    ] });
    await transaction.vehiclePositionObservation.createMany({ data: plan.timeline.observations.map((point) => ({ ...point, vehicleId: plan.full.id, fetchedAt: plan.timeline.latest, ingestionSource: "HISTORICAL_BACKFILL" })) });
    await transaction.dailyVehicleStat.create({ data: { id: ids.daily[0], vehicleId: plan.full.id, serviceDate: plan.serviceDate, distanceMeters: plan.distance, movementDurationSeconds: plan.movementSeconds, maxSpeedKph: 26, source: "HISTORICAL_POSITIONS", quality: "EXACT", isStale: false, isDegraded: false, fetchedAt: plan.timeline.latest } });
    await transaction.alertEvent.createMany({ data: plan.events.map((event) => ({ ...event, vehicleId: plan.full.id, dedupeKey: key(`event-${event.id}`), activeKey: event.status === "OPEN" ? key(`active-${event.type}-${plan.full.id}`) : null })) });
    await transaction.alertEventConfirmation.createMany({ data: plan.events.map((event) => ({ dedupeKey: key(`event-${event.id}`), eventId: event.id, observedAt: event.confirmedAt })) });
    return deleted;
  }, { timeout: 30_000 });
}
async function main() {
  const mode = parseMode(process.argv.slice(2)); loadRootEnv();
  const safe = parseLocalDevelopmentDatabase(process.env);
  await assertDatabaseIdentity(process.env.DATABASE_URL);
  const { PrismaClient } = require("../dist/generated/prisma/client");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 2 }) });
  try {
    const settings = await prisma.applicationSettings.findUnique({ where: { id: 1 }, select: { timezone: true, positionFreshnessSeconds: true, citySpeedLimitKph: true, speedToleranceKph: true, inactivityDistanceMeters: true, inactivityDurationMinutes: true, tripMovementSpeedKph: true, tripDataGapSeconds: true } });
    if (!settings) throw new Error("fixture requires ApplicationSettings id=1");
    const plan = buildPlan(new Date(), settings); const presence = await fixturePresence(prisma);
    if (presence.collisions.length) throw new Error(`fixture identity collision: ${presence.collisions.join(", ")}`);
    const ids = expectedIds(plan);
    if (mode === "plan") {
      console.log(JSON.stringify({ mode, databaseSafety: { host: safe.hostname, database: safe.database, port: safe.port, mode: safe.mode }, fixtures: VEHICLES.map(({ id, name }) => ({ id, name })), existingFixtureVehicles: presence.present, planned: { observations: plan.timeline.observations.length, activeEvents: plan.activeCount, resolvedEvents: plan.resolvedCount, dailyStats: 1, qualityWarnings: plan.timeline.observations.filter((p) => p.valid === false || p.outdated === true).length }, replaceOnApply: presence.present > 0 }));
      return;
    }
    if (mode === "clean") { console.log(JSON.stringify({ mode, databaseSafety: { host: safe.hostname, database: safe.database }, deleted: await prisma.$transaction((tx) => deleteOwned(tx, ids)) })); return; }
    const deleted = await applyFixture(prisma, plan);
    console.log(JSON.stringify({ mode, databaseSafety: { host: safe.hostname, database: safe.database }, deletedBeforeCreate: deleted, created: { vehicles: VEHICLES.length, observations: plan.timeline.observations.length, events: plan.events.length, dailyStats: 1 }, fullVehicleId: plan.full.id, fullVehicleName: plan.full.name, serviceDate: DateTime.fromJSDate(plan.serviceDate, { zone: "utc" }).setZone(settings.timezone).toISODate(), freshnessSeconds: settings.positionFreshnessSeconds, observationFrom: plan.timeline.observations[0].observedAt.toISOString(), observationTo: plan.timeline.observations.at(-1).observedAt.toISOString() }));
  } finally { await prisma.$disconnect(); }
}
if (require.main === module) main().catch((error) => { console.error(`vehicle detail development fixture failed: ${error instanceof Error ? error.message : "unknown"}`); process.exitCode = 1; });
module.exports = { VEHICLES, buildPlan, fixtureId, makeTimeline, parseMode };

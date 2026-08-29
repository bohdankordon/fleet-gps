const assert = require("node:assert/strict");
const { randomInt, randomUUID } = require("node:crypto");

const MIGRATION_NAME = "20260808220000_add_alert_notification_outbox";
const EARTH_RADIUS_METERS = 6_371_000;

class RollbackSignal extends Error {}

function observation(vehicleId, observedAtMs, point, speedKph) {
  return Object.freeze({ vehicleId, observedAt: new Date(observedAtMs).toISOString(), latitude: point.latitude, longitude: point.longitude, speedKph });
}

function movePoint(point, meters) {
  const latitudeDelta = meters / EARTH_RADIUS_METERS * 180 / Math.PI;
  return Object.freeze({ latitude: point.latitude + latitudeDelta <= 90 ? point.latitude + latitudeDelta : point.latitude - latitudeDelta, longitude: point.longitude });
}

async function main() {
  if (typeof process.env.DATABASE_URL !== "string" || process.env.DATABASE_URL.trim() === "") {
    console.log("alert evaluation smoke: configuration required");
    process.exitCode = 1;
    return;
  }

  const nativeFetch = globalThis.fetch;
  let externalRequests = 0;
  let applicationClosed = false;
  let report;
  const vehicleId = randomUUID();
  const { PrismaPg } = require("@prisma/adapter-pg");
  const { PrismaClient } = require("../dist/generated/prisma/client");
  const { AlertSettingsRepository } = require("../dist/modules/alert-settings/alert-settings.repository");
  const { AlertSettingsService } = require("../dist/modules/alert-settings/alert-settings.service");
  const { CityGeofenceService } = require("../dist/modules/city-geofence/city-geofence.service");
  const { SpeedingDetectorService } = require("../dist/modules/speeding-detector/speeding-detector.service");
  const { SpeedingDetectorStateMachine } = require("../dist/modules/speeding-detector/speeding-detector.state-machine");
  const { InactivityDetectorService } = require("../dist/modules/inactivity-detector/inactivity-detector.service");
  const { InactivityDetectorStateMachine } = require("../dist/modules/inactivity-detector/inactivity-detector.state-machine");
  const { PrismaAlertEventsRepository } = require("../dist/modules/alert-events/prisma-alert-events.repository");
  const { AlertEventsLifecycleService } = require("../dist/modules/alert-events/alert-events-lifecycle.service");
  const { AlertEventProcessorService } = require("../dist/modules/alert-events/alert-event-processor.service");
  const { AlertEvaluationService } = require("../dist/modules/alert-evaluation/alert-evaluation.service");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

  try {
    if (typeof nativeFetch === "function") globalThis.fetch = async () => { externalRequests += 1; throw new Error("Unexpected external request"); };
    const applied = await prisma.$queryRaw`SELECT 1 FROM "_prisma_migrations" WHERE migration_name = ${MIGRATION_NAME} AND finished_at IS NOT NULL LIMIT 1`;
    if (!Array.isArray(applied) || applied.length !== 1) {
      console.log(`alert evaluation smoke: migration required (${MIGRATION_NAME})`);
      process.exitCode = 1;
      return;
    }

    try {
      await prisma.$transaction(async (transaction) => {
        await transaction.vehicle.create({ data: { id: vehicleId, externalDeviceId: randomInt(1_500_000_000, 2_000_000_000), name: "alert-evaluation-smoke", disabled: true } });
        const database = { getClient: () => transaction };
        const alertSettings = new AlertSettingsService(new AlertSettingsRepository(database));
        const cityGeofence = new CityGeofenceService(alertSettings);
        const speedingDetector = new SpeedingDetectorService(alertSettings, cityGeofence, new SpeedingDetectorStateMachine());
        const inactivityDetector = new InactivityDetectorService(alertSettings, new InactivityDetectorStateMachine());
        const repository = new PrismaAlertEventsRepository(database, { telegramNotifications: { enabled: true } });
        const lifecycle = new AlertEventsLifecycleService(repository);
        const processor = new AlertEventProcessorService(lifecycle);
        const evaluation = new AlertEvaluationService(speedingDetector, inactivityDetector, processor);

        try {
          const settings = await alertSettings.getSettings();
          assert.equal(settings.cityGeofence.configured, true, "configured CityGeofence required");
          assert.equal(settings.speedRuleEnabled, true, "speed rule must be enabled for smoke");
          assert.equal(settings.inactivityRuleEnabled, true, "inactivity rule must be enabled for smoke");
          assert.equal(settings.speedingConfirmationUpdates, 2, "smoke requires the current two-update speeding confirmation rule");
          assert.equal(settings.inactivityDurationMinutes, 60, "smoke requires the current 60-minute inactivity rule");
          const firstCoordinate = settings.cityGeofence.geometry?.coordinates?.[0]?.[0];
          assert.equal(Array.isArray(firstCoordinate) && firstCoordinate.length >= 2, true, "configured CityGeofence has no boundary point");
          const cityPoint = Object.freeze({ longitude: firstCoordinate[0], latitude: firstCoordinate[1] });
          assert.equal(Number.isFinite(cityPoint.latitude) && Number.isFinite(cityPoint.longitude), true);

          const speedingBase = Date.UTC(2026, 7, 8, 10, 0, 0);
          const exceedingSpeed = settings.effectiveSpeedThresholds.cityKph + 0.125;
          const beforeInvalidSpeed = {
            events: await transaction.alertEvent.count({ where: { vehicleId } }),
            confirmations: await transaction.alertEventConfirmation.count({ where: { event: { vehicleId } } }),
          };
          const invalidSpeed = await evaluation.evaluateObservation(observation(vehicleId, speedingBase - 60_000, cityPoint, Number.NaN));
          const afterInvalidSpeed = {
            events: await transaction.alertEvent.count({ where: { vehicleId } }),
            confirmations: await transaction.alertEventConfirmation.count({ where: { event: { vehicleId } } }),
          };
          const invalidSpeedPersistenceSkipped = invalidSpeed.speeding.detection.status === "IGNORED"
            && invalidSpeed.speeding.detection.reason === "INVALID_OBSERVATION"
            && invalidSpeed.inactivity.detection.status === "IGNORED"
            && invalidSpeed.inactivity.detection.reason === "INVALID_OBSERVATION"
            && invalidSpeed.speeding.processing.action === "NONE"
            && invalidSpeed.inactivity.processing.action === "NONE"
            && beforeInvalidSpeed.events === afterInvalidSpeed.events
            && beforeInvalidSpeed.confirmations === afterInvalidSpeed.confirmations;
          assert.equal(invalidSpeedPersistenceSkipped, true);
          assert.equal(speedingDetector.stateCount(), 0); assert.equal(inactivityDetector.stateCount(), 0);
          const speedPending = await evaluation.evaluateObservation(observation(vehicleId, speedingBase, cityPoint, exceedingSpeed));
          const speedConfirmed = await evaluation.evaluateObservation(observation(vehicleId, speedingBase + 60_000, cityPoint, exceedingSpeed));
          const speedActive = await evaluation.evaluateObservation(observation(vehicleId, speedingBase + 120_000, cityPoint, exceedingSpeed));
          const speedClear = await evaluation.evaluateObservation(observation(vehicleId, speedingBase + 180_000, cityPoint, settings.effectiveSpeedThresholds.cityKph));
          assert.deepEqual([speedPending.speeding.detection.status, speedConfirmed.speeding.detection.status, speedActive.speeding.detection.status, speedClear.speeding.detection.status], ["PENDING", "CONFIRMED", "ACTIVE", "CLEAR"]);
          assert.deepEqual([speedPending.speeding.processing.action, speedConfirmed.speeding.processing.persistenceOutcome, speedActive.speeding.processing.persistenceOutcome, speedClear.speeding.processing.persistenceOutcome], ["NONE", "CREATED", "UPDATED", "RESOLVED"]);
          assert.equal(speedPending.speeding.detection.zone, "CITY");

          evaluation.resetVehicle(vehicleId);
          const inactivityBase = Date.UTC(2026, 7, 8, 12, 0, 0);
          const durationMs = settings.inactivityDurationMinutes * 60_000;
          const collectingFirst = await evaluation.evaluateObservation(observation(vehicleId, inactivityBase, cityPoint, 0));
          await evaluation.evaluateObservation(observation(vehicleId, inactivityBase + durationMs / 2, cityPoint, 0));
          const collectingLast = await evaluation.evaluateObservation(observation(vehicleId, inactivityBase + durationMs - 1_000, cityPoint, 0));
          const inactivityConfirmed = await evaluation.evaluateObservation(observation(vehicleId, inactivityBase + durationMs, cityPoint, 0));
          const inactivityActive = await evaluation.evaluateObservation(observation(vehicleId, inactivityBase + durationMs + 60_000, cityPoint, 0));
          const movedPoint = movePoint(cityPoint, settings.inactivityDistanceMeters + 50);
          const inactivityClear = await evaluation.evaluateObservation(observation(vehicleId, inactivityBase + durationMs + 120_000, movedPoint, 0));
          assert.deepEqual([collectingFirst.inactivity.detection.status, collectingLast.inactivity.detection.status, inactivityConfirmed.inactivity.detection.status, inactivityActive.inactivity.detection.status, inactivityClear.inactivity.detection.status], ["COLLECTING", "COLLECTING", "CONFIRMED", "ACTIVE", "CLEAR"]);
          assert.deepEqual([collectingFirst.inactivity.processing.action, inactivityConfirmed.inactivity.processing.persistenceOutcome, inactivityActive.inactivity.processing.persistenceOutcome, inactivityClear.inactivity.processing.persistenceOutcome], ["NONE", "CREATED", "UPDATED", "RESOLVED"]);

          const transactionalEvents = await transaction.alertEvent.count({ where: { vehicleId } });
          const transactionalConfirmations = await transaction.alertEventConfirmation.count({ where: { event: { vehicleId } } });
          assert.equal(transactionalEvents, 2); assert.equal(transactionalConfirmations, 2);
          report = { invalidSpeed, invalidSpeedPersistenceSkipped, speedPending, speedConfirmed, speedActive, speedClear, collectingFirst, inactivityConfirmed, inactivityActive, inactivityClear, transactionalWritesExercised: true };
        } finally {
          evaluation.clearAll();
          assert.equal(speedingDetector.stateCount(), 0);
          assert.equal(inactivityDetector.stateCount(), 0);
        }
        throw new RollbackSignal();
      }, { timeout: 30_000 });
      throw new Error("alert evaluation smoke rollback missing");
    } catch (error) {
      if (!(error instanceof RollbackSignal)) throw error;
    }

    const temporaryEvents = await prisma.alertEvent.count({ where: { vehicleId } });
    const temporaryConfirmations = await prisma.alertEventConfirmation.count({ where: { event: { vehicleId } } });
    const temporaryVehicles = await prisma.vehicle.count({ where: { id: vehicleId } });
    const persistedTemporaryRows = temporaryEvents + temporaryConfirmations + temporaryVehicles;
    assert.equal(persistedTemporaryRows, 0);
    assert.equal(externalRequests, 0);
    report = { ...report, temporaryEvents, temporaryConfirmations, temporaryVehicles, persistedTemporaryRows, detectorStateCount: 0 };
  } catch (error) {
    console.log(`alert evaluation smoke: failed (${error instanceof Error ? `${error.name}: ${error.message}` : "unknown"})`);
    process.exitCode = 1;
  } finally {
    globalThis.fetch = nativeFetch;
    try { await prisma.$disconnect(); applicationClosed = true; } catch { process.exitCode = 1; }
  }

  if (process.exitCode !== 1 && report) {
    console.log("alert evaluation smoke: passed");
    console.log(`invalid speed speeding: ${report.invalidSpeed.speeding.detection.status}`);
    console.log(`invalid speed inactivity: ${report.invalidSpeed.inactivity.detection.status}`);
    console.log(`invalid speed persistence skipped: ${report.invalidSpeedPersistenceSkipped}`);
    console.log(`speeding first exceed: ${report.speedPending.speeding.detection.status} / ${report.speedPending.speeding.processing.action}`);
    console.log(`speeding second exceed: ${report.speedConfirmed.speeding.detection.status} / ${report.speedConfirmed.speeding.processing.persistenceOutcome}`);
    console.log(`speeding third exceed: ${report.speedActive.speeding.detection.status} / ${report.speedActive.speeding.processing.persistenceOutcome}`);
    console.log(`speeding threshold clear: ${report.speedClear.speeding.detection.status} / ${report.speedClear.speeding.processing.persistenceOutcome}`);
    console.log(`inactivity collecting: ${report.collectingFirst.inactivity.detection.status} / ${report.collectingFirst.inactivity.processing.action}`);
    console.log(`inactivity confirmed: ${report.inactivityConfirmed.inactivity.detection.status} / ${report.inactivityConfirmed.inactivity.processing.persistenceOutcome}`);
    console.log(`inactivity active: ${report.inactivityActive.inactivity.detection.status} / ${report.inactivityActive.inactivity.processing.persistenceOutcome}`);
    console.log(`inactivity movement clear: ${report.inactivityClear.inactivity.detection.status} / ${report.inactivityClear.inactivity.processing.persistenceOutcome}`);
    console.log(`transactional writes exercised: ${report.transactionalWritesExercised}`);
    console.log("transaction rollback: verified");
    console.log(`persisted temporary rows after rollback: ${report.persistedTemporaryRows}`);
    console.log(`temporary AlertEvent rows: ${report.temporaryEvents}`);
    console.log(`temporary AlertEventConfirmation rows: ${report.temporaryConfirmations}`);
    console.log(`temporary Vehicle rows: ${report.temporaryVehicles}`);
    console.log(`detector state count: ${report.detectorStateCount}`);
    console.log(`external requests: ${externalRequests}`);
    console.log(`application closed: ${applicationClosed}`);
  }
}

if (require.main === module) void main().catch((error) => {
  console.log(`alert evaluation smoke: failed (${error instanceof Error ? error.name : "unknown"})`);
  process.exitCode = 1;
});

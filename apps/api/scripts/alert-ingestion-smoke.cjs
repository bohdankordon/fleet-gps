const assert = require("node:assert/strict");
const { randomInt, randomUUID } = require("node:crypto");

const MIGRATION_NAME = "20260808180000_add_alert_evaluation_observations";
class RollbackSignal extends Error {}

function observation(vehicleId, observedAtMs, point, speedKph) {
  return Object.freeze({ vehicleId, observedAt: new Date(observedAtMs).toISOString(), latitude: point.latitude, longitude: point.longitude, speedKph });
}

async function main() {
  if (typeof process.env.DATABASE_URL !== "string" || process.env.DATABASE_URL.trim() === "") {
    console.log("alert ingestion smoke: configuration required"); process.exitCode = 1; return;
  }
  const { PrismaPg } = require("@prisma/adapter-pg");
  const { PrismaClient } = require("../dist/generated/prisma/client");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  let applicationClosed = false; let externalRequests = 0; const nativeFetch = globalThis.fetch; const vehicleId = randomUUID(); let report;
  try {
    const applied = await prisma.$queryRaw`SELECT 1 FROM "_prisma_migrations" WHERE migration_name = ${MIGRATION_NAME} AND finished_at IS NOT NULL LIMIT 1`;
    if (!Array.isArray(applied) || applied.length !== 1) {
      console.log(`alert ingestion smoke: migration required (${MIGRATION_NAME})`); return;
    }
    if (typeof nativeFetch === "function") globalThis.fetch = async () => { externalRequests += 1; throw new Error("Unexpected external request"); };
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
    const { AlertObservationRepository } = require("../dist/modules/alert-ingestion/alert-observation.repository");
    const { AlertObservationIngestionService } = require("../dist/modules/alert-ingestion/alert-observation-ingestion.service");
    try {
      await prisma.$transaction(async (transaction) => {
        await transaction.vehicle.create({ data: { id: vehicleId, externalDeviceId: randomInt(1_500_000_000, 2_000_000_000), name: "alert-ingestion-smoke", disabled: true } });
        const database = { getClient: () => transaction };
        const alertSettings = new AlertSettingsService(new AlertSettingsRepository(database));
        const settings = await alertSettings.getSettings();
        const firstCoordinate = settings.cityGeofence.geometry?.coordinates?.[0]?.[0];
        assert.equal(Array.isArray(firstCoordinate) && firstCoordinate.length >= 2, true, "configured CityGeofence required");
        const point = Object.freeze({ longitude: firstCoordinate[0], latitude: firstCoordinate[1] });
        const speedingDetector = new SpeedingDetectorService(alertSettings, new CityGeofenceService(alertSettings), new SpeedingDetectorStateMachine());
        const inactivityDetector = new InactivityDetectorService(alertSettings, new InactivityDetectorStateMachine());
        assert.equal(settings.speedingConfirmationUpdates, 2, "smoke requires two-update speeding confirmation");
        const events = new PrismaAlertEventsRepository(database);
        const productionProcessor = new AlertEventProcessorService(new AlertEventsLifecycleService(events));
        let injectedEventFailure = true; const processingOrder = [];
        const faultingProcessor = {
          processSpeedingResult: async (detection) => {
            processingOrder.push({ observedAt: detection.observedAt, status: detection.status });
            if (injectedEventFailure && detection.status === "CONFIRMED") { injectedEventFailure = false; throw new Error("injected event persistence failure"); }
            return productionProcessor.processSpeedingResult(detection);
          },
          processInactivityResult: (detection) => productionProcessor.processInactivityResult(detection),
        };
        const evaluation = new AlertEvaluationService(speedingDetector, inactivityDetector, faultingProcessor);
        const durableRepository = new AlertObservationRepository(database);
        let injectMarkerFailure = false; let markerFailureObserved = false;
        const faultingRepository = {
          createOrFindObservation: (value) => durableRepository.createOrFindObservation(value),
          findPendingThrough: (vehicle, target) => durableRepository.findPendingThrough(vehicle, target),
          findLatestReplayEligibleObservation: (vehicle) => durableRepository.findLatestReplayEligibleObservation(vehicle),
          findReplayState: (vehicle, cutoff, through, speedingCount) => durableRepository.findReplayState(vehicle, cutoff, through, speedingCount),
          markProcessed: async (id, replayEligible) => { if (injectMarkerFailure) { injectMarkerFailure = false; markerFailureObserved = true; throw new Error("injected processed marker failure"); } await durableRepository.markProcessed(id, replayEligible); },
        };
        const ingestion = new AlertObservationIngestionService(faultingRepository, evaluation, alertSettings);
        const base = Date.UTC(2026, 7, 8, 14, 0, 0); const exceeding = settings.effectiveSpeedThresholds.cityKph + 0.125;
        const first = await ingestion.ingestObservation(observation(vehicleId, base, point, exceeding));
        const failedT1 = observation(vehicleId, base + 60_000, point, exceeding);
        let eventFailureObserved = false;
        try { await ingestion.ingestObservation(failedT1); } catch (error) { eventFailureObserved = error instanceof Error && error.message === "injected event persistence failure"; }
        assert.equal(eventFailureObserved, true);
        assert.equal(await transaction.alertEvaluationObservation.count({ where: { vehicleId, processedAt: null } }), 1);
        const newerT2 = observation(vehicleId, base + 120_000, point, exceeding);
        const drained = await ingestion.ingestObservation(newerT2);
        assert.deepEqual(processingOrder.slice(-2), [{ observedAt: failedT1.observedAt, status: "CONFIRMED" }, { observedAt: newerT2.observedAt, status: "ACTIVE" }]);
        assert.equal(await transaction.alertEvaluationObservation.count({ where: { vehicleId, processedAt: null } }), 0);
        await ingestion.ingestObservation(observation(vehicleId, base + 180_000, point, settings.effectiveSpeedThresholds.cityKph));
        await ingestion.ingestObservation(observation(vehicleId, base + 240_000, point, exceeding));
        injectMarkerFailure = true;
        const markerTarget = observation(vehicleId, base + 300_000, point, exceeding);
        try { await ingestion.ingestObservation(markerTarget); } catch (error) { assert.equal(error instanceof Error && error.message === "injected processed marker failure", true); }
        assert.equal(markerFailureObserved, true); assert.equal(await transaction.alertEvaluationObservation.count({ where: { vehicleId, processedAt: null } }), 1);
        const retry = await ingestion.ingestObservation(markerTarget);
        const duplicate = await ingestion.ingestObservation(markerTarget);
        const concurrent = await Promise.all([
          ingestion.ingestObservation(observation(vehicleId, base + 360_000, point, exceeding)),
          ingestion.ingestObservation(observation(vehicleId, base + 420_000, point, exceeding)),
        ]);
        assert.equal(first.journalOutcome, "CREATED"); assert.equal(first.processed, true);
        assert.equal(drained.evaluation.speeding.detection.status, "ACTIVE");
        assert.equal(retry.journalOutcome, "EXISTING"); assert.equal(retry.evaluation.speeding.processing.persistenceOutcome, "ALREADY_EXISTS");
        assert.equal(duplicate.journalOutcome, "ALREADY_PROCESSED"); assert.equal(duplicate.processingPerformed, false);
        assert.deepEqual(concurrent.map((item) => item.evaluation.speeding.detection.status), ["ACTIVE", "ACTIVE"]);
        assert.equal(ingestion.activeVehicleQueueCount(), 0);
        const freshSpeedingDetector = new SpeedingDetectorService(alertSettings, new CityGeofenceService(alertSettings), new SpeedingDetectorStateMachine());
        const freshInactivityDetector = new InactivityDetectorService(alertSettings, new InactivityDetectorStateMachine());
        const freshEvaluation = new AlertEvaluationService(freshSpeedingDetector, freshInactivityDetector, productionProcessor);
        const freshIngestion = new AlertObservationIngestionService(durableRepository, freshEvaluation, alertSettings);
        const lateInput = observation(vehicleId, base + 390_000, point, settings.effectiveSpeedThresholds.cityKph);
        const late = await freshIngestion.ingestObservation(lateInput);
        assert.equal(late.evaluation.speeding.detection.status, "IGNORED"); assert.equal(late.evaluation.speeding.detection.reason, "OUT_OF_ORDER"); assert.equal(late.evaluation.speeding.processing.action, "NONE");
        const lateJournal = await transaction.alertEvaluationObservation.findUnique({ where: { vehicleId_observedAt: { vehicleId, observedAt: new Date(lateInput.observedAt) } }, select: { id: true, processedAt: true, replayEligible: true } });
        assert.notEqual(lateJournal?.processedAt, null); assert.equal(lateJournal?.replayEligible, false);
        const replayFrontier = await durableRepository.findLatestReplayEligibleObservation(vehicleId);
        assert.notEqual(replayFrontier, null);
        const replayCutoff = new Date(replayFrontier.observedAt.getTime() - settings.inactivityDurationMinutes * 60_000);
        const replayState = await durableRepository.findReplayState(vehicleId, replayCutoff, replayFrontier.observedAt, settings.speedingConfirmationUpdates);
        assert.equal(replayState.some((row) => row.id === lateJournal.id), false);
        const secondRestartEvaluation = new AlertEvaluationService(
          new SpeedingDetectorService(alertSettings, new CityGeofenceService(alertSettings), new SpeedingDetectorStateMachine()),
          new InactivityDetectorService(alertSettings, new InactivityDetectorStateMachine()),
          productionProcessor,
        );
        const secondRestartIngestion = new AlertObservationIngestionService(durableRepository, secondRestartEvaluation, alertSettings);
        const afterRestart = await secondRestartIngestion.ingestObservation(observation(vehicleId, base + 480_000, point, exceeding));
        assert.equal(afterRestart.evaluation.speeding.detection.status, "ACTIVE");
        const transactionalJournal = await transaction.alertEvaluationObservation.count({ where: { vehicleId } });
        const transactionalEvents = await transaction.alertEvent.count({ where: { vehicleId } });
        const transactionalReceipts = await transaction.alertEventConfirmation.count({ where: { event: { vehicleId } } });
        assert.equal(transactionalJournal, 10); assert.equal(transactionalEvents, 2); assert.equal(transactionalReceipts, 2);
        report = { transactionalJournal, transactionalEvents, transactionalReceipts, eventFailureObserved, markerFailureObserved, retryOutcome: retry.evaluation.speeding.processing.persistenceOutcome, duplicateOutcome: duplicate.journalOutcome, lateOutcome: late.evaluation.speeding.detection.reason, lateReplayEligible: lateJournal.replayEligible, restartFutureStatus: afterRestart.evaluation.speeding.detection.status, queueCount: ingestion.activeVehicleQueueCount() };
        ingestion.clearAll(); throw new RollbackSignal();
      }, { timeout: 30_000 });
      throw new Error("alert ingestion smoke rollback missing");
    } catch (error) { if (!(error instanceof RollbackSignal)) throw error; }
    const temporaryJournal = await prisma.alertEvaluationObservation.count({ where: { vehicleId } });
    const temporaryEvents = await prisma.alertEvent.count({ where: { vehicleId } });
    const temporaryReceipts = await prisma.alertEventConfirmation.count({ where: { event: { vehicleId } } });
    const temporaryVehicles = await prisma.vehicle.count({ where: { id: vehicleId } });
    assert.deepEqual([temporaryJournal, temporaryEvents, temporaryReceipts, temporaryVehicles], [0, 0, 0, 0]);
    report = { ...report, temporaryJournal, temporaryEvents, temporaryReceipts, temporaryVehicles };
  } catch (error) {
    console.log(`alert ingestion smoke: failed (${error instanceof Error ? `${error.name}: ${error.message}` : "unknown"})`); process.exitCode = 1;
  } finally {
    globalThis.fetch = nativeFetch;
    try { await prisma.$disconnect(); applicationClosed = true; } catch { process.exitCode = 1; }
  }
  if (process.exitCode !== 1 && report) {
    console.log("alert ingestion smoke: passed");
    console.log(`transactional journal rows: ${report.transactionalJournal}`); console.log(`transactional AlertEvent rows: ${report.transactionalEvents}`); console.log(`transactional receipt rows: ${report.transactionalReceipts}`);
    console.log(`event persistence failure observed: ${report.eventFailureObserved}`);
    console.log(`processed marker failure observed: ${report.markerFailureObserved}`); console.log(`retry persistence outcome: ${report.retryOutcome}`); console.log(`duplicate outcome: ${report.duplicateOutcome}`); console.log(`active vehicle queues: ${report.queueCount}`);
    console.log(`fresh restart late outcome: ${report.lateOutcome}`); console.log(`late replay eligible: ${report.lateReplayEligible}`); console.log(`second restart future status: ${report.restartFutureStatus}`);
    console.log("transaction rollback: verified"); console.log(`temporary journal rows: ${report.temporaryJournal}`); console.log(`temporary AlertEvents: ${report.temporaryEvents}`); console.log(`temporary receipts: ${report.temporaryReceipts}`); console.log(`temporary Vehicle: ${report.temporaryVehicles}`);
    console.log(`external requests: ${externalRequests}`); console.log(`application closed: ${applicationClosed}`);
  }
}

if (require.main === module) void main().catch((error) => { console.log(`alert ingestion smoke: failed (${error instanceof Error ? error.name : "unknown"})`); process.exitCode = 1; });

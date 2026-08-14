#!/usr/bin/env node
// Canonical host-level one-shot monitor entry point (Node side). The shell
// wrapper (monitor-host.sh) owns the crash-released flock; this process reads
// the explicit env file, evaluates health, advances the incident state machine,
// and delivers operational alerts without ever leaking credentials.

import { existsSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { overallSeverity, runAllChecks } from "./lib/monitor-checks.mjs";
import { incidentFingerprints, toUtcTimestamp } from "./lib/monitor-config.mjs";
import { loadEnvironment, parseArguments, validateMonitorEnvironment } from "./lib/monitor-env.mjs";
import { buildIncidentMessage, buildRecoveryMessage, buildReminderMessage } from "./lib/monitor-message.mjs";
import { TelegramNotifier, deliverOperationalNotification } from "./lib/monitor-notify.mjs";
import { MonitorStateError, NOTIFICATION_KIND, planNotifications } from "./lib/monitor-state.mjs";
import {
  ensureStateDirectory,
  incidentStatePath,
  integrityCachePath,
  readIntegrityCache,
  readStateFile,
  writeIntegrityCacheAtomic,
  writeStateFileAtomic,
} from "./lib/monitor-state-file.mjs";
import { createProductionRuntime } from "./lib/monitor-runtime.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  process.stderr.write("monitor-host: " + message + "\n");
  process.exit(1);
}

function buildMessage(kind, fingerprints, config, utcTimestamp) {
  const facts = { fingerprints, siteHostname: config.siteHostname, appImageTag: config.appImageTag, utcTimestamp };
  if (kind === NOTIFICATION_KIND.INCIDENT) return buildIncidentMessage(facts);
  if (kind === NOTIFICATION_KIND.REMINDER) return buildReminderMessage(facts);
  if (kind === NOTIFICATION_KIND.RECOVERY) return buildRecoveryMessage(facts);
  return null;
}

function emitSummary({ now, startedAt, severity, results, fingerprints, planKind, delivered }) {
  const checks = {};
  for (const result of results) checks[result.checkId] = result.status;
  const summary = {
    timestamp: toUtcTimestamp(now),
    severity,
    incidentCount: fingerprints.length,
    checks,
    notification: planKind,
    delivered: delivered === undefined ? null : delivered,
    elapsedMs: Date.now() - startedAt,
  };
  process.stdout.write(JSON.stringify(summary) + "\n");
}

async function main() {
  const startedAt = Date.now();
  const now = startedAt;

  let suppliedPath;
  try {
    suppliedPath = parseArguments(process.argv.slice(2));
  } catch (error) {
    fail(error.message);
  }

  const envFile = path.resolve(repositoryRoot, suppliedPath);
  if (!existsSync(envFile) || !statSync(envFile).isFile()) fail("explicit env file is missing or not a regular file");

  let env;
  try {
    env = loadEnvironment(envFile);
  } catch {
    fail("explicit env file is malformed");
  }

  let config;
  try {
    config = validateMonitorEnvironment(env);
  } catch (error) {
    const fields = error && Array.isArray(error.issues) ? error.issues : [];
    fail("invalid monitor configuration" + (fields.length > 0 ? ": " + fields.join(",") : ""));
  }

  let stateDir;
  let stateFilePath;
  let cacheFilePath;
  try {
    stateDir = ensureStateDirectory(config.stateDir);
    stateFilePath = incidentStatePath(stateDir);
    cacheFilePath = integrityCachePath(stateDir);
  } catch (error) {
    if (error instanceof MonitorStateError) fail("monitor state directory is not usable");
    fail("could not prepare monitor state directory");
  }

  let previousState;
  let integrityCache;
  try {
    previousState = readStateFile(stateFilePath);
    integrityCache = readIntegrityCache(cacheFilePath);
  } catch (error) {
    if (error instanceof MonitorStateError) fail("monitor state is corrupt or unsafe to read");
    fail("could not read monitor state");
  }

  const runtime = createProductionRuntime({ repositoryRoot, envFile });
  const { results, cache } = await runAllChecks({ runtime, config, now, integrityCache });

  const fingerprints = incidentFingerprints(results);
  const severity = overallSeverity(results);
  const plan = planNotifications(previousState, fingerprints, { now, alertsEnabled: config.alertsEnabled });

  const delivery = await deliverOperationalNotification({
    plan,
    buildText: (kind, fingerprints) => buildMessage(kind, fingerprints, config, toUtcTimestamp(now)),
    send: (text) => new TelegramNotifier({ botToken: config.botToken, chatId: config.chatId }).sendMessage(text),
  });
  const nextState = delivery.nextState;
  const delivered = delivery.delivered;
  if (delivered === false) {
    process.stderr.write("monitor-host: operational notification delivery failed; will retry next run\n");
  }

  try {
    writeStateFileAtomic(stateFilePath, nextState);
  } catch {
    fail("could not write monitor state");
  }

  try {
    if (cache === null) {
      if (integrityCache !== null) unlinkSync(cacheFilePath);
    } else if (cache !== integrityCache) {
      writeIntegrityCacheAtomic(cacheFilePath, cache);
    }
  } catch {
    fail("could not write backup integrity cache");
  }

  emitSummary({ now, startedAt, severity, results, fingerprints, planKind: plan.kind, delivered });
  // A successfully-executed monitor exits 0 even when it detected an unhealthy
  // application state or a failed delivery; those are retried on later runs.
}

main().catch((error) => {
  fail("internal monitor failure");
});

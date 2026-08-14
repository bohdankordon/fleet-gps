// Safe operational message builders. Messages contain only approved facts:
// severity, incident/recovery kind, APP_IMAGE_TAG, SITE_ADDRESS hostname, stable
// check IDs, fixed descriptions and a UTC timestamp. No credentials, URLs with
// secrets, raw env, raw responses, or exception text may ever appear here.

import { CHECK_DESCRIPTIONS, isValidFingerprint } from "./monitor-config.mjs";

function fingerprintLine(fingerprint) {
  const separator = fingerprint.lastIndexOf(":");
  const checkId = fingerprint.slice(0, separator);
  const severity = fingerprint.slice(separator + 1);
  const description = CHECK_DESCRIPTIONS[checkId] ?? checkId;
  return checkId + " (" + severity + "): " + description;
}

function header(kind, { siteHostname, appImageTag, utcTimestamp }) {
  return ["[taxi-gps][" + kind + "]", "host: " + siteHostname, "tag: " + appImageTag, "time: " + utcTimestamp].join("\n");
}

export function buildIncidentMessage({ fingerprints, siteHostname, appImageTag, utcTimestamp }) {
  const lines = fingerprints.filter(isValidFingerprint).sort().map(fingerprintLine);
  return [header("INCIDENT", { siteHostname, appImageTag, utcTimestamp })].concat(lines).join("\n");
}

export function buildReminderMessage({ fingerprints, siteHostname, appImageTag, utcTimestamp }) {
  const lines = fingerprints.filter(isValidFingerprint).sort().map(fingerprintLine);
  return [header("REMINDER", { siteHostname, appImageTag, utcTimestamp })].concat(lines).join("\n");
}

export function buildRecoveryMessage({ fingerprints, siteHostname, appImageTag, utcTimestamp }) {
  const ids = fingerprints.filter(isValidFingerprint).sort().map((fingerprint) => fingerprint.slice(0, fingerprint.lastIndexOf(":")));
  return [header("RECOVERY", { siteHostname, appImageTag, utcTimestamp }), "recovered check IDs: " + (ids.length > 0 ? ids.join(", ") : "none")].join("\n");
}

export function buildTestMessage({ siteHostname, appImageTag, utcTimestamp }) {
  return [header("TEST", { siteHostname, appImageTag, utcTimestamp }), "This is a manually triggered operational TEST notification."].join("\n");
}

export function buildBackupFailureMessage({ tier, utcTimestamp }) {
  return ["[taxi-gps][BACKUP-FAILURE]", "tier: " + tier, "time: " + utcTimestamp, "A scheduled backup job failed."].join("\n");
}

export function buildMonitorSelfFailureMessage({ utcTimestamp }) {
  return ["[taxi-gps][MONITOR-SELF-FAILURE]", "time: " + utcTimestamp, "The host monitor itself failed to execute."].join("\n");
}

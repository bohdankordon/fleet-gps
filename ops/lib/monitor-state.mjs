// Pure incident state machine for the Stage 23 host monitor. No I/O, no secrets.
// The orchestrator performs the actual (async) delivery and commits the state
// returned here for success or failure, so delivery outcomes are never guessed.

import { MONITOR_THRESHOLDS, isValidFingerprint } from "./monitor-config.mjs";

export const STATE_VERSION = 1;

export const NOTIFICATION_KIND = Object.freeze({
  NONE: "none",
  INCIDENT: "incident",
  REMINDER: "reminder",
  RECOVERY: "recovery",
});

export class MonitorStateError extends Error {
  constructor(message = "Invalid monitor state") {
    super(message);
    this.name = "MonitorStateError";
  }
}

export function emptyState() {
  return Object.freeze({ version: STATE_VERSION, open: [], notifiedAt: null, notifiedSet: null });
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function setsEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function assertFingerprintArray(value, label) {
  if (!Array.isArray(value)) throw new MonitorStateError(label + " must be an array");
  for (const entry of value) {
    if (!isValidFingerprint(entry)) throw new MonitorStateError(label + " contains an invalid fingerprint");
  }
}

// Validate an in-memory state object. Malformed/corrupt state must FAIL rather
// than being silently discarded in a way that could suppress an incident.
export function normalizeState(value) {
  if (typeof value !== "object" || value === null) throw new MonitorStateError();
  if (value.version !== STATE_VERSION) throw new MonitorStateError();

  assertFingerprintArray(value.open, "open");
  const open = sortedUnique(value.open);

  let notifiedAt = null;
  if (value.notifiedAt !== null && value.notifiedAt !== undefined) {
    if (typeof value.notifiedAt !== "number" || !Number.isFinite(value.notifiedAt) || value.notifiedAt < 0) {
      throw new MonitorStateError("notifiedAt must be null or a non-negative timestamp");
    }
    notifiedAt = value.notifiedAt;
  }

  let notifiedSet = null;
  if (value.notifiedSet !== null && value.notifiedSet !== undefined) {
    assertFingerprintArray(value.notifiedSet, "notifiedSet");
    notifiedSet = sortedUnique(value.notifiedSet);
  }

  return Object.freeze({ version: STATE_VERSION, open, notifiedAt, notifiedSet });
}

function stamp(open, notifiedAt, notifiedSet) {
  return Object.freeze({ version: STATE_VERSION, open: sortedUnique(open), notifiedAt, notifiedSet: notifiedSet === null ? null : sortedUnique(notifiedSet) });
}

// Produce the notification decision and both possible next states for one run.
//
//   previous           normalized persisted state (or emptyState())
//   currentFingerprints sorted incident fingerprints detected this run
//   now                epoch milliseconds
//   alertsEnabled      OPS_ALERTS_ENABLED
//   reminderIntervalMs how often an unchanged incident repeats (default 6h)
export function planNotifications(previous, currentFingerprints, { now, alertsEnabled, reminderIntervalMs = MONITOR_THRESHOLDS.reminderIntervalMs }) {
  const state = normalizeState(previous);
  const open = state.open;
  const current = sortedUnique(currentFingerprints);
  const notifiedSet = state.notifiedSet;
  const notifiedAt = state.notifiedAt;

  if (!alertsEnabled) {
    // Zero transport. Never pretend an alert was delivered. Drop notification
    // markers so a later enable sends the current incident. Incident state is
    // independent of delivery, so it must still reflect the current checks.
    const next = stamp(current, null, null);
    return { kind: NOTIFICATION_KIND.NONE, reportFingerprints: current, nextOnSuccess: next, nextOnFailure: next };
  }

  if (open.length === 0 && current.length === 0) {
    const next = emptyState();
    return { kind: NOTIFICATION_KIND.NONE, reportFingerprints: [], nextOnSuccess: next, nextOnFailure: next };
  }

  if (open.length === 0 && current.length > 0) {
    return {
      kind: NOTIFICATION_KIND.INCIDENT,
      reportFingerprints: current,
      nextOnSuccess: stamp(current, now, current),
      nextOnFailure: emptyState(),
    };
  }

  if (open.length > 0 && current.length === 0) {
    return {
      kind: NOTIFICATION_KIND.RECOVERY,
      reportFingerprints: open,
      nextOnSuccess: emptyState(),
      nextOnFailure: stamp(open, state.notifiedAt, state.notifiedSet),
    };
  }

  // open.length > 0 && current.length > 0
  if (setsEqual(open, current)) {
    const alreadyNotifiedThisSet = notifiedSet !== null && setsEqual(notifiedSet, current);
    if (!alreadyNotifiedThisSet) {
      return {
        kind: NOTIFICATION_KIND.INCIDENT,
        reportFingerprints: current,
        nextOnSuccess: stamp(current, now, current),
        nextOnFailure: stamp(open, state.notifiedAt, state.notifiedSet),
      };
    }
    if (notifiedAt !== null && now - notifiedAt >= reminderIntervalMs) {
      return {
        kind: NOTIFICATION_KIND.REMINDER,
        reportFingerprints: current,
        nextOnSuccess: stamp(current, now, current),
        nextOnFailure: stamp(open, state.notifiedAt, state.notifiedSet),
      };
    }
    const unchanged = stamp(open, state.notifiedAt, state.notifiedSet);
    return { kind: NOTIFICATION_KIND.NONE, reportFingerprints: current, nextOnSuccess: unchanged, nextOnFailure: unchanged };
  }

  // Incident set materially changed (added/removed/escalated) while unhealthy.
  return {
    kind: NOTIFICATION_KIND.INCIDENT,
    reportFingerprints: current,
    nextOnSuccess: stamp(current, now, current),
    nextOnFailure: stamp(open, state.notifiedAt, state.notifiedSet),
  };
}

// Extract the sorted, deduplicated check IDs from fingerprints (used for safe
// recovery/incident summaries that never include variable error text).
export function checkIdsFromFingerprints(fingerprints) {
  const ids = [];
  for (const fingerprint of fingerprints) {
    if (!isValidFingerprint(fingerprint)) continue;
    ids.push(fingerprint.slice(0, fingerprint.lastIndexOf(":")));
  }
  return sortedUnique(ids);
}

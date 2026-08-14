import assert from "node:assert/strict";
import test from "node:test";
import { CHECK_IDS, SEVERITY, incidentFingerprint } from "../lib/monitor-config.mjs";
import { MonitorStateError, NOTIFICATION_KIND, emptyState, normalizeState, planNotifications } from "../lib/monitor-state.mjs";

const T0 = 1_800_000_000_000;
const SIX_HOURS = 6 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;

const WEB = CHECK_IDS.CONTAINER_WEB;
const API = CHECK_IDS.CONTAINER_API;
const DB_DISK = CHECK_IDS.DB_DISK;

function fp(id, severity) {
  return incidentFingerprint(id, severity);
}

function advance(previous, current, { now, alertsEnabled = true, delivered = true }) {
  const plan = planNotifications(previous, current, { now, alertsEnabled });
  let next;
  if (plan.kind === NOTIFICATION_KIND.NONE || delivered) next = plan.nextOnSuccess;
  else next = plan.nextOnFailure;
  return { plan, next };
}

test("healthy to healthy sends no alert", () => {
  const { plan, next } = advance(emptyState(), [], { now: T0 });
  assert.equal(plan.kind, NOTIFICATION_KIND.NONE);
  assert.deepEqual(next, emptyState());
});

test("first critical incident sends exactly one immediate incident alert", () => {
  const { plan, next } = advance(emptyState(), [fp(WEB, SEVERITY.CRITICAL)], { now: T0 });
  assert.equal(plan.kind, NOTIFICATION_KIND.INCIDENT);
  assert.deepEqual(plan.reportFingerprints, [fp(WEB, SEVERITY.CRITICAL)]);
  assert.deepEqual(next.open, [fp(WEB, SEVERITY.CRITICAL)]);
  assert.equal(next.notifiedAt, T0);
  assert.deepEqual(next.notifiedSet, [fp(WEB, SEVERITY.CRITICAL)]);
});

test("the same incident does not alert again across 60 minute-runs", () => {
  let state = emptyState();
  let first = advance(state, [fp(WEB, SEVERITY.CRITICAL)], { now: T0 });
  state = first.next;
  let alertCount = 1;
  for (let i = 1; i <= 60; i += 1) {
    const run = advance(state, [fp(WEB, SEVERITY.CRITICAL)], { now: T0 + i * MINUTE });
    if (run.plan.kind !== NOTIFICATION_KIND.NONE) alertCount += 1;
    state = run.next;
  }
  assert.equal(alertCount, 1);
});

test("an unchanged incident reaches 6h and sends exactly one reminder", () => {
  const started = advance(emptyState(), [fp(WEB, SEVERITY.CRITICAL)], { now: T0 }).next;
  const reminder = advance(started, [fp(WEB, SEVERITY.CRITICAL)], { now: T0 + SIX_HOURS });
  assert.equal(reminder.plan.kind, NOTIFICATION_KIND.REMINDER);
  assert.equal(reminder.next.notifiedAt, T0 + SIX_HOURS);
});

test("after a reminder an unchanged incident does not alert before another 6h", () => {
  let state = advance(emptyState(), [fp(WEB, SEVERITY.CRITICAL)], { now: T0 }).next;
  state = advance(state, [fp(WEB, SEVERITY.CRITICAL)], { now: T0 + SIX_HOURS }).next;
  const soon = advance(state, [fp(WEB, SEVERITY.CRITICAL)], { now: T0 + SIX_HOURS + MINUTE });
  assert.equal(soon.plan.kind, NOTIFICATION_KIND.NONE);
});

test("a change in the incident set alerts immediately", () => {
  const started = advance(emptyState(), [fp(WEB, SEVERITY.CRITICAL)], { now: T0 }).next;
  const changed = advance(started, [fp(WEB, SEVERITY.CRITICAL), fp(API, SEVERITY.CRITICAL)], { now: T0 + MINUTE });
  assert.equal(changed.plan.kind, NOTIFICATION_KIND.INCIDENT);
  assert.deepEqual(changed.plan.reportFingerprints, [fp(API, SEVERITY.CRITICAL), fp(WEB, SEVERITY.CRITICAL)]);
});

test("WARNING to CRITICAL escalation alerts immediately", () => {
  const started = advance(emptyState(), [fp(DB_DISK, SEVERITY.WARNING)], { now: T0 }).next;
  const escalated = advance(started, [fp(DB_DISK, SEVERITY.CRITICAL)], { now: T0 + MINUTE });
  assert.equal(escalated.plan.kind, NOTIFICATION_KIND.INCIDENT);
  assert.deepEqual(escalated.plan.reportFingerprints, [fp(DB_DISK, SEVERITY.CRITICAL)]);
});

test("unhealthy to healthy sends one recovery", () => {
  const started = advance(emptyState(), [fp(WEB, SEVERITY.CRITICAL)], { now: T0 }).next;
  const recovered = advance(started, [], { now: T0 + MINUTE });
  assert.equal(recovered.plan.kind, NOTIFICATION_KIND.RECOVERY);
  assert.deepEqual(recovered.plan.reportFingerprints, [fp(WEB, SEVERITY.CRITICAL)]);
  assert.deepEqual(recovered.next.open, []);
});

test("recovery remains deduplicated while healthy", () => {
  let state = advance(emptyState(), [fp(WEB, SEVERITY.CRITICAL)], { now: T0 }).next;
  state = advance(state, [], { now: T0 + MINUTE }).next;
  const next = advance(state, [], { now: T0 + 2 * MINUTE });
  assert.equal(next.plan.kind, NOTIFICATION_KIND.NONE);
});

test("failed incident delivery does not advance notification state", () => {
  const { plan, next } = advance(emptyState(), [fp(WEB, SEVERITY.CRITICAL)], { now: T0, delivered: false });
  assert.equal(plan.kind, NOTIFICATION_KIND.INCIDENT);
  assert.deepEqual(next.open, []);
  assert.equal(next.notifiedAt, null);
  assert.equal(next.notifiedSet, null);
});

test("a failed incident delivery retries on the next run", () => {
  const failed = advance(emptyState(), [fp(WEB, SEVERITY.CRITICAL)], { now: T0, delivered: false }).next;
  const retry = advance(failed, [fp(WEB, SEVERITY.CRITICAL)], { now: T0 + MINUTE, delivered: true });
  assert.equal(retry.plan.kind, NOTIFICATION_KIND.INCIDENT);
  assert.deepEqual(retry.next.open, [fp(WEB, SEVERITY.CRITICAL)]);
});

test("a failed recovery delivery retries recovery on the next run", () => {
  const started = advance(emptyState(), [fp(WEB, SEVERITY.CRITICAL)], { now: T0 }).next;
  const failed = advance(started, [], { now: T0 + MINUTE, delivered: false });
  assert.equal(failed.plan.kind, NOTIFICATION_KIND.RECOVERY);
  assert.deepEqual(failed.next.open, [fp(WEB, SEVERITY.CRITICAL)]);
  const retry = advance(failed.next, [], { now: T0 + 2 * MINUTE, delivered: true });
  assert.equal(retry.plan.kind, NOTIFICATION_KIND.RECOVERY);
  assert.deepEqual(retry.next.open, []);
});

test("disabled alerts never produce a notification decision", () => {
  const started = advance(emptyState(), [fp(WEB, SEVERITY.CRITICAL)], { now: T0 }).next;
  for (const current of [[], [fp(WEB, SEVERITY.CRITICAL)]]) {
    const plan = planNotifications(started, current, { now: T0 + MINUTE, alertsEnabled: false });
    assert.equal(plan.kind, NOTIFICATION_KIND.NONE);
  }
});

test("an incident while disabled is not falsely marked delivered", () => {
  const { plan, next } = advance(emptyState(), [fp(WEB, SEVERITY.CRITICAL)], { now: T0, alertsEnabled: false });
  assert.equal(plan.kind, NOTIFICATION_KIND.NONE);
  assert.equal(next.notifiedSet, null);
  assert.equal(next.notifiedAt, null);
});

test("enabling alerts while an incident is active sends the current incident", () => {
  const whileDisabled = advance(emptyState(), [fp(WEB, SEVERITY.CRITICAL)], { now: T0, alertsEnabled: false }).next;
  const enabled = advance(whileDisabled, [fp(WEB, SEVERITY.CRITICAL)], { now: T0 + MINUTE, alertsEnabled: true });
  assert.equal(enabled.plan.kind, NOTIFICATION_KIND.INCIDENT);

  // Also when it was delivered, then disabled, then re-enabled.
  const delivered = advance(emptyState(), [fp(WEB, SEVERITY.CRITICAL)], { now: T0 }).next;
  const disabledAgain = planNotifications(delivered, [fp(WEB, SEVERITY.CRITICAL)], { now: T0 + MINUTE, alertsEnabled: false });
  const reenabled = advance(disabledAgain.nextOnSuccess, [fp(WEB, SEVERITY.CRITICAL)], { now: T0 + 2 * MINUTE, alertsEnabled: true });
  assert.equal(reenabled.plan.kind, NOTIFICATION_KIND.INCIDENT);
});

test("malformed state fails safely instead of being discarded", () => {
  assert.throws(() => normalizeState(null), MonitorStateError);
  assert.throws(() => normalizeState({}), MonitorStateError);
  assert.throws(() => normalizeState({ version: 999, open: [], notifiedAt: null, notifiedSet: null }), MonitorStateError);
  assert.throws(() => normalizeState({ version: 1, open: ["NOT_A_CHECK:critical"], notifiedAt: null, notifiedSet: null }), MonitorStateError);
  assert.throws(() => normalizeState({ version: 1, open: [], notifiedAt: "yesterday", notifiedSet: null }), MonitorStateError);
  assert.throws(() => normalizeState({ version: 1, open: [], notifiedAt: null, notifiedSet: ["CONTAINER_WEB:healthy"] }), MonitorStateError);
});

test("normalized state is frozen and sorted", () => {
  const state = normalizeState({ version: 1, open: [fp(WEB, SEVERITY.CRITICAL), fp(API, SEVERITY.CRITICAL)], notifiedAt: T0, notifiedSet: [fp(WEB, SEVERITY.CRITICAL)] });
  assert.deepEqual(state.open, [fp(API, SEVERITY.CRITICAL), fp(WEB, SEVERITY.CRITICAL)]);
  assert.equal(Object.isFrozen(state), true);
});

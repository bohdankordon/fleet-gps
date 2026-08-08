import assert from "node:assert/strict";
import test from "node:test";
import type { ApiConfig } from "../../config/api-config";
import { AlertNotificationDispatcherService } from "./alert-notification-dispatcher.service";
import { AlertNotificationMessageFormatter } from "./alert-notification-message.formatter";
import { ALERT_NOTIFICATION_LEASE_MS, type AlertNotificationOutboxRepository } from "./alert-notification-outbox.repository";
import { AlertNotificationLostLeaseError, type ClaimedAlertNotification } from "./alert-notification-outbox.types";
import { alertNotificationRetryDelayMs } from "./alert-notification-retry.policy";
import { TELEGRAM_REQUEST_TIMEOUT_MS } from "./telegram-bot-notification.transport";
import { TelegramTransportError, type TelegramNotificationTransport } from "./telegram-notification.transport";

const TOKEN = "00000000-0000-4000-8000-000000000103";

function notification(index = 1, lockToken = TOKEN): ClaimedAlertNotification {
  const suffix = index.toString(16).padStart(12, "0");
  const eventSuffix = (index + 100).toString(16).padStart(12, "0");
  return Object.freeze({
    id: `00000000-0000-4000-8000-${suffix}`,
    alertEventId: `00000000-0000-4000-8000-${eventSuffix}`,
    kind: "ALERT_CONFIRMED",
    status: "SENDING",
    createdAt: new Date("2026-08-08T10:00:00.000Z"),
    availableAt: new Date("2026-08-08T10:00:00.000Z"),
    lockedAt: new Date("2026-08-08T10:00:00.000Z"),
    lockToken,
    attemptCount: index,
    lastAttemptAt: new Date("2026-08-08T10:00:00.000Z"),
    vehicleName: `Vehicle ${index}`,
    timezone: "Europe/Kyiv",
    confirmedAt: new Date("2026-08-08T10:00:00.000Z"),
    alertType: "SPEEDING",
    speedZone: "CITY",
    confirmationSpeedKph: 72,
    speedThresholdKph: 60,
  });
}

function config(enabled: boolean): ApiConfig {
  return { telegramNotifications: { enabled, botToken: enabled ? "token" : null, chatId: enabled ? "chat" : null } } as unknown as ApiConfig;
}

function dispatcher(repository: Partial<AlertNotificationOutboxRepository>, transport: TelegramNotificationTransport, enabled = true): AlertNotificationDispatcherService {
  return new AlertNotificationDispatcherService(repository as AlertNotificationOutboxRepository, new AlertNotificationMessageFormatter(), transport, config(enabled));
}

type Deferred = { promise: Promise<void>; resolve(): void };
function deferred(): Deferred {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

test("disabled dispatcher returns a safe zero result with zero claims and zero network", async () => {
  let claims = 0;
  let sends = 0;
  const service = dispatcher({ claimNextBatch: async () => { claims += 1; return []; } }, { sendAlertConfirmed: async () => { sends += 1; } }, false);
  assert.deepEqual(await service.dispatchBatch(10), { claimed: 0, sent: 0, retryScheduled: 0, failedPermanent: 0, lostLease: 0 });
  assert.equal(claims, 0);
  assert.equal(sends, 0);
});

test("dispatchBatch validates its logical limit before any DB or network operation", async () => {
  let claims = 0;
  let sends = 0;
  const service = dispatcher({ claimNextBatch: async () => { claims += 1; return []; } }, { sendAlertConfirmed: async () => { sends += 1; } }, false);
  for (const limit of [0, -1, 1.5, 101, Number.NaN]) await assert.rejects(service.dispatchBatch(limit), RangeError);
  assert.equal(claims, 0);
  assert.equal(sends, 0);
});

test("an already-aborted signal stops before the first claim but never bypasses limit validation", async () => {
  let claims = 0;
  let sends = 0;
  const controller = new AbortController();
  controller.abort();
  const service = dispatcher(
    { claimNextBatch: async () => { claims += 1; return []; } },
    { sendAlertConfirmed: async () => { sends += 1; } },
  );

  assert.deepEqual(await service.dispatchBatch(20, controller.signal), { claimed: 0, sent: 0, retryScheduled: 0, failedPermanent: 0, lostLease: 0 });
  await assert.rejects(service.dispatchBatch(0, controller.signal), RangeError);
  assert.equal(claims, 0);
  assert.equal(sends, 0);
});

test("abort during the current send completes markSent and prevents the next claim", async () => {
  const controller = new AbortController();
  const sendStarted = deferred();
  const finishSend = deferred();
  let claims = 0;
  let sentTransitions = 0;
  const service = dispatcher({
    claimNextBatch: async (_limit: number, lockToken: string) => {
      claims += 1;
      return [notification(claims, lockToken)];
    },
    markSent: async () => { sentTransitions += 1; },
  }, { sendAlertConfirmed: async () => { sendStarted.resolve(); await finishSend.promise; } });

  const running = service.dispatchBatch(20, controller.signal);
  await sendStarted.promise;
  controller.abort();
  finishSend.resolve();

  assert.deepEqual(await running, { claimed: 1, sent: 1, retryScheduled: 0, failedPermanent: 0, lostLease: 0 });
  assert.equal(claims, 1);
  assert.equal(sentTransitions, 1);
});

test("abort during a failing current send durably schedules retry or marks permanent failure before stopping", async () => {
  for (const expected of [
    { error: new TelegramTransportError("HTTP_5XX", true), transition: "retry", result: { claimed: 1, sent: 0, retryScheduled: 1, failedPermanent: 0, lostLease: 0 } },
    { error: new TelegramTransportError("HTTP_4XX", false), transition: "failed", result: { claimed: 1, sent: 0, retryScheduled: 0, failedPermanent: 1, lostLease: 0 } },
  ] as const) {
    const controller = new AbortController();
    const sendStarted = deferred();
    const finishSend = deferred();
    const transitions: string[] = [];
    let claims = 0;
    const service = dispatcher({
      claimNextBatch: async (_limit: number, lockToken: string) => {
        claims += 1;
        return [notification(claims, lockToken)];
      },
      releaseForRetry: async () => { transitions.push("retry"); },
      markFailed: async () => { transitions.push("failed"); },
    }, { sendAlertConfirmed: async () => {
      sendStarted.resolve();
      await finishSend.promise;
      throw expected.error;
    } });

    const running = service.dispatchBatch(20, controller.signal);
    await sendStarted.promise;
    controller.abort();
    finishSend.resolve();

    assert.deepEqual(await running, expected.result);
    assert.equal(claims, 1);
    assert.deepEqual(transitions, [expected.transition]);
  }
});

test("dispatchBatch leases each row just in time after the previous row is fully SENT", async () => {
  const calls: string[] = [];
  const lockTokens: string[] = [];
  let next = 1;
  const repository = {
    claimNextBatch: async (limit: number, lockToken: string) => {
      assert.equal(limit, 1);
      calls.push(`claim-${next}`);
      lockTokens.push(lockToken);
      return [notification(next++, lockToken)];
    },
    markSent: async (_id: string, lockToken: string) => { calls.push(`sent-${lockTokens.indexOf(lockToken) + 1}`); },
  };
  const transport = { sendAlertConfirmed: async (message: string) => { calls.push(`send-${message.match(/Vehicle (\d+)/)?.[1]}`); } };

  const outcome = await dispatcher(repository, transport).dispatchBatch(3);

  assert.deepEqual(outcome, { claimed: 3, sent: 3, retryScheduled: 0, failedPermanent: 0, lostLease: 0 });
  assert.deepEqual(calls, ["claim-1", "send-1", "sent-1", "claim-2", "send-2", "sent-2", "claim-3", "send-3", "sent-3"]);
  assert.equal(new Set(lockTokens).size, 3);
});

test("empty JIT claim ends a large logical batch without extra DB attempts", async () => {
  let claims = 0;
  let sends = 0;
  const repository = {
    claimNextBatch: async (_limit: number, lockToken: string) => {
      claims += 1;
      return claims === 1 ? [notification(1, lockToken)] : [];
    },
    markSent: async () => undefined,
  };
  const outcome = await dispatcher(repository, { sendAlertConfirmed: async () => { sends += 1; } }).dispatchBatch(100);
  assert.deepEqual(outcome, { claimed: 1, sent: 1, retryScheduled: 0, failedPermanent: 0, lostLease: 0 });
  assert.equal(claims, 2);
  assert.equal(sends, 1);
});

test("generic markSent DB failure propagates without preclaiming future rows", async () => {
  const databaseFailure = new Error("database mark-sent failure");
  let claims = 0;
  let sends = 0;
  const service = dispatcher({
    claimNextBatch: async (_limit: number, lockToken: string) => { claims += 1; return [notification(claims, lockToken)]; },
    markSent: async () => { throw databaseFailure; },
  }, { sendAlertConfirmed: async () => { sends += 1; } });
  await assert.rejects(service.dispatchBatch(3), (error: unknown) => error === databaseFailure);
  assert.equal(claims, 1);
  assert.equal(sends, 1);
});

test("retryable, successful, and permanent deliveries each finish before the next JIT claim", async () => {
  const calls: string[] = [];
  let next = 1;
  const repository = {
    claimNextBatch: async (_limit: number, lockToken: string) => { calls.push(`claim-${next}`); return [notification(next++, lockToken)]; },
    releaseForRetry: async () => { calls.push("release-1"); },
    markSent: async () => { calls.push("sent-2"); },
    markFailed: async () => { calls.push("failed-3"); },
  };
  let send = 0;
  const transport = { sendAlertConfirmed: async () => {
    send += 1;
    calls.push(`send-${send}`);
    if (send === 1) throw new TelegramTransportError("HTTP_5XX", true);
    if (send === 3) throw new TelegramTransportError("HTTP_4XX", false);
  } };
  const outcome = await dispatcher(repository, transport).dispatchBatch(3);
  assert.deepEqual(outcome, { claimed: 3, sent: 1, retryScheduled: 1, failedPermanent: 1, lostLease: 0 });
  assert.deepEqual(calls, ["claim-1", "send-1", "release-1", "claim-2", "send-2", "sent-2", "claim-3", "send-3", "failed-3"]);
});

test("typed stale lease is counted without hiding unrelated state/database failures", async () => {
  const stale = dispatcher({ claimNextBatch: async (_limit: number, token: string) => [notification(1, token)], markSent: async () => { throw new AlertNotificationLostLeaseError(); } }, { sendAlertConfirmed: async () => undefined });
  assert.deepEqual(await stale.dispatchBatch(1), { claimed: 1, sent: 0, retryScheduled: 0, failedPermanent: 0, lostLease: 1 });

  const unexpected = new Error("unexpected repository failure");
  const broken = dispatcher({ claimNextBatch: async (_limit: number, token: string) => [notification(1, token)], markSent: async () => { throw unexpected; } }, { sendAlertConfirmed: async () => undefined });
  await assert.rejects(broken.dispatchBatch(1), (error: unknown) => error === unexpected);
});

test("two concurrent dispatchers can claim one pending intent only once", async () => {
  let available = true;
  let sends = 0;
  let sentTransitions = 0;
  const repository = {
    claimNextBatch: async (_limit: number, lockToken: string) => {
      if (!available) return [];
      available = false;
      await new Promise<void>((resolve) => setImmediate(resolve));
      return [notification(1, lockToken)];
    },
    markSent: async () => { sentTransitions += 1; },
  };
  const transport = { sendAlertConfirmed: async () => { sends += 1; } };
  const [first, second] = await Promise.all([dispatcher(repository, transport).dispatchBatch(1), dispatcher(repository, transport).dispatchBatch(1)]);
  assert.equal(first.claimed + second.claimed, 1);
  assert.equal(first.sent + second.sent, 1);
  assert.equal(sends, 1);
  assert.equal(sentTransitions, 1);
});

test("blocked worker owns only its current row while another worker claims the next row", async () => {
  type State = { status: "PENDING" | "SENDING" | "SENT"; owner: string | null };
  const states: State[] = [1, 2, 3].map(() => ({ status: "PENDING", owner: null }));
  const calls: string[] = [];
  const repository = {
    claimNextBatch: async (_limit: number, lockToken: string) => {
      const index = states.findIndex((row) => row.status === "PENDING");
      if (index < 0) { calls.push("claim-empty"); return []; }
      states[index] = { status: "SENDING", owner: lockToken };
      calls.push(`claim-${index + 1}`);
      return [notification(index + 1, lockToken)];
    },
    markSent: async (id: string, lockToken: string) => {
      const index = [1, 2, 3].findIndex((value) => notification(value).id === id);
      assert.equal(states[index]?.owner, lockToken);
      states[index] = { status: "SENT", owner: null };
      calls.push(`sent-${index + 1}`);
    },
  };
  let unblockFirst: (() => void) | undefined;
  const firstBlocked = new Promise<void>((resolve) => { unblockFirst = resolve; });
  let announceBlocked: (() => void) | undefined;
  const blocked = new Promise<void>((resolve) => { announceBlocked = resolve; });
  const workerA = dispatcher(repository, { sendAlertConfirmed: async (message) => {
    const row = message.match(/Vehicle (\d+)/)?.[1];
    calls.push(`send-A-${row}`);
    if (row === "1") { announceBlocked?.(); await firstBlocked; }
  } });
  const workerB = dispatcher(repository, { sendAlertConfirmed: async (message) => { calls.push(`send-B-${message.match(/Vehicle (\d+)/)?.[1]}`); } });

  const resultA = workerA.dispatchBatch(3);
  await blocked;
  assert.deepEqual(states.map((row) => row.status), ["SENDING", "PENDING", "PENDING"]);
  const resultB = await workerB.dispatchBatch(1);
  assert.deepEqual(states.map((row) => row.status), ["SENDING", "SENT", "PENDING"]);
  unblockFirst?.();
  const completedA = await resultA;

  assert.deepEqual(resultB, { claimed: 1, sent: 1, retryScheduled: 0, failedPermanent: 0, lostLease: 0 });
  assert.deepEqual(completedA, { claimed: 2, sent: 2, retryScheduled: 0, failedPermanent: 0, lostLease: 0 });
  assert.equal(calls.includes("send-A-2"), false);
  assert.equal(calls.includes("send-B-2"), true);
  assert.equal(calls.includes("send-A-3"), true);
});

test("five-minute lease has a wide safety margin over one Telegram HTTP timeout", () => {
  assert.ok(ALERT_NOTIFICATION_LEASE_MS > TELEGRAM_REQUEST_TIMEOUT_MS);
  assert.ok(ALERT_NOTIFICATION_LEASE_MS >= TELEGRAM_REQUEST_TIMEOUT_MS * 10);
});

test("bounded exponential retry policy is deterministic", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 20].map(alertNotificationRetryDelayMs), [1, 2, 4, 8, 16, 32, 60, 60].map((minutes) => minutes * 60_000));
  assert.throws(() => alertNotificationRetryDelayMs(0), RangeError);
});
